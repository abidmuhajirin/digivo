// Membuat akun demo pelanggan dan reseller di database Cloudflare, lalu menampilkan PIN-nya di terminal.
// Pakai: npm run seed:demo  (produksi)   atau   node scripts/seed-demo.js --local  (database lokal)
// Hapus lagi dengan: npm run demo:hapus
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomCode } from '../src/db.js';
import { hashPin, randomPin } from '../src/security.js';

const target = process.argv.includes('--local') ? '--local' : '--remote';
const DB = 'digivo-maps-db';
const DEMO_NAME = 'Sate Dino Pak Ti Rek! (Demo)';
const DEMO_RESELLER = 'Reseller Demo';
const DEMO_WA = '6280000000001';
// Nama batch unik supaya penghapusan tidak pernah menyentuh batch buatan admin.
const DEMO_BATCH = 'Akun demo TapUlas (seed-demo)';
const DAY = 86_400_000;
const now = Date.now();
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const wrangler = (args) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', DB, target, ...args], { encoding: 'utf8', shell: process.platform === 'win32' });

// Query ditulis ke file: di Windows npx.cmd berjalan lewat shell yang memecah argumen berspasi.
mkdirSync('.wrangler', { recursive: true });
const checkFile = '.wrangler/seed-demo-cek.sql';
writeFileSync(checkFile, `SELECT (SELECT COUNT(*) FROM businesses WHERE name = ${quote(DEMO_NAME)}) AS b, (SELECT COUNT(*) FROM resellers WHERE whatsapp = ${quote(DEMO_WA)}) AS r, (SELECT COUNT(*) FROM batches WHERE note = ${quote(DEMO_BATCH)}) AS k;`);
const existing = JSON.parse(wrangler(['--json', `--file=${checkFile}`]));
rmSync(checkFile, { force: true });
const found = existing[0].results[0];
if (found.b || found.r || found.k) {
  console.log('Akun demo sudah ada. Jalankan "npm run demo:hapus" dulu bila ingin membuat ulang dengan PIN baru.');
  process.exit(0);
}

const ownerPin = randomPin();
const resellerPin = randomPin();
const ownerCards = Array.from({ length: 3 }, () => randomCode(7));
const stockCards = Array.from({ length: 3 }, () => randomCode(7));
const business = `(SELECT id FROM businesses WHERE name = ${quote(DEMO_NAME)})`;
const reseller = `(SELECT id FROM resellers WHERE whatsapp = ${quote(DEMO_WA)})`;
const batch = `(SELECT MAX(id) FROM batches WHERE note = ${quote(DEMO_BATCH)})`;
const lines = [];

lines.push(`INSERT INTO batches (note, qty, created_at) VALUES (${quote(DEMO_BATCH)}, 6, ${now});`);
lines.push(`INSERT INTO resellers (name, whatsapp, city, pin_hash, created_at) VALUES (${quote(DEMO_RESELLER)}, ${quote(DEMO_WA)}, 'Sleman', ${quote(await hashPin(resellerPin))}, ${now});`);
lines.push(`INSERT INTO businesses (name, review_url, link_kind, pin_hash, plan, pro_until, is_trial, mode, tagline, is_demo, link_locked, created_at)
  VALUES (${quote(DEMO_NAME)}, 'https://www.google.com/maps/search/sate+klathak+sleman', 'maps', ${quote(await hashPin(ownerPin))}, 'pro', ${now + 7 * DAY}, 1, 'page',
  'Data di akun ini simulasi, bukan pelanggan nyata.', 1, 1, ${now - 30 * DAY});`);
['Kasir', 'Meja 1', 'Meja 2'].forEach((label, i) => {
  lines.push(`INSERT INTO cards (code, activation_code, batch_id, business_id, reseller_id, label, activated_at, activated_via, trial_used, created_at)
    VALUES (${quote(ownerCards[i])}, ${quote(randomCode(8))}, ${batch}, ${business}, ${reseller}, ${quote(label)}, ${now - 30 * DAY}, 'reseller', 1, ${now});`);
});
for (const code of stockCards) {
  lines.push(`INSERT INTO cards (code, activation_code, batch_id, reseller_id, created_at) VALUES (${quote(code)}, ${quote(randomCode(8))}, ${batch}, ${reseller}, ${now});`);
}

// Generator tetap agar grafik demo sama setiap kali dibuat.
let state = 11;
const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
const hourWeights = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 5, 4, 2, 2, 3, 5, 8, 9, 7, 4, 1, 0];
const hourPool = hourWeights.flatMap((weight, hour) => Array(weight).fill(hour));
for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
  const taps = 5 + Math.floor(random() * 12);
  for (let i = 0; i < taps; i++) {
    const hour = hourPool[Math.floor(random() * hourPool.length)];
    const day = new Date(now - daysAgo * DAY);
    day.setUTCHours(hour - 7, Math.floor(random() * 60));
    const ts = Math.min(day.getTime(), now - 60_000);
    const code = ownerCards[random() < 0.55 ? 0 : random() < 0.7 ? 1 : 2];
    const source = random() < 0.68 ? 'nfc' : 'qr';
    const card = `(SELECT id FROM cards WHERE code = ${quote(code)})`;
    lines.push(`INSERT INTO events (card_id, business_id, type, source, ts) VALUES (${card}, ${business}, 'tap', '${source}', ${ts});`);
    if (random() < 0.6) lines.push(`INSERT INTO events (card_id, business_id, type, source, ts) VALUES (${card}, ${business}, 'review_click', '${source}', ${ts + 4000});`);
  }
}
lines.push(`INSERT INTO feedback (business_id, card_id, message, created_at) VALUES (${business}, (SELECT id FROM cards WHERE code = ${quote(ownerCards[1])}), 'Contoh pesan demo: sambalnya kurang pedas, mohon disediakan level.', ${now - 2 * 3600_000});`);
lines.push(`INSERT INTO feedback (business_id, card_id, message, contact, created_at) VALUES (${business}, (SELECT id FROM cards WHERE code = ${quote(ownerCards[0])}), 'Contoh pesan demo: antrean kasir lama saat jam makan malam.', '081200000000', ${now - DAY});`);
lines.push(`INSERT INTO review_snapshots (business_id, review_count, rating, source, taken_at) VALUES (${business}, 104, 4.8, 'manual', ${now - 30 * DAY}), (${business}, 128, 4.9, 'manual', ${now - DAY});`);

const file = '.wrangler/seed-demo.sql';
writeFileSync(file, lines.join('\n'));
try {
  wrangler([`--file=${file}`]);
} finally {
  rmSync(file, { force: true });
}

console.log(`
Akun demo siap (${target === '--local' ? 'database lokal' : 'produksi'}). Catat sekarang, PIN tidak bisa dilihat lagi.

Pelanggan  /kelola    kode kartu ${ownerCards[0]}   PIN ${ownerPin}
Reseller   /reseller  WhatsApp 080000000001   PIN ${resellerPin}
Admin      /admin     kata sandi admin yang sekarang

Kartu stok reseller demo: ${stockCards.join(', ')}
Hapus semua data demo: npm run demo:hapus
`);
