// Menulis SQL data contoh untuk database LOKAL saja. Jangan dijalankan ke database produksi.
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomCode } from '../src/db.js';
import { hashPin } from '../src/security.js';

const DEMO_PIN = '482915';
const DAY = 86_400_000;
const now = Date.now();
const lines = [];
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

lines.push(`INSERT INTO batches (id, note, qty, created_at) VALUES (1, 'Stok awal', 12, ${now}), (2, 'Kartu demo', 3, ${now});`);
for (let i = 0; i < 12; i++) {
  lines.push(`INSERT INTO cards (code, activation_code, batch_id, created_at) VALUES ('${randomCode(7)}', '${randomCode(8)}', 1, ${now});`);
}

lines.push(`INSERT INTO businesses (id, name, review_url, link_kind, pin_hash, plan, pro_until, mode, tagline, is_demo, created_at)
  VALUES (1, 'Kopi Contoh (Demo)', 'https://www.google.com/maps/search/kopi', 'maps', ${quote(await hashPin(DEMO_PIN))}, 'pro', ${now + 365 * DAY}, 'page',
  'Data di akun ini simulasi, bukan pelanggan nyata.', 1, ${now - 30 * DAY});`);

['Kasir', 'Meja 1', 'Meja 5'].forEach((label, i) => {
  lines.push(`INSERT INTO cards (id, code, activation_code, batch_id, business_id, label, activated_at, trial_used, created_at)
    VALUES (${100 + i}, 'DEMOKP${i + 1}', '${randomCode(8)}', 2, 1, '${label}', ${now - 30 * DAY}, 1, ${now});`);
});

// Generator tetap agar tampilan demo sama setiap kali di-seed.
let state = 7;
const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
const hourWeights = [0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 4, 7, 7, 4, 3, 3, 4, 6, 8, 8, 5, 2, 1];
const hourPool = hourWeights.flatMap((weight, hour) => Array(weight).fill(hour));

for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
  const taps = 4 + Math.floor(random() * 14);
  for (let i = 0; i < taps; i++) {
    const hour = hourPool[Math.floor(random() * hourPool.length)];
    const day = new Date(now - daysAgo * DAY);
    day.setUTCHours(hour - 7, Math.floor(random() * 60));
    const ts = Math.min(day.getTime(), now - 60_000);
    const card = 100 + (random() < 0.55 ? 0 : random() < 0.7 ? 1 : 2);
    const source = random() < 0.72 ? 'nfc' : 'qr';
    lines.push(`INSERT INTO events (card_id, business_id, type, source, ts) VALUES (${card}, 1, 'tap', '${source}', ${ts});`);
    if (random() < 0.62) lines.push(`INSERT INTO events (card_id, business_id, type, source, ts) VALUES (${card}, 1, 'review_click', '${source}', ${ts + 4000});`);
  }
}

lines.push(`INSERT INTO feedback (business_id, card_id, message, created_at) VALUES (1, 101, 'Contoh pesan demo: AC di area dalam kurang dingin saat siang.', ${now - 2 * 3600_000});`);
lines.push(`INSERT INTO feedback (business_id, card_id, message, contact, created_at) VALUES (1, 100, 'Contoh pesan demo: mohon tambah pilihan pembayaran QRIS di kasir.', 'email@example.com', ${now - DAY});`);
lines.push(`INSERT INTO review_snapshots (business_id, review_count, rating, source, taken_at) VALUES (1, 18, 4.3, 'manual', ${now - 30 * DAY}), (1, 63, 4.6, 'manual', ${now - DAY});`);

mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/seed.sql', lines.join('\n'));
console.log(`Demo lokal: masuk di /kelola dengan kartu DEMOKP1 dan PIN ${DEMO_PIN}.`);
