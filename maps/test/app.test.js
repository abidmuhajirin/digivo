import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createBatch } from '../src/db.js';
import { createD1, fileAssets } from './d1-shim.js';
import { createApp } from '../src/app.js';
import { classifyLink, placeIdFromFeature, resolveLink } from '../src/google.js';

const REVIEW = 'https://g.page/r/CTESTABC123/review';
const PIN = '482915';
let db, env, cards;
const app = createApp();

// IP berbeda per permintaan supaya batas percobaan tidak ikut memengaruhi tes lain.
let requests = 0;
const callWith = (targetEnv) => (path, { method = 'GET', body, cookie, ip } = {}) => app.fetch(new Request(`http://test${path}`, {
  method,
  headers: {
    'Content-Type': 'application/json',
    'cf-connecting-ip': ip ?? `10.0.0.${requests++}`,
    ...(cookie ? { Cookie: cookie } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
}), targetEnv);
const call = (path, options) => callWith(env)(path, options);

async function activate(card, name = 'Warung Uji') {
  const res = await call('/api/activate', {
    method: 'POST',
    body: { code: card.code, activationCode: card.activation_code, name, link: REVIEW, pin: PIN },
  });
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

function endTrial(card) {
  const { business_id: id } = db.sqlite.prepare('SELECT business_id FROM cards WHERE code = ?').get(card.code);
  db.sqlite.prepare("UPDATE businesses SET plan = 'basic', pro_until = NULL, is_trial = 0 WHERE id = ?").run(id);
  return id;
}

before(async () => {
  db = createD1();
  const batch = await createBatch(db, 24);
  cards = db.sqlite.prepare('SELECT * FROM cards WHERE batch_id = ?').all(batch);
  env = { DB: db, ASSETS: fileAssets, BRAND: 'Uji', BASE_URL: 'http://test', ADMIN_PASSWORD: 'sandi-uji' };
});

test('link: mengenali form ulasan, Maps, dan menolak non-Google', () => {
  assert.equal(classifyLink('https://g.page/r/ABC').url, 'https://g.page/r/ABC/review');
  assert.equal(classifyLink('https://search.google.com/local/writereview?placeid=ChIJ123').kind, 'review');
  assert.equal(classifyLink('Warung Bu Sri\nhttps://maps.app.goo.gl/abc123').kind, 'short');

  const maps = classifyLink('https://www.google.com/maps/place/Warung+Bu+Sri/@-6.2,106.8,17z');
  assert.equal(maps.kind, 'maps');
  assert.equal(maps.nameGuess, 'Warung Bu Sri');

  assert.equal(classifyLink('https://penipuan.example/google.com').ok, false);
  assert.equal(classifyLink('https://google.com.penipuan.example/maps').ok, false);
  assert.equal(classifyLink('javascript:alert(1)').ok, false);
});

test('link Maps panjang langsung jadi link form ulasan tanpa API key', () => {
  assert.equal(placeIdFromFeature('0x6b12ae37b47f5b37', '0x8eaddfcd1b32ca52'), 'ChIJN1t_tDeuEmsRUsoyG83frY4');

  const result = classifyLink('https://www.google.com/maps/place/Sydney/@-33.8,151.1,17z/data=!4m6!3m5!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52!8m2');
  assert.equal(result.kind, 'review');
  assert.equal(result.url, 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');

  const inner = encodeURIComponent('https://www.google.com/maps/place/Sydney/data=!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52');
  assert.equal(classifyLink(`https://consent.google.com/m?continue=${inner}`).kind, 'review');
  assert.equal(classifyLink(`https://www.google.com/sorry/index?continue=${inner}&q=abc`).kind, 'review');
});

test('link pendek: dibuka dulu lalu dikonversi', async () => {
  const fetchImpl = async () => new Response(null, {
    status: 302,
    headers: { location: 'https://www.google.com/maps/place/Sydney/data=!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52' },
  });
  const result = await resolveLink('https://maps.app.goo.gl/abc', { fetchImpl: async (url) => (url.includes('goo.gl') ? fetchImpl() : new Response('')) });
  assert.equal(result.placeId, 'ChIJN1t_tDeuEmsRUsoyG83frY4');
});

test('trial Pro 7 hari sekali per kartu, habis otomatis ke Basic tanpa mematikan kartu', async () => {
  const card = cards[12];
  const { res, cookie } = await activate(card);
  const body = await res.json();
  assert.equal(body.trial, true);

  const me = await (await call('/api/me', { cookie })).json();
  assert.equal(me.business.plan, 'pro');
  assert.equal(me.business.isTrial, true);
  const days = (me.business.proUntil - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days <= 7);
  assert.equal((await call('/api/inbox', { cookie })).status, 200);
  await call('/api/me', { method: 'PUT', cookie, body: { mode: 'page' } });

  const { business_id: id } = db.sqlite.prepare('SELECT business_id FROM cards WHERE code = ?').get(card.code);
  db.sqlite.prepare('UPDATE businesses SET pro_until = ? WHERE id = ?').run(Date.now() - 1000, id);
  assert.equal((await call('/api/inbox', { cookie })).status, 402);
  assert.equal((await call(`/t/${card.code}`)).headers.get('location'), REVIEW);

  const meId = (await (await call('/api/me', { cookie })).json()).cards[0].id;
  await call(`/api/cards/${meId}/reset`, { method: 'POST', cookie, body: { pin: PIN } });
  const again = await (await activate(card)).res.json();
  assert.equal(again.trial, false, 'reset tidak boleh memberi trial baru');
});

test('before-after manual, data Pro tetap tersimpan saat turun paket', async () => {
  const card = cards[13];
  const res = await call('/api/activate', {
    method: 'POST',
    body: { code: card.code, activationCode: card.activation_code, name: 'Before Uji', link: REVIEW, pin: PIN, reviewCount: '12', rating: '4,3' },
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];

  let stats = await (await call('/api/stats', { cookie })).json();
  assert.equal(stats.beforeAfter.before.count, 12);
  assert.equal(stats.beforeAfter.before.rating, 4.3);
  assert.equal(stats.beforeAfter.after, null);

  assert.equal((await call('/api/reviews', { method: 'POST', cookie, body: { reviewCount: 'x' } })).status, 400);
  assert.equal((await call('/api/reviews', { method: 'POST', cookie, body: { reviewCount: '30', rating: '9' } })).status, 400);
  await call('/api/reviews', { method: 'POST', cookie, body: { reviewCount: '47', rating: '4,6' } });
  stats = await (await call('/api/stats', { cookie })).json();
  assert.equal(stats.beforeAfter.gained, 35);
  assert.equal(stats.beforeAfter.after.count, 47);

  await call('/api/me', { method: 'PUT', cookie, body: { link: 'https://g.page/r/CLAIN/review' } });
  stats = await (await call('/api/stats', { cookie })).json();
  assert.equal(stats.beforeAfter, null, 'tujuan baru harus memulai titik awal baru');

  endTrial(card);
  assert.equal((await (await call('/api/stats', { cookie })).json()).beforeAfter, undefined);
  const basic = await call('/api/reviews', { method: 'POST', cookie, body: { reviewCount: '50', rating: '4,9' } });
  assert.equal(basic.status, 200, 'Basic tetap bisa mencatat ulasan');
  stats = await (await call('/api/stats', { cookie })).json();
  assert.equal(stats.reviews.count, 50);
  assert.equal(stats.reviews.rating, 4.9);
});

test('before-after otomatis dari Google saat aktivasi', async () => {
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    return Response.json({ userRatingCount: 21, rating: 4.4 });
  };
  const card = cards[14];
  const res = await callWith({ ...env, GOOGLE_PLACES_API_KEY: 'kunci-uji', fetchImpl })('/api/activate', {
    method: 'POST',
    body: {
      code: card.code, activationCode: card.activation_code, name: 'Otomatis Uji', pin: PIN,
      link: 'https://www.google.com/maps/place/X/data=!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52',
    },
  });
  assert.equal(res.status, 200);
  assert.match(seen[0].url, /places\/ChIJN1t_tDeuEmsRUsoyG83frY4$/);
  assert.equal(seen[0].options.headers['X-Goog-FieldMask'], 'rating,userRatingCount');

  const { business_id: id } = db.sqlite.prepare('SELECT business_id FROM cards WHERE code = ?').get(card.code);
  const snapshot = db.sqlite.prepare('SELECT * FROM review_snapshots WHERE business_id = ?').get(id);
  assert.equal(snapshot.review_count, 21);
  assert.equal(snapshot.source, 'google');
});

test('batas percobaan tersimpan di database', async () => {
  const attempt = () => app.fetch(new Request('http://test/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.9.9.9' },
    body: JSON.stringify({ password: 'salah' }),
  }), env);
  for (let i = 0; i < 8; i++) assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 429);
});

test('aset statis tersaji, template mentah tidak', async () => {
  assert.equal((await call('/css/app.css')).status, 200);
  assert.equal((await call('/pages/home.html')).status, 404);
  assert.equal((await call('/tidak-ada.js')).status, 404);
  assert.match(await (await call('/')).text(), /Uji/);
});

test('link pendek yang keluar dari Google atau gagal dibuka ditolak', async () => {
  const offsite = async () => new Response(null, { status: 302, headers: { location: 'https://penipuan.example/x' } });
  assert.equal((await resolveLink('https://maps.app.goo.gl/abc', { fetchImpl: offsite })).ok, false);

  const broken = async () => { throw new Error('jaringan'); };
  assert.equal((await resolveLink('https://maps.app.goo.gl/abc', { fetchImpl: broken })).ok, false);
});

test('admin: tujuan bawaan kartu kosong, aktivasi pembeli, lalu ganti link', async () => {
  const login = await call('/api/admin/login', { method: 'POST', body: { password: 'sandi-uji' } });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const card = cards[15];
  const demo = 'https://g.page/r/CMALIOBORO/review';

  assert.equal((await call('/api/admin/default-link', { method: 'PUT', body: { link: demo } })).status, 401);
  const bad = await call('/api/admin/default-link', { method: 'PUT', cookie, body: { link: 'https://penipuan.example' } });
  assert.equal(bad.status, 400);

  await call('/api/admin/default-link', { method: 'PUT', cookie, body: { link: demo } });
  const blank = await call(`/t/${card.code}`);
  assert.equal(blank.headers.get('location'), demo);
  assert.equal(blank.headers.get('cache-control'), 'no-store');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM events WHERE card_id = ?').get(card.id).n, 0);
  assert.equal((await call(`/aktivasi/${card.code}`)).status, 200, 'aktivasi mandiri tetap bisa');

  assert.equal((await call('/api/admin/activate', { method: 'POST', body: { code: card.code, name: 'X', link: REVIEW } })).status, 401);
  const res = await call('/api/admin/activate', {
    method: 'POST', cookie, body: { code: card.code, name: 'Toko Pembeli', link: REVIEW, reviewCount: '9' },
  });
  const activated = await res.json();
  assert.match(activated.pin, /^\d{6}$/);
  assert.equal(activated.trial, true);
  assert.equal((await call(`/t/${card.code}`)).headers.get('location'), REVIEW);

  const owner = await call('/api/login', { method: 'POST', body: { code: card.code, pin: activated.pin } });
  assert.equal(owner.status, 200);
  const again = await call('/api/admin/activate', { method: 'POST', cookie, body: { code: card.code, name: 'Lain', link: REVIEW } });
  assert.equal(again.status, 409);

  const { business_id: id } = db.sqlite.prepare('SELECT business_id FROM cards WHERE code = ?').get(card.code);
  const next = 'https://g.page/r/CBARU123/review';
  await call(`/api/admin/businesses/${id}`, { method: 'PUT', cookie, body: { name: 'Toko Pembeli', link: next } });
  assert.equal((await call(`/q/${card.code}`)).headers.get('location'), next);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_snapshots WHERE business_id = ?').get(id).n, 0);

  await call('/api/admin/default-link', { method: 'PUT', cookie, body: { link: '' } });
  assert.equal((await call(`/t/${cards[0].code}`)).headers.get('location'), `/aktivasi/${cards[0].code}`);
});

test('kartu kosong diarahkan ke aktivasi, kode salah ditolak', async () => {
  const res = await call(`/t/${cards[0].code}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `/aktivasi/${cards[0].code}`);

  const wrong = await call('/api/activate', {
    method: 'POST',
    body: { code: cards[0].code, activationCode: 'SALAH123', name: 'X Y', link: REVIEW, pin: PIN },
  });
  assert.equal(wrong.status, 403);
  assert.equal((await call('/t/TIDAKADA')).status, 404);
});

test('setelah aktivasi NFC dan QR redirect 302 ke Google dan tercatat terpisah', async () => {
  const card = cards[1];
  const { res, cookie } = await activate(card);
  assert.equal(res.status, 200);

  const nfc = await call(`/t/${card.code}`);
  assert.equal(nfc.status, 302);
  assert.equal(nfc.headers.get('location'), REVIEW);
  assert.equal(nfc.headers.get('cache-control'), 'no-store');

  await call(`/q/${card.code}`, { ip: '10.1.1.1' });
  await call(`/q/${card.code}`, { ip: '10.1.1.1' }); // duplikat dalam 20 detik tidak dihitung
  const rows = db.sqlite.prepare('SELECT source FROM events WHERE card_id = ? ORDER BY id').all(card.id);
  assert.deepEqual(rows.map((r) => r.source), ['nfc', 'qr']);

  endTrial(card);
  const stats = await (await call('/api/stats', { cookie })).json();
  assert.equal(stats.total, 2);
  assert.equal(stats.week.length, 7);
  assert.equal(stats.hours, undefined, 'data Pro tidak boleh dikirim ke Basic');
});

test('mengganti link langsung mengubah tujuan kartu yang sama', async () => {
  const card = cards[2];
  const { cookie } = await activate(card);
  const next = 'https://g.page/r/CBARU999/review';
  await call('/api/me', { method: 'PUT', cookie, body: { link: next } });
  const res = await call(`/q/${card.code}`);
  assert.equal(res.headers.get('location'), next);

  const bad = await call('/api/me', { method: 'PUT', cookie, body: { link: 'https://penipuan.example' } });
  assert.equal(bad.status, 400);
});

test('login: PIN salah terkunci setelah 5 kali, Lupa PIN memulihkan', async () => {
  const card = cards[3];
  await activate(card);
  for (let i = 0; i < 5; i++) {
    assert.equal((await call('/api/login', { method: 'POST', body: { code: card.code, pin: '000001' } })).status, 401);
  }
  const locked = await call('/api/login', { method: 'POST', body: { code: card.code, pin: PIN } });
  assert.equal(locked.status, 429);

  const reset = await call('/api/forgot-pin', {
    method: 'POST',
    body: { code: card.code, activationCode: card.activation_code, pin: '730194' },
  });
  assert.equal(reset.status, 200);
  assert.equal((await call('/api/login', { method: 'POST', body: { code: card.code, pin: '730194' } })).status, 200);
});

test('fitur Pro terkunci di server, minipage tidak pernah menyaring pelanggan', async () => {
  const card = cards[4];
  const { cookie } = await activate(card);
  endTrial(card);
  assert.equal((await call('/api/inbox', { cookie })).status, 402);
  assert.equal((await call('/api/me', { method: 'PUT', cookie, body: { mode: 'page' } })).status, 402);

  const admin = await call('/api/admin/login', { method: 'POST', body: { password: 'sandi-uji' } });
  const adminCookie = admin.headers.get('set-cookie').split(';')[0];
  const { business_id: id } = db.sqlite.prepare('SELECT business_id FROM cards WHERE id = ?').get(card.id);
  await call(`/api/admin/businesses/${id}/plan`, { method: 'POST', cookie: adminCookie, body: { plan: 'pro', months: 1 } });

  assert.equal((await call('/api/me', { method: 'PUT', cookie, body: { mode: 'page' } })).status, 200);
  const tap = await call(`/t/${card.code}`);
  assert.equal(tap.headers.get('location'), `/u/${card.code}?s=nfc`);

  const html = await (await call(`/u/${card.code}`)).text();
  assert.match(html, /Tulis ulasan di Google/);
  assert.doesNotMatch(html, /bintang/i);

  const click = await call(`/u/${card.code}/ulas?s=nfc`);
  assert.equal(click.headers.get('location'), REVIEW);
  await call('/api/feedback', { method: 'POST', body: { code: card.code, message: 'Pesan uji' } });
  const { items } = await (await call('/api/inbox', { cookie })).json();
  assert.equal(items[0].message, 'Pesan uji');

  const stats = await (await call('/api/stats', { cookie })).json();
  assert.equal(stats.reviewClicks, 1);
  assert.equal(stats.hours.length, 24);
});

test('banyak kartu satu bisnis, reset kartu terakhir menghapus bisnis', async () => {
  const [first, second] = [cards[5], cards[6]];
  const { cookie } = await activate(first);
  const add = await call('/api/cards', {
    method: 'POST', cookie,
    body: { code: second.code, activationCode: second.activation_code, label: 'Meja 2' },
  });
  assert.equal(add.status, 200);

  const me = await (await call('/api/me', { cookie })).json();
  assert.equal(me.cards.length, 2);
  const [a, b] = me.cards;

  assert.equal((await call(`/api/cards/${a.id}/reset`, { method: 'POST', cookie, body: { pin: '000001' } })).status, 403);
  const one = await (await call(`/api/cards/${a.id}/reset`, { method: 'POST', cookie, body: { pin: PIN } })).json();
  assert.equal(one.loggedOut, false);
  const two = await (await call(`/api/cards/${b.id}/reset`, { method: 'POST', cookie, body: { pin: PIN } })).json();
  assert.equal(two.loggedOut, true);
  assert.equal((await call(`/t/${first.code}`)).headers.get('location'), `/aktivasi/${first.code}`);
});

test('pemilik tidak bisa menyentuh kartu bisnis lain, admin butuh sesi', async () => {
  const { cookie } = await activate(cards[7]);
  await activate(cards[8]);
  const foreign = db.sqlite.prepare('SELECT id FROM cards WHERE code = ?').get(cards[8].code);
  assert.equal((await call(`/api/cards/${foreign.id}`, { method: 'PATCH', cookie, body: { label: 'x' } })).status, 404);
  assert.equal((await call('/api/admin/overview')).status, 401);
  assert.equal((await call('/admin/batch/1.csv')).status, 302);
});

const adminLogin = async () => (await call('/api/admin/login', { method: 'POST', body: { password: 'sandi-uji' } })).headers.get('set-cookie').split(';')[0];

async function newReseller(adminCookie, whatsapp) {
  const res = await call('/api/admin/resellers', { method: 'POST', cookie: adminCookie, body: { name: 'Reseller Uji', whatsapp, city: 'Bandung' } });
  const created = await res.json();
  const login = await call('/api/reseller/login', { method: 'POST', body: { whatsapp, pin: created.pin } });
  assert.equal(login.status, 200);
  return { ...created, cookie: login.headers.get('set-cookie').split(';')[0] };
}

test('reseller: daftar, terima kartu, aktivasi, tercatat, dan pembeli terkunci', async () => {
  const admin = await adminLogin();
  const one = await newReseller(admin, '0812-3456-7890');
  assert.equal(one.whatsapp, '6281234567890');
  assert.equal((await call('/api/admin/resellers', { method: 'POST', cookie: admin, body: { name: 'Dobel', whatsapp: '+62 812 3456 7890' } })).status, 409);
  assert.equal((await call('/api/admin/resellers', { method: 'POST', body: { name: 'X Y', whatsapp: '081299990000' } })).status, 401);
  const { resellers } = await (await call('/api/admin/overview', { cookie: admin })).json();
  const row = resellers.find((r) => r.whatsapp === one.whatsapp);

  const [mine, foreign] = [cards[16], cards[17]];
  const moved = await (await call('/api/admin/resellers/cards', {
    method: 'POST', cookie: admin, body: { resellerId: row.id, codes: `${mine.code}, TIDAKADA` },
  })).json();
  assert.deepEqual([moved.moved, moved.skipped], [1, 1]);

  const blocked = await call('/api/reseller/activate', { method: 'POST', cookie: one.cookie, body: { code: foreign.code, name: 'Toko X', link: REVIEW } });
  assert.equal(blocked.status, 404, 'kartu di luar stok ditolak');
  assert.equal((await call('/api/reseller/activate', { method: 'POST', body: { code: mine.code, name: 'Toko X', link: REVIEW } })).status, 401);

  const sold = await (await call('/api/reseller/activate', {
    method: 'POST', cookie: one.cookie, body: { code: mine.code, name: 'Toko Reseller', link: REVIEW, reviewCount: '20', rating: '4,8' },
  })).json();
  assert.match(sold.pin, /^\d{6}$/);
  assert.equal((await call(`/t/${mine.code}`)).headers.get('location'), REVIEW);

  const history = await (await call('/api/reseller/me', { cookie: one.cookie })).json();
  assert.equal(history.stock.length, 0);
  assert.equal(history.sold[0].code, mine.code);
  assert.equal(history.sold[0].activationCode, mine.activation_code);
  assert.equal(history.sold[0].businessName, 'Toko Reseller');
  assert.equal(history.sold[0].via, 'reseller');

  const owner = (await call('/api/login', { method: 'POST', body: { code: mine.code, pin: sold.pin } })).headers.get('set-cookie').split(';')[0];
  const me = await (await call('/api/me', { cookie: owner })).json();
  assert.equal(me.business.linkLocked, true);
  assert.equal(me.sellerWa, one.whatsapp);
  const stats = await (await call('/api/stats', { cookie: owner })).json();
  assert.equal(stats.reviews.rating, 4.8);

  assert.equal((await call('/api/me', { method: 'PUT', cookie: owner, body: { link: 'https://g.page/r/CLAIN/review' } })).status, 403);
  assert.equal((await call('/api/me', { method: 'PUT', cookie: owner, body: { name: 'Nama Baru', link: REVIEW } })).status, 200, 'nama tetap bisa diganti');
  assert.equal((await call(`/api/cards/${me.cards[0].id}/reset`, { method: 'POST', cookie: owner, body: { pin: sold.pin } })).status, 403, 'reset membuka celah ganti link');

  const id = history.sold[0].businessId;
  const next = 'https://g.page/r/CRESELLER/review';
  assert.equal((await call(`/api/reseller/businesses/${id}`, { method: 'PUT', cookie: one.cookie, body: { name: 'Toko Reseller', link: next } })).status, 200);
  assert.equal((await call(`/q/${mine.code}`)).headers.get('location'), next);

  const renewed = await (await call(`/api/reseller/businesses/${id}/pin`, { method: 'POST', cookie: one.cookie })).json();
  assert.equal((await call('/api/me', { cookie: owner })).status, 401, 'PIN baru mengakhiri sesi lama');
  assert.equal((await call('/api/login', { method: 'POST', body: { code: mine.code, pin: renewed.pin } })).status, 200);
});

test('reseller tidak bisa menyentuh bisnis orang lain atau aktivasi mandiri', async () => {
  const admin = await adminLogin();
  const a = await newReseller(admin, '081200000001');
  const b = await newReseller(admin, '081200000002');
  const list = (await (await call('/api/admin/overview', { cookie: admin })).json()).resellers;
  const idOf = (r) => list.find((row) => row.whatsapp === r.whatsapp).id;

  const [sold, self] = [cards[18], cards[19]];
  await call('/api/admin/resellers/cards', { method: 'POST', cookie: admin, body: { resellerId: idOf(a), codes: `${sold.code} ${self.code}` } });
  await call('/api/reseller/activate', { method: 'POST', cookie: a.cookie, body: { code: sold.code, name: 'Toko A', link: REVIEW } });
  await activate(self, 'Toko Mandiri');

  const history = await (await call('/api/reseller/me', { cookie: a.cookie })).json();
  const bizA = history.sold.find((row) => row.code === sold.code).businessId;
  const bizSelf = history.sold.find((row) => row.code === self.code);
  assert.equal(bizSelf.via, 'self', 'kartu reseller yang diaktifkan pembeli tetap tercatat');

  assert.equal((await call(`/api/reseller/businesses/${bizA}`, { method: 'PUT', cookie: b.cookie, body: { name: 'Curian', link: REVIEW } })).status, 404);
  assert.equal((await call(`/api/reseller/businesses/${bizSelf.businessId}/pin`, { method: 'POST', cookie: a.cookie })).status, 404);

  // Kartu terjual tidak boleh pindah pemilik, supaya riwayat tidak berubah.
  const moved = await (await call('/api/admin/resellers/cards', { method: 'POST', cookie: admin, body: { resellerId: idOf(b), codes: sold.code } })).json();
  assert.equal(moved.moved, 0);

  await call(`/api/admin/resellers/${idOf(a)}/status`, { method: 'POST', cookie: admin, body: { active: false } });
  assert.equal((await call('/api/reseller/me', { cookie: a.cookie })).status, 401, 'nonaktif langsung keluar');
  assert.equal((await call('/api/reseller/login', { method: 'POST', body: { whatsapp: a.whatsapp, pin: a.pin } })).status, 401);
});

test('reseller: PIN salah terkunci, batch masuk stok, admin bisa mengosongkan kartu salah aktivasi', async () => {
  const admin = await adminLogin();
  const r = await newReseller(admin, '081200000003');
  for (let i = 0; i < 5; i++) {
    assert.equal((await call('/api/reseller/login', { method: 'POST', body: { whatsapp: r.whatsapp, pin: '000001' } })).status, 401);
  }
  assert.equal((await call('/api/reseller/login', { method: 'POST', body: { whatsapp: r.whatsapp, pin: r.pin } })).status, 429);
  const { id } = db.sqlite.prepare('SELECT id FROM resellers WHERE whatsapp = ?').get(r.whatsapp);
  const { pin } = await (await call(`/api/admin/resellers/${id}/pin`, { method: 'POST', cookie: admin })).json();
  const login = await call('/api/reseller/login', { method: 'POST', body: { whatsapp: r.whatsapp, pin } });
  assert.equal(login.status, 200);

  const batch = await createBatch(db, 3);
  const moved = await (await call('/api/admin/resellers/cards', { method: 'POST', cookie: admin, body: { resellerId: id, batchId: batch } })).json();
  assert.equal(moved.moved, 3);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const { stock } = await (await call('/api/reseller/me', { cookie })).json();
  assert.equal(stock.length, 3);

  await call('/api/reseller/activate', { method: 'POST', cookie, body: { code: stock[0].code, name: 'Salah Kartu', link: REVIEW } });
  assert.equal((await call('/api/admin/cards/reset', { method: 'POST', cookie: admin, body: { code: stock[0].code } })).status, 200);
  const after = await (await call('/api/reseller/me', { cookie })).json();
  assert.equal(after.stock.length, 3, 'kartu kembali ke stok reseller');
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM businesses WHERE name = 'Salah Kartu'").get().n, 0);

  const back = await (await call('/api/admin/resellers/cards', { method: 'POST', cookie: admin, body: { resellerId: 0, batchId: batch } })).json();
  assert.equal(back.moved, 3, 'kartu bisa ditarik ke stok pusat');
});

test('admin: aktivasi membuat tujuan terkunci, aktivasi mandiri tetap bebas', async () => {
  const admin = await adminLogin();
  const card = cards[20];
  const made = await (await call('/api/admin/activate', { method: 'POST', cookie: admin, body: { code: card.code, name: 'Toko Admin', link: REVIEW } })).json();
  const owner = (await call('/api/login', { method: 'POST', body: { code: card.code, pin: made.pin } })).headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/me', { method: 'PUT', cookie: owner, body: { link: 'https://g.page/r/CLAIN/review' } })).status, 403);

  const { cookie } = await activate(cards[21]);
  assert.equal((await call('/api/me', { method: 'PUT', cookie, body: { link: 'https://g.page/r/CLAIN/review' } })).status, 200);
});

test('panggilan Google tercatat, angka awal manual tetap, data Google lama dibuang', async () => {
  const fetchImpl = async (url) => (url.includes('searchText')
    ? Response.json({ places: [{ id: 'ChIJabc', displayName: { text: 'Sate Uji' }, formattedAddress: 'Mlati' }] })
    : Response.json({ userRatingCount: 30, rating: 4.6 }));
  const keyed = callWith({ ...env, GOOGLE_PLACES_API_KEY: 'kunci-uji', fetchImpl });
  const month = new Date().toISOString().slice(0, 7);
  const used = (kind) => Number(db.sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(`google_calls:${month}:${kind}`)?.value ?? 0);
  const [search0, details0] = [used('search'), used('details')];

  assert.equal((await keyed('/api/places?q=sate%20uji')).status, 200);
  assert.equal(used('search'), search0 + 1);

  const card = cards[22];
  const res = await keyed('/api/activate', {
    method: 'POST',
    body: {
      code: card.code, activationCode: card.activation_code, name: 'Retensi Uji', pin: PIN, reviewCount: '12', rating: '4,1',
      link: 'https://www.google.com/maps/place/X/data=!1s0x6b12ae37b47f5b37:0x8eaddfcd1b32ca52',
    },
  });
  assert.equal(res.status, 200);
  assert.equal(used('details'), details0 + 1);
  const { business_id: id } = db.sqlite.prepare('SELECT business_id FROM cards WHERE code = ?').get(card.code);
  const rows = () => db.sqlite.prepare('SELECT review_count, source FROM review_snapshots WHERE business_id = ? ORDER BY taken_at, id').all(id);
  assert.deepEqual(rows().map((r) => [r.review_count, r.source]), [[12, 'manual'], [30, 'google']]);

  // Angka Google berumur 40 hari terhapus saat angka baru diambil, angka manual tidak.
  db.sqlite.prepare("INSERT INTO review_snapshots (business_id, review_count, rating, source, taken_at) VALUES (?, 5, 4, 'google', ?)").run(id, Date.now() - 40 * 86_400_000);
  db.sqlite.prepare("UPDATE review_snapshots SET taken_at = taken_at - 2 * 86400000 WHERE business_id = ? AND review_count IN (12, 30)").run(id);
  const cookie = (await keyed('/api/login', { method: 'POST', body: { code: card.code, pin: PIN } })).headers.get('set-cookie').split(';')[0];
  const stats = await (await keyed('/api/stats', { cookie })).json();
  assert.equal(used('details'), details0 + 2);
  assert.deepEqual(rows().map((r) => [r.review_count, r.source]), [[12, 'manual'], [30, 'google'], [30, 'google']]);
  assert.equal(stats.beforeAfter.before.count, 12);

  const admin = (await keyed('/api/admin/login', { method: 'POST', body: { password: 'sandi-uji' } })).headers.get('set-cookie').split(';')[0];
  const overview = await (await keyed('/api/admin/overview', { cookie: admin })).json();
  assert.deepEqual(overview.google, { enabled: true, month, details: details0 + 2, search: search0 + 1 });
  assert.equal(typeof overview.tapsToday, 'number');
  assert.ok(Array.isArray(overview.batchStock));
});
