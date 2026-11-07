const encoder = new TextEncoder();
const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/.{2}/g), (pair) => parseInt(pair, 16));
const sha256 = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

// Jumlah iterasi tersimpan di hash, jadi bisa dinaikkan tanpa merusak PIN lama.
export async function hashPin(pin, iterations = 10_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${iterations}:${toHex(salt)}:${toHex(await derive(pin, salt, iterations))}`;
}

export async function verifyPin(pin, stored) {
  const [iterations, salt, hash] = stored.split(':');
  return sameBytes(await derive(pin, fromHex(salt), Number(iterations)), fromHex(hash));
}

export async function safeEqual(a, b) {
  return sameBytes(await sha256(String(a)), await sha256(String(b)));
}

// Pemilik bebas memilih 6 angka apa pun. Tebakan beruntun tetap dihadang kunci 15 menit setelah 5 kali salah.
export function pinProblem(pin) {
  return /^\d{6}$/.test(String(pin ?? '')) ? null : 'PIN harus 6 angka.';
}

export function randomPin() {
  while (true) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const pin = String(value).padStart(6, '0');
    if (!pinProblem(pin)) return pin;
  }
}

const sessionHash = async (token) => toHex(await sha256(token));

export async function createSession(db, kind, businessId, ttlMs) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare('INSERT INTO sessions (token_hash, kind, business_id, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sessionHash(token), kind, businessId, Date.now() + ttlMs).run();
  return token;
}

export async function readSession(db, token, kind) {
  if (!token) return null;
  const row = await db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND kind = ?')
    .bind(await sessionHash(token), kind).first();
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}

export async function destroySession(db, token) {
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sessionHash(token)).run();
}

// Memori Worker tidak dibagi antar-instance, jadi hitungan percobaan disimpan di D1.
export async function allow(db, key, max, windowMs) {
  const now = Date.now();
  const row = await db.prepare(`
    INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN reset_at < ?3 THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at < ?3 THEN ?2 ELSE reset_at END
    RETURNING count`).bind(key, now + windowMs, now).first();

  if (Math.random() < 0.02) {
    await db.batch([
      db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now),
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    ]);
  }
  return row.count <= max;
}
