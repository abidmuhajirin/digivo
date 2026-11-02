// Tanpa 0/O, 1/I/L supaya kode cetakan tidak tertukar saat diketik.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LIMIT = 256 - (256 % ALPHABET.length);

export function randomCode(length) {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < LIMIT && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export async function createBatch(db, qty, note = '') {
  const now = Date.now();
  const batch = await db.prepare('INSERT INTO batches (note, qty, created_at) VALUES (?, ?, ?)').bind(note, qty, now).run();
  const batchId = batch.meta.last_row_id;
  const insert = db.prepare('INSERT OR IGNORE INTO cards (code, activation_code, batch_id, created_at) VALUES (?, ?, ?, ?)');

  let made = 0;
  while (made < qty) {
    const statements = Array.from({ length: qty - made }, () => insert.bind(randomCode(7), randomCode(8), batchId, now));
    const results = await db.batch(statements);
    made += results.reduce((sum, result) => sum + result.meta.changes, 0);
  }
  return batchId;
}
