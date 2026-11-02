import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createBatch, normalizeCode } from './db.js';
import {
  allow, createSession, destroySession, hashPin, pinProblem, randomPin, readSession, safeEqual, verifyPin,
} from './security.js';
import { fetchPlaceStats, resolveLink, reviewUrlForPlace, searchPlaces } from './google.js';
import { cardUrls, renderPrintSheet } from './print.js';

const DAY = 86_400_000;
const WIB_SECONDS = 7 * 3600;
const OWNER_COOKIE = 'tu_owner';
const ADMIN_COOKIE = 'tu_admin';
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 15 * 60_000;
const TRIAL_DAYS = 7;
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const wibDay = (ts) => new Date(ts + WIB_SECONDS * 1000).toISOString().slice(0, 10);

export const isPro = (business) =>
  business.plan === 'pro' && (business.pro_until == null || business.pro_until > Date.now());

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanReviews({ reviewCount, rating }) {
  const text = String(reviewCount ?? '').trim();
  if (!text) return null;
  const count = Number(text);
  if (!Number.isInteger(count) || count < 0 || count > 1_000_000) return { error: 'Jumlah ulasan harus angka bulat.' };
  const ratingText = String(rating ?? '').trim().replace(',', '.');
  const score = ratingText ? Number(ratingText) : null;
  if (score !== null && !(score >= 1 && score <= 5)) return { error: 'Rating harus antara 1 dan 5.' };
  return { count, rating: score };
}

function cleanHttpsUrl(value) {
  const text = cleanText(value, 500);
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const first = (c, sql, ...args) => c.env.DB.prepare(sql).bind(...args).first();
const run = (c, sql, ...args) => c.env.DB.prepare(sql).bind(...args).run();
const all = async (c, sql, ...args) => (await c.env.DB.prepare(sql).bind(...args).all()).results;
const body = (c) => c.req.json().catch(() => ({}));
const clientIp = (c) => c.req.header('cf-connecting-ip') ?? 'local';

const cardByCode = (c, code) => first(c, 'SELECT * FROM cards WHERE code = ?', normalizeCode(code));
const businessById = (c, id) => first(c, 'SELECT * FROM businesses WHERE id = ?', id);
const logEvent = (c, card, type, source) => run(c,
  'INSERT INTO events (card_id, business_id, type, source, ts) VALUES (?, ?, ?, ?, ?)',
  card.id, card.business_id, type, source, Date.now());
const insertSnapshot = (c, businessId, count, rating, source) => run(c,
  'INSERT INTO review_snapshots (business_id, review_count, rating, source, taken_at) VALUES (?, ?, ?, ?, ?)',
  businessId, count, rating, source, Date.now());

const baseUrlOf = (c) => (c.env.BASE_URL ?? new URL(c.req.url).origin).replace(/\/$/, '');
const iterations = (c) => Number(c.env.PBKDF2_ITER ?? 10_000);

function startCookie(c, name, token, maxAgeMs) {
  setCookie(c, name, token, {
    httpOnly: true, sameSite: 'Lax', secure: baseUrlOf(c).startsWith('https://'), maxAge: maxAgeMs / 1000, path: '/',
  });
}

async function sendPage(c, file, status = 200) {
  const res = await c.env.ASSETS.fetch(new Request(new URL(`/pages/${file}`, c.req.url)));
  const html = (await res.text())
    .replaceAll('{{BRAND}}', esc(c.env.BRAND ?? 'TapUlas'))
    .replaceAll('{{ADMIN_WA}}', esc(c.env.ADMIN_WA ?? ''));
  return c.html(html, status);
}

async function tooMany(c, scope, max, windowMs, key = clientIp(c)) {
  if (await allow(c.env.DB, `${scope}:${key}`, max, windowMs)) return null;
  return c.json({ error: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.' }, 429);
}

async function snapshotFromGoogle(c, businessId, placeId) {
  const apiKey = c.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !placeId) return false;
  try {
    const { count, rating } = await fetchPlaceStats(placeId, apiKey, c.env.fetchImpl);
    await insertSnapshot(c, businessId, count, rating, 'google');
    return true;
  } catch (error) {
    console.error('Gagal mengambil jumlah ulasan:', error.message);
    return false;
  }
}

function destination(c, { link, placeId }) {
  if (placeId && /^[\w-]{10,}$/.test(placeId)) {
    return { ok: true, kind: 'review', url: reviewUrlForPlace(placeId), placeId };
  }
  return resolveLink(link, { apiKey: c.env.GOOGLE_PLACES_API_KEY, fetchImpl: c.env.fetchImpl });
}

function publicBusiness(c, business) {
  return {
    name: business.name,
    reviewUrl: business.review_url,
    linkKind: business.link_kind,
    plan: isPro(business) ? 'pro' : 'basic',
    isTrial: isPro(business) && Boolean(business.is_trial),
    proUntil: business.pro_until,
    reviewTracking: Boolean(c.env.GOOGLE_PLACES_API_KEY && business.place_id),
    mode: business.mode,
    tagline: business.tagline,
    whatsapp: business.whatsapp,
    instagram: business.instagram,
    menuUrl: business.menu_url,
    isDemo: Boolean(business.is_demo),
  };
}

const defaultDestination = async (c) => (await first(c, "SELECT value FROM settings WHERE key = 'default_url'"))?.value ?? null;

// Dipakai aktivasi oleh pemilik dan oleh admin, supaya trial dan titik awal Before-After selalu sama.
async function activateCard(c, card, { name, target, pin, baseline }) {
  // Trial hanya sekali per kartu, supaya reset tidak jadi jalan memperpanjang Pro.
  const trial = !card.trial_used;
  const now = Date.now();
  const inserted = await run(c, `
    INSERT INTO businesses (name, review_url, link_kind, place_id, pin_hash, plan, pro_until, is_trial, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    name, target.url, target.kind, target.placeId ?? null, await hashPin(pin, iterations(c)),
    trial ? 'pro' : 'basic', trial ? now + TRIAL_DAYS * DAY : null, trial ? 1 : 0, now);
  const businessId = inserted.meta.last_row_id;
  await run(c, 'UPDATE cards SET business_id = ?, activated_at = ?, trial_used = 1 WHERE id = ?', businessId, now, card.id);

  const tracked = await snapshotFromGoogle(c, businessId, target.placeId);
  if (!tracked && baseline) await insertSnapshot(c, businessId, baseline.count, baseline.rating, 'manual');
  return { businessId, trial };
}

// Tujuan baru berarti tempat lain, jadi angka Before lama tidak bisa dibandingkan.
async function resetBeforeAfter(c, businessId, placeId) {
  await run(c, 'DELETE FROM review_snapshots WHERE business_id = ?', businessId);
  await snapshotFromGoogle(c, businessId, placeId);
}

async function requireOwner(c, next) {
  const session = await readSession(c.env.DB, getCookie(c, OWNER_COOKIE), 'owner');
  const business = session && await businessById(c, session.business_id);
  if (!business) return c.json({ error: 'Sesi berakhir. Masuk lagi dengan kode kartu dan PIN.' }, 401);
  c.set('business', business);
  await next();
}

async function requirePro(c, next) {
  if (!isPro(c.get('business'))) return c.json({ error: 'Fitur ini tersedia di paket Pro.' }, 402);
  await next();
}

async function requireAdmin(c, next) {
  if (!await readSession(c.env.DB, getCookie(c, ADMIN_COOKIE), 'admin')) {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Sesi admin berakhir.' }, 401);
    return c.redirect('/admin');
  }
  await next();
}

async function beforeAfter(c, businessId) {
  const rows = await all(c, `
    SELECT review_count AS count, rating, source, taken_at AS at
    FROM review_snapshots WHERE business_id = ? ORDER BY taken_at, id`, businessId);
  if (!rows.length) return null;
  const before = rows[0];
  const latest = rows.at(-1);
  return { before, after: rows.length > 1 ? latest : null, gained: latest.count - before.count };
}

function miniPage(business, card, source) {
  const whatsapp = business.whatsapp.replace(/\D/g, '');
  const links = [
    whatsapp && `<a class="row-link" href="https://wa.me/${esc(whatsapp)}" rel="noopener"><svg class="i"><use href="/icons.svg#chat"/></svg>Chat WhatsApp</a>`,
    business.instagram && `<a class="row-link" href="https://instagram.com/${esc(business.instagram.replace(/^@/, ''))}" rel="noopener"><svg class="i"><use href="/icons.svg#link"/></svg>Instagram</a>`,
    business.menu_url && `<a class="row-link" href="${esc(business.menu_url)}" rel="noopener"><svg class="i"><use href="/icons.svg#link"/></svg>Lihat menu atau katalog</a>`,
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F6F2EC"><meta name="robots" content="noindex"><title>${esc(business.name)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/app.css"></head>
<body class="page-mini" data-code="${esc(card.code)}">
<header class="sheet sheet-mini">
  <div class="initial" aria-hidden="true">${esc(business.name.slice(0, 1).toUpperCase())}</div>
  <h1>${esc(business.name)}</h1>
  <p>${esc(business.tagline || 'Terima kasih sudah berkunjung.')}</p>
  <a class="cta" href="/u/${esc(card.code)}/ulas?s=${source}">Tulis ulasan di Google</a>
</header>
<main class="wrap stack">
  <section class="panel">
    <h2>Ada yang perlu kami tahu?</h2>
    <p class="muted">Pesan ini hanya dibaca pemilik, dan tidak tampil di Google.</p>
    <form id="fb" class="stack-sm">
      <label class="field"><span>Pesan</span><textarea name="message" rows="3" maxlength="1000" required placeholder="Tulis masukan Anda di sini"></textarea></label>
      <label class="field"><span>Kontak (opsional)</span><input name="contact" maxlength="120" placeholder="Nomor WhatsApp atau email" autocomplete="off"></label>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="form-msg" role="status"></p>
      <button class="btn" type="submit">Kirim ke pemilik</button>
    </form>
  </section>
  ${links ? `<nav class="panel link-list" aria-label="Tautan ${esc(business.name)}">${links}</nav>` : ''}
</main>
<script src="/js/mini.js" defer></script>
</body></html>`;
}

export function createApp() {
  const app = new Hono();
  const recentTaps = new Map();

  app.use(async (c, next) => {
    await next();
    c.res.headers.set('Content-Security-Policy', CSP);
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  // ---------- Tap dan QR ----------

  // Pemindai QR dan peramban kadang memuat link dua kali. Satu perangkat dihitung sekali per 20 detik.
  // Catatan ini hanya di memori instance, jadi tidak ada data perangkat yang tersimpan.
  function isDuplicateTap(c, cardId, source) {
    const key = `${cardId}|${source}|${clientIp(c)}|${c.req.header('user-agent') ?? ''}`;
    const now = Date.now();
    const last = recentTaps.get(key);
    if (recentTaps.size > 5_000) recentTaps.clear();
    recentTaps.set(key, now);
    return last != null && now - last < 20_000;
  }

  const handleTap = (source) => async (c) => {
    const card = await cardByCode(c, c.req.param('code'));
    if (!card) return sendPage(c, 'not-found.html', 404);
    if (!card.business_id) {
      // Kartu belum terjual ikut tujuan bawaan. Aktivasi mandiri tetap lewat halaman depan dengan kode kartu.
      c.header('Cache-Control', 'no-store');
      return c.redirect(await defaultDestination(c) ?? `/aktivasi/${card.code}`, 302);
    }

    const business = await businessById(c, card.business_id);
    if (!isDuplicateTap(c, card.id, source)) await logEvent(c, card, 'tap', source);

    // 302 wajib. 301 disimpan ponsel, sehingga kartu tidak bisa dialihkan lagi.
    c.header('Cache-Control', 'no-store');
    if (isPro(business) && business.mode === 'page') return c.redirect(`/u/${card.code}?s=${source}`, 302);
    return c.redirect(business.review_url, 302);
  };
  app.get('/t/:code', handleTap('nfc'));
  app.get('/q/:code', handleTap('qr'));

  app.get('/u/:code', async (c) => {
    const card = await cardByCode(c, c.req.param('code'));
    if (!card?.business_id) return sendPage(c, 'not-found.html', 404);
    const business = await businessById(c, card.business_id);
    if (!isPro(business)) return c.redirect(business.review_url, 302);
    return c.html(miniPage(business, card, c.req.query('s') === 'nfc' ? 'nfc' : 'qr'));
  });

  app.get('/u/:code/ulas', async (c) => {
    const card = await cardByCode(c, c.req.param('code'));
    if (!card?.business_id) return sendPage(c, 'not-found.html', 404);
    await logEvent(c, card, 'review_click', c.req.query('s') === 'nfc' ? 'nfc' : 'qr');
    const business = await businessById(c, card.business_id);
    c.header('Cache-Control', 'no-store');
    return c.redirect(business.review_url, 302);
  });

  app.post('/api/feedback', async (c) => {
    const blocked = await tooMany(c, 'feedback', 5, 10 * 60_000);
    if (blocked) return blocked;
    const { code, message, contact, website } = await body(c);
    if (website) return c.json({ ok: true });
    const card = await cardByCode(c, code);
    const business = card?.business_id ? await businessById(c, card.business_id) : null;
    const text = cleanText(message, 1000);
    if (!business || !isPro(business)) return c.json({ error: 'Halaman ini tidak lagi aktif.' }, 404);
    if (text.length < 3) return c.json({ error: 'Tulis pesan Anda dulu.' }, 400);
    await run(c, 'INSERT INTO feedback (business_id, card_id, message, contact, created_at) VALUES (?, ?, ?, ?, ?)',
      card.business_id, card.id, text, cleanText(contact, 120), Date.now());
    return c.json({ ok: true });
  });

  // ---------- Aktivasi ----------

  app.get('/aktivasi', (c) => sendPage(c, 'activate.html'));
  app.get('/aktivasi/:code', async (c) => {
    const card = await cardByCode(c, c.req.param('code'));
    if (!card) return sendPage(c, 'not-found.html', 404);
    if (card.business_id) return c.redirect(`/kelola?kartu=${card.code}`, 302);
    return sendPage(c, 'activate.html');
  });

  app.get('/api/config', (c) => c.json({
    brand: c.env.BRAND ?? 'TapUlas',
    placesEnabled: Boolean(c.env.GOOGLE_PLACES_API_KEY),
    adminWa: c.env.ADMIN_WA ?? '',
  }));

  app.get('/api/places', async (c) => {
    const blocked = await tooMany(c, 'places', 30, 10 * 60_000);
    if (blocked) return blocked;
    const query = cleanText(c.req.query('q'), 120);
    if (!c.env.GOOGLE_PLACES_API_KEY) return c.json({ error: 'Pencarian belum aktif. Tempel link Google Maps.' }, 503);
    if (query.length < 3) return c.json({ places: [] });
    try {
      return c.json({ places: await searchPlaces(query, c.env.GOOGLE_PLACES_API_KEY, c.env.fetchImpl) });
    } catch {
      return c.json({ error: 'Pencarian sedang gangguan. Tempel link Google Maps.' }, 502);
    }
  });

  app.post('/api/resolve-link', async (c) => {
    const blocked = await tooMany(c, 'resolve', 30, 10 * 60_000);
    if (blocked) return blocked;
    const { link } = await body(c);
    const result = await destination(c, { link });
    return c.json(result, result.ok ? 200 : 400);
  });

  app.post('/api/activate', async (c) => {
    const blocked = await tooMany(c, 'activate', 10, 15 * 60_000);
    if (blocked) return blocked;
    const input = await body(c);
    const { code, activationCode, name, link, placeId, pin } = input;
    const card = await cardByCode(c, code);
    if (!card || !await safeEqual(card.activation_code, normalizeCode(activationCode))) {
      return c.json({ error: 'Kode kartu atau kode aktivasi tidak cocok. Periksa lembar aktivasi.' }, 403);
    }
    if (card.business_id) return c.json({ error: 'Kartu ini sudah aktif. Masuk ke halaman kelola.' }, 409);

    const cleanName = cleanText(name, 80);
    if (cleanName.length < 2) return c.json({ error: 'Isi nama bisnis.' }, 400);
    const badPin = pinProblem(pin);
    if (badPin) return c.json({ error: badPin }, 400);
    const baseline = cleanReviews(input);
    if (baseline?.error) return c.json({ error: baseline.error }, 400);
    const target = await destination(c, { link, placeId });
    if (!target.ok) return c.json({ error: target.error }, 400);

    const { businessId, trial } = await activateCard(c, card, { name: cleanName, target, pin, baseline });

    startCookie(c, OWNER_COOKIE, await createSession(c.env.DB, 'owner', businessId, 30 * DAY), 30 * DAY);
    return c.json({ ok: true, name: cleanName, kind: target.kind, reviewUrl: target.url, code: card.code, trial, trialDays: TRIAL_DAYS });
  });

  // ---------- Pemilik ----------

  app.get('/kelola', (c) => sendPage(c, 'login.html'));
  app.get('/app', async (c) => {
    const session = await readSession(c.env.DB, getCookie(c, OWNER_COOKIE), 'owner');
    if (!session || !await businessById(c, session.business_id)) return c.redirect('/kelola');
    return sendPage(c, 'app.html');
  });

  app.post('/api/login', async (c) => {
    const blocked = await tooMany(c, 'login', 20, 15 * 60_000);
    if (blocked) return blocked;
    const { code, pin } = await body(c);
    const card = await cardByCode(c, code);
    const business = card?.business_id ? await businessById(c, card.business_id) : null;
    if (!business) return c.json({ error: 'Kode kartu atau PIN salah.' }, 401);

    const now = Date.now();
    if (business.locked_until > now) {
      const minutes = Math.ceil((business.locked_until - now) / 60_000);
      return c.json({ error: `Terlalu banyak PIN salah. Coba lagi dalam ${minutes} menit, atau pakai Lupa PIN.` }, 429);
    }
    if (!await verifyPin(String(pin ?? ''), business.pin_hash)) {
      const fails = business.failed_pins + 1;
      const locked = fails >= PIN_MAX_FAILS;
      await run(c, 'UPDATE businesses SET failed_pins = ?, locked_until = ? WHERE id = ?',
        locked ? 0 : fails, locked ? now + PIN_LOCK_MS : 0, business.id);
      return c.json({ error: 'Kode kartu atau PIN salah.' }, 401);
    }
    await run(c, 'UPDATE businesses SET failed_pins = 0, locked_until = 0 WHERE id = ?', business.id);
    startCookie(c, OWNER_COOKIE, await createSession(c.env.DB, 'owner', business.id, 30 * DAY), 30 * DAY);
    return c.json({ ok: true });
  });

  app.post('/api/forgot-pin', async (c) => {
    const blocked = await tooMany(c, 'forgot', 8, 15 * 60_000);
    if (blocked) return blocked;
    const { code, activationCode, pin } = await body(c);
    const card = await cardByCode(c, code);
    if (!card?.business_id || !await safeEqual(card.activation_code, normalizeCode(activationCode))) {
      return c.json({ error: 'Kode kartu atau kode aktivasi tidak cocok.' }, 403);
    }
    const badPin = pinProblem(pin);
    if (badPin) return c.json({ error: badPin }, 400);
    await run(c, 'UPDATE businesses SET pin_hash = ?, failed_pins = 0, locked_until = 0 WHERE id = ?',
      await hashPin(pin, iterations(c)), card.business_id);
    await run(c, "DELETE FROM sessions WHERE kind = 'owner' AND business_id = ?", card.business_id);
    startCookie(c, OWNER_COOKIE, await createSession(c.env.DB, 'owner', card.business_id, 30 * DAY), 30 * DAY);
    return c.json({ ok: true });
  });

  app.post('/api/logout', async (c) => {
    await destroySession(c.env.DB, getCookie(c, OWNER_COOKIE));
    deleteCookie(c, OWNER_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/me', requireOwner, async (c) => {
    const business = c.get('business');
    const cards = await all(c, `
      SELECT c.id, c.code, c.label, c.activated_at AS activatedAt,
        (SELECT COUNT(*) FROM events e WHERE e.card_id = c.id AND e.type = 'tap') AS taps
      FROM cards c WHERE c.business_id = ? ORDER BY c.activated_at, c.id`, business.id);
    return c.json({ business: publicBusiness(c, business), cards, baseUrl: baseUrlOf(c), adminWa: c.env.ADMIN_WA ?? '' });
  });

  app.put('/api/me', requireOwner, async (c) => {
    const { name, link, placeId, tagline, whatsapp, instagram, menuUrl, mode } = await body(c);
    const business = c.get('business');
    const updates = {};

    if (name !== undefined) {
      updates.name = cleanText(name, 80);
      if (updates.name.length < 2) return c.json({ error: 'Isi nama bisnis.' }, 400);
    }
    if ((link !== undefined && link !== business.review_url) || placeId) {
      const target = await destination(c, { link, placeId });
      if (!target.ok) return c.json({ error: target.error }, 400);
      updates.review_url = target.url;
      updates.link_kind = target.kind;
      updates.place_id = target.placeId ?? null;
    }
    const placeChanged = 'review_url' in updates;
    if (mode !== undefined) {
      if (!['direct', 'page'].includes(mode)) return c.json({ error: 'Mode tidak dikenal.' }, 400);
      if (mode === 'page' && !isPro(business)) return c.json({ error: 'Minipage tersedia di paket Pro.' }, 402);
      updates.mode = mode;
    }
    if (tagline !== undefined) updates.tagline = cleanText(tagline, 120);
    if (whatsapp !== undefined) updates.whatsapp = cleanText(whatsapp, 20).replace(/[^\d+]/g, '');
    if (instagram !== undefined) updates.instagram = cleanText(instagram, 60).replace(/[^\w.@]/g, '');
    if (menuUrl !== undefined) {
      const url = cleanHttpsUrl(menuUrl);
      if (url === null) return c.json({ error: 'Link menu tidak valid.' }, 400);
      updates.menu_url = url;
    }

    const keys = Object.keys(updates);
    if (keys.length) {
      await run(c, `UPDATE businesses SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        ...Object.values(updates), business.id);
    }
    if (placeChanged) await resetBeforeAfter(c, business.id, updates.place_id);
    return c.json({ business: publicBusiness(c, await businessById(c, business.id)) });
  });

  app.post('/api/pin', requireOwner, async (c) => {
    const business = c.get('business');
    const blocked = await tooMany(c, 'pin-change', 8, 15 * 60_000, business.id);
    if (blocked) return blocked;
    const { currentPin, newPin } = await body(c);
    if (!await verifyPin(String(currentPin ?? ''), business.pin_hash)) return c.json({ error: 'PIN lama salah.' }, 403);
    const badPin = pinProblem(newPin);
    if (badPin) return c.json({ error: badPin }, 400);
    await run(c, 'UPDATE businesses SET pin_hash = ? WHERE id = ?', await hashPin(newPin, iterations(c)), business.id);
    return c.json({ ok: true });
  });

  app.post('/api/reviews', requireOwner, requirePro, async (c) => {
    const business = c.get('business');
    if (c.env.GOOGLE_PLACES_API_KEY && business.place_id) return c.json({ error: 'Jumlah ulasan sudah diambil otomatis dari Google.' }, 409);
    const reviews = cleanReviews(await body(c));
    if (!reviews) return c.json({ error: 'Isi jumlah ulasan.' }, 400);
    if (reviews.error) return c.json({ error: reviews.error }, 400);
    await insertSnapshot(c, business.id, reviews.count, reviews.rating, 'manual');
    return c.json({ ok: true });
  });

  app.get('/api/stats', requireOwner, async (c) => {
    const business = c.get('business');
    const { id } = business;
    const pro = isPro(business);
    const now = Date.now();
    const days = pro ? 30 : 7;
    const since = now - days * DAY;

    const { n: total } = await first(c, "SELECT COUNT(*) AS n FROM events WHERE business_id = ? AND type = 'tap'", id);
    const rows = await all(c, `
      SELECT strftime('%Y-%m-%d', ts / 1000 + ${WIB_SECONDS}, 'unixepoch') AS d, COUNT(*) AS n
      FROM events WHERE business_id = ? AND type = 'tap' AND ts >= ? GROUP BY d`, id, since);
    const byDay = new Map(rows.map((r) => [r.d, r.n]));
    const daily = Array.from({ length: days }, (_, i) => {
      const d = wibDay(now - (days - 1 - i) * DAY);
      return { d, n: byDay.get(d) ?? 0 };
    });
    const week = daily.slice(-7);
    const stats = { total, week, weekTotal: week.reduce((sum, day) => sum + day.n, 0) };
    if (!pro) return c.json(stats);

    const { at: lastSnapshot } = await first(c, 'SELECT MAX(taken_at) AS at FROM review_snapshots WHERE business_id = ?', id);
    if (!lastSnapshot || now - lastSnapshot > DAY) await snapshotFromGoogle(c, id, business.place_id);

    const monthTaps = daily.reduce((sum, day) => sum + day.n, 0);
    const sources = await all(c, `SELECT source, COUNT(*) AS n FROM events
      WHERE business_id = ? AND type = 'tap' AND ts >= ? GROUP BY source`, id, since);
    const hourRows = await all(c, `
      SELECT CAST(strftime('%H', ts / 1000 + ${WIB_SECONDS}, 'unixepoch') AS INTEGER) AS h, COUNT(*) AS n
      FROM events WHERE business_id = ? AND type = 'tap' AND ts >= ? GROUP BY h`, id, since);
    const hours = Array.from({ length: 24 }, (_, h) => hourRows.find((r) => r.h === h)?.n ?? 0);
    const { n: reviewClicks } = await first(c, `SELECT COUNT(*) AS n FROM events
      WHERE business_id = ? AND type = 'review_click' AND ts >= ?`, id, since);
    const perCard = await all(c, `
      SELECT c.id, c.code, c.label, COUNT(e.id) AS n FROM cards c
      LEFT JOIN events e ON e.card_id = c.id AND e.type = 'tap' AND e.ts >= ?
      WHERE c.business_id = ? GROUP BY c.id ORDER BY n DESC`, since, id);
    return c.json({ ...stats, monthTaps, sources, hours, reviewClicks, perCard, beforeAfter: await beforeAfter(c, id) });
  });

  app.get('/api/inbox', requireOwner, requirePro, async (c) => {
    const items = await all(c, `
      SELECT f.id, f.message, f.contact, f.read_at AS readAt, f.created_at AS createdAt, c.label, c.code
      FROM feedback f LEFT JOIN cards c ON c.id = f.card_id
      WHERE f.business_id = ? ORDER BY f.created_at DESC LIMIT 100`, c.get('business').id);
    return c.json({ items });
  });

  app.post('/api/inbox/:id/read', requireOwner, requirePro, async (c) => {
    await run(c, 'UPDATE feedback SET read_at = ? WHERE id = ? AND business_id = ? AND read_at IS NULL',
      Date.now(), Number(c.req.param('id')), c.get('business').id);
    return c.json({ ok: true });
  });

  // Satu usaha bisa punya banyak kartu: per meja, per kasir, per cabang.
  app.post('/api/cards', requireOwner, async (c) => {
    const business = c.get('business');
    const blocked = await tooMany(c, 'add-card', 10, 15 * 60_000, business.id);
    if (blocked) return blocked;
    const { code, activationCode, label } = await body(c);
    const card = await cardByCode(c, code);
    if (!card || !await safeEqual(card.activation_code, normalizeCode(activationCode))) {
      return c.json({ error: 'Kode kartu atau kode aktivasi tidak cocok.' }, 403);
    }
    if (card.business_id) return c.json({ error: 'Kartu ini sudah terpakai.' }, 409);
    await run(c, 'UPDATE cards SET business_id = ?, label = ?, activated_at = ?, trial_used = 1 WHERE id = ?',
      business.id, cleanText(label, 40), Date.now(), card.id);
    return c.json({ ok: true });
  });

  const ownedCard = (c) => first(c, 'SELECT * FROM cards WHERE id = ? AND business_id = ?',
    Number(c.req.param('id')), c.get('business').id);

  app.patch('/api/cards/:id', requireOwner, async (c) => {
    const card = await ownedCard(c);
    if (!card) return c.json({ error: 'Kartu tidak ditemukan.' }, 404);
    const { label } = await body(c);
    await run(c, 'UPDATE cards SET label = ? WHERE id = ?', cleanText(label, 40), card.id);
    return c.json({ ok: true });
  });

  // Reset mengembalikan kartu ke kondisi baru. Kartu terakhir ikut menghapus data bisnis.
  app.post('/api/cards/:id/reset', requireOwner, async (c) => {
    const business = c.get('business');
    const blocked = await tooMany(c, 'reset', 8, 15 * 60_000, business.id);
    if (blocked) return blocked;
    const card = await ownedCard(c);
    if (!card) return c.json({ error: 'Kartu tidak ditemukan.' }, 404);
    const { pin } = await body(c);
    if (!await verifyPin(String(pin ?? ''), business.pin_hash)) return c.json({ error: 'PIN salah.' }, 403);

    const { id } = business;
    const { n: remaining } = await first(c, 'SELECT COUNT(*) AS n FROM cards WHERE business_id = ?', id);
    const db = c.env.DB;
    const statements = [
      db.prepare('DELETE FROM events WHERE card_id = ?').bind(card.id),
      db.prepare('UPDATE feedback SET card_id = NULL WHERE card_id = ?').bind(card.id),
      db.prepare("UPDATE cards SET business_id = NULL, label = '', activated_at = NULL WHERE id = ?").bind(card.id),
    ];
    if (remaining <= 1) {
      statements.push(
        db.prepare('DELETE FROM events WHERE business_id = ?').bind(id),
        db.prepare('DELETE FROM feedback WHERE business_id = ?').bind(id),
        db.prepare('DELETE FROM review_snapshots WHERE business_id = ?').bind(id),
        db.prepare("DELETE FROM sessions WHERE kind = 'owner' AND business_id = ?").bind(id),
        db.prepare('DELETE FROM businesses WHERE id = ?').bind(id),
      );
    }
    await db.batch(statements);
    if (remaining <= 1) deleteCookie(c, OWNER_COOKIE, { path: '/' });
    return c.json({ ok: true, loggedOut: remaining <= 1 });
  });

  // ---------- Admin ----------

  app.get('/admin', (c) => sendPage(c, 'admin.html'));

  app.post('/api/admin/login', async (c) => {
    const blocked = await tooMany(c, 'admin-login', 8, 15 * 60_000);
    if (blocked) return blocked;
    const { password } = await body(c);
    if (!c.env.ADMIN_PASSWORD || !await safeEqual(password ?? '', c.env.ADMIN_PASSWORD)) {
      return c.json({ error: 'Kata sandi salah.' }, 401);
    }
    startCookie(c, ADMIN_COOKIE, await createSession(c.env.DB, 'admin', null, DAY), DAY);
    return c.json({ ok: true });
  });

  app.post('/api/admin/logout', async (c) => {
    await destroySession(c.env.DB, getCookie(c, ADMIN_COOKIE));
    deleteCookie(c, ADMIN_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/api/admin/overview', requireAdmin, async (c) => {
    const count = async (sql, ...args) => (await first(c, sql, ...args)).n;
    const now = Date.now();
    const since = now - 30 * DAY;
    return c.json({
      ready: await count('SELECT COUNT(*) AS n FROM cards WHERE business_id IS NULL'),
      active: await count('SELECT COUNT(*) AS n FROM cards WHERE business_id IS NOT NULL'),
      businesses: await count('SELECT COUNT(*) AS n FROM businesses WHERE is_demo = 0'),
      pro: await count("SELECT COUNT(*) AS n FROM businesses WHERE plan = 'pro' AND is_trial = 0 AND is_demo = 0 AND (pro_until IS NULL OR pro_until > ?)", now),
      trials: await count("SELECT COUNT(*) AS n FROM businesses WHERE plan = 'pro' AND is_trial = 1 AND is_demo = 0 AND pro_until > ?", now),
      taps30: await count("SELECT COUNT(*) AS n FROM events WHERE type = 'tap' AND ts >= ?", since),
      defaultUrl: await defaultDestination(c),
      batches: await all(c, `
        SELECT b.id, b.note, b.qty, b.created_at AS createdAt,
          (SELECT COUNT(*) FROM cards c WHERE c.batch_id = b.id AND c.business_id IS NOT NULL) AS activated
        FROM batches b ORDER BY b.id DESC LIMIT 50`),
      businessList: await all(c, `
        SELECT b.id, b.name, b.review_url AS reviewUrl, b.link_kind AS linkKind, b.plan, b.pro_until AS proUntil, b.is_trial AS isTrial, b.is_demo AS isDemo, b.created_at AS createdAt,
          (SELECT COUNT(*) FROM cards c WHERE c.business_id = b.id) AS cards,
          (SELECT GROUP_CONCAT(c.code, ' ') FROM cards c WHERE c.business_id = b.id) AS codes,
          (SELECT COUNT(*) FROM events e WHERE e.business_id = b.id AND e.type = 'tap' AND e.ts >= ?) AS taps30
        FROM businesses b ORDER BY b.created_at DESC LIMIT 500`, since),
    });
  });

  app.put('/api/admin/default-link', requireAdmin, async (c) => {
    const { link } = await body(c);
    if (!cleanText(link, 500)) {
      await run(c, "DELETE FROM settings WHERE key = 'default_url'");
      return c.json({ ok: true, url: null });
    }
    const target = await destination(c, { link });
    if (!target.ok) return c.json({ error: target.error }, 400);
    await run(c, `INSERT INTO settings (key, value) VALUES ('default_url', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, target.url);
    return c.json({ ok: true, url: target.url, kind: target.kind });
  });

  // Penjual mengatur kartu untuk pembeli. PIN hanya tampil sekali di sini, lalu diberikan ke pembeli.
  app.post('/api/admin/activate', requireAdmin, async (c) => {
    const input = await body(c);
    const card = await cardByCode(c, input.code);
    if (!card) return c.json({ error: 'Kode kartu tidak ditemukan.' }, 404);
    if (card.business_id) return c.json({ error: 'Kartu ini sudah aktif. Ganti tujuannya di daftar Bisnis.' }, 409);
    const name = cleanText(input.name, 80);
    if (name.length < 2) return c.json({ error: 'Isi nama bisnis.' }, 400);
    const baseline = cleanReviews(input);
    if (baseline?.error) return c.json({ error: baseline.error }, 400);
    const target = await destination(c, { link: input.link });
    if (!target.ok) return c.json({ error: target.error }, 400);

    const pin = randomPin();
    const { trial } = await activateCard(c, card, { name, target, pin, baseline });
    return c.json({ ok: true, code: card.code, name, pin, kind: target.kind, reviewUrl: target.url, trial, trialDays: TRIAL_DAYS });
  });

  app.put('/api/admin/businesses/:id', requireAdmin, async (c) => {
    const business = await businessById(c, Number(c.req.param('id')));
    if (!business) return c.json({ error: 'Bisnis tidak ditemukan.' }, 404);
    const { name, link } = await body(c);
    const cleanName = cleanText(name, 80);
    if (cleanName.length < 2) return c.json({ error: 'Isi nama bisnis.' }, 400);
    if (!link || link === business.review_url) {
      await run(c, 'UPDATE businesses SET name = ? WHERE id = ?', cleanName, business.id);
      return c.json({ ok: true, url: business.review_url, kind: business.link_kind });
    }
    const target = await destination(c, { link });
    if (!target.ok) return c.json({ error: target.error }, 400);
    await run(c, 'UPDATE businesses SET name = ?, review_url = ?, link_kind = ?, place_id = ? WHERE id = ?',
      cleanName, target.url, target.kind, target.placeId ?? null, business.id);
    await resetBeforeAfter(c, business.id, target.placeId);
    return c.json({ ok: true, url: target.url, kind: target.kind });
  });

  app.post('/api/admin/batches', requireAdmin, async (c) => {
    const input = await body(c);
    const qty = Number(input.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) return c.json({ error: 'Jumlah harus 1 sampai 1000.' }, 400);
    return c.json({ id: await createBatch(c.env.DB, qty, cleanText(input.note, 80)) });
  });

  app.post('/api/admin/businesses/:id/plan', requireAdmin, async (c) => {
    const { plan, months } = await body(c);
    const business = await businessById(c, Number(c.req.param('id')));
    if (!business) return c.json({ error: 'Bisnis tidak ditemukan.' }, 404);
    if (plan === 'basic') {
      await run(c, "UPDATE businesses SET plan = 'basic', pro_until = NULL, is_trial = 0, mode = 'direct' WHERE id = ?", business.id);
    } else if (plan === 'pro' && [1, 12].includes(months)) {
      const from = Math.max(business.pro_until ?? 0, Date.now());
      await run(c, "UPDATE businesses SET plan = 'pro', pro_until = ?, is_trial = 0 WHERE id = ?", from + months * 30 * DAY, business.id);
    } else {
      return c.json({ error: 'Paket tidak dikenal.' }, 400);
    }
    return c.json({ ok: true });
  });

  const batchCards = (c, id) => all(c, 'SELECT code, activation_code FROM cards WHERE batch_id = ? ORDER BY id', id);

  app.get('/admin/cetak/:id', requireAdmin, async (c) => {
    const batch = await first(c, 'SELECT * FROM batches WHERE id = ?', Number(c.req.param('id')));
    if (!batch) return sendPage(c, 'not-found.html', 404);
    return c.html(renderPrintSheet({
      brand: c.env.BRAND ?? 'TapUlas', baseUrl: baseUrlOf(c), batch, cards: await batchCards(c, batch.id),
    }));
  });

  // Berkas untuk vendor cetak: kolom NFC ditulis ke chip, kolom QR dicetak.
  app.get('/admin/batch/:file{[0-9]+\\.csv}', requireAdmin, async (c) => {
    const id = Number.parseInt(c.req.param('file'), 10);
    const lines = (await batchCards(c, id)).map(({ code, activation_code }) => {
      const urls = cardUrls(baseUrlOf(c), code);
      return [code, activation_code, urls.nfc, urls.qr].join(',');
    });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="batch-${id}.csv"`);
    return c.body(['kode,kode_aktivasi,url_nfc,url_qr', ...lines].join('\n'));
  });

  app.get('/', (c) => sendPage(c, 'home.html'));

  app.all('*', async (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Tidak ditemukan.' }, 404);
    if (c.req.path.startsWith('/pages/') || c.req.method !== 'GET') return sendPage(c, 'not-found.html', 404);
    const asset = await c.env.ASSETS.fetch(c.req.raw);
    if (asset.status === 404) return sendPage(c, 'not-found.html', 404);
    return new Response(asset.body, asset);
  });

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Terjadi kesalahan di server. Coba lagi.' }, 500);
  });

  return app;
}
