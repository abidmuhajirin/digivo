const GOOGLE_HOST = /^(?:[a-z0-9-]+\.)*google\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/;
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

// Kartu hanya boleh mengarah ke Google. Tanpa batas ini, kartu bisa dipakai mengarahkan pelanggan ke situs penipuan.
export function isAllowedHost(host) {
  const clean = host.toLowerCase();
  return GOOGLE_HOST.test(clean) || clean === 'g.page' || SHORT_HOSTS.has(clean);
}

function parseUrl(raw) {
  let text = String(raw ?? '').trim();
  // Link dari fitur "Bagikan" Google Maps sering terbawa nama dan alamat di depannya.
  const found = text.match(/https?:\/\/\S+/);
  if (found) text = found[0];
  else if (/^(g\.page|maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.)?google\.)/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export const reviewUrlForPlace = (placeId) =>
  `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

// Place ID "ChIJ..." adalah protobuf dari dua angka hex di URL Google Maps.
// Google tidak mendokumentasikan format ini, jadi link Maps biasa tetap jadi cadangan.
export function placeIdFromFeature(high, low) {
  const bytes = Buffer.alloc(20);
  bytes.set([0x0a, 0x12, 0x09]);
  bytes.writeBigUInt64LE(BigInt(high), 3);
  bytes[11] = 0x11;
  bytes.writeBigUInt64LE(BigInt(low), 12);
  return bytes.toString('base64url');
}

function featureFromUrl(href) {
  let text = href;
  try {
    text = decodeURIComponent(href);
  } catch {
    // Pakai URL apa adanya bila ada persen yang tidak valid.
  }
  return text.match(/(0x[0-9a-f]{1,16}):(0x[0-9a-f]{1,16})/i);
}

function nameFromPath(pathname) {
  const match = pathname.match(/\/maps\/place\/([^/]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\+/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

// Mengenali link tanpa jaringan. kind: review = langsung form ulasan, maps = halaman tempat, short = perlu dibuka dulu.
export function classifyLink(raw) {
  const url = parseUrl(raw);
  if (!url) return { ok: false, error: 'Itu bukan link yang valid. Tempel link dari Google Maps.' };
  if (!isAllowedHost(url.hostname)) {
    return { ok: false, error: 'Hanya link Google yang diterima, misalnya dari Google Maps atau profil bisnis Google.' };
  }
  url.protocol = 'https:';

  // Halaman persetujuan cookie dan halaman cek bot Google membawa tujuan asli di parameter continue.
  const continued = url.searchParams.get('continue');
  if (continued && continued !== url.href) return classifyLink(continued);

  const placeId = url.searchParams.get('placeid') || url.searchParams.get('place_id')
    || url.searchParams.get('q')?.match(/^place_id:(.+)$/)?.[1]
    || url.searchParams.get('query_place_id');
  if (placeId) return { ok: true, kind: 'review', url: reviewUrlForPlace(placeId), placeId };

  if (url.hostname === 'g.page') {
    const shortName = url.pathname.match(/^\/r\/([^/]+)/)?.[1];
    if (shortName) return { ok: true, kind: 'review', url: `https://g.page/r/${shortName}/review` };
    return { ok: true, kind: 'maps', url: url.href };
  }
  if (SHORT_HOSTS.has(url.hostname)) return { ok: true, kind: 'short', url: url.href };
  // Angka hex tempat bisa muncul di mana saja, termasuk di link Maps yang dibungkus halaman lain.
  const feature = featureFromUrl(url.href);
  if (feature) {
    const id = placeIdFromFeature(feature[1], feature[2]);
    return { ok: true, kind: 'review', url: reviewUrlForPlace(id), placeId: id, nameGuess: nameFromPath(url.pathname) };
  }
  if (url.pathname.includes('/maps') || url.searchParams.has('cid')) {
    return { ok: true, kind: 'maps', url: url.href, nameGuess: nameFromPath(url.pathname) };
  }
  return { ok: false, error: 'Link ini bukan halaman bisnis. Buka bisnis di Google Maps, lalu salin link Bagikan.', seen: url.hostname + url.pathname };
}

async function followShortLink(start, fetchImpl) {
  let current = start;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return current;
    const next = new URL(location, current);
    if (!isAllowedHost(next.hostname)) throw new Error('redirect keluar dari Google');
    current = next.href;
  }
  return current;
}

export async function searchPlaces(query, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'id', regionCode: 'ID', pageSize: 5 }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const data = await res.json();
  return (data.places ?? []).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text ?? '',
    address: place.formattedAddress ?? '',
  }));
}

export async function fetchPlaceStats(placeId, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'rating,userRatingCount' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const data = await res.json();
  return { count: data.userRatingCount ?? 0, rating: data.rating ?? null };
}

// Mengubah link apa pun menjadi tujuan terbaik yang bisa dicapai.
export async function resolveLink(raw, { apiKey, fetchImpl = fetch } = {}) {
  let result = classifyLink(raw);
  if (!result.ok) return result;

  if (result.kind === 'short') {
    try {
      result = classifyLink(await followShortLink(result.url, fetchImpl));
    } catch {
      // Link pendek yang tidak bisa diverifikasi tidak disimpan, karena bisa dipakai mengalihkan ke situs phishing.
      return { ok: false, error: 'Link pendek tidak bisa diperiksa. Buka link di browser, lalu salin alamat lengkapnya.' };
    }
    if (!result.ok) return result;
    if (result.kind === 'short') {
      return { ok: false, error: 'Link pendek tidak bisa diperiksa. Buka link di browser, lalu salin alamat lengkapnya.' };
    }
  }

  if (result.kind === 'maps' && result.nameGuess && apiKey) {
    try {
      const [first] = await searchPlaces(result.nameGuess, apiKey, fetchImpl);
      if (first) return { ok: true, kind: 'review', url: reviewUrlForPlace(first.placeId), placeId: first.placeId, nameGuess: first.name };
    } catch {
      // Tetap pakai link Maps bila Places API gagal.
    }
  }
  return result;
}
