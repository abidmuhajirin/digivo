-- Jalankan SEKALI di database yang sudah ada. Database baru cukup memakai schema.sql.
CREATE TABLE IF NOT EXISTS resellers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL DEFAULT '',
  pin_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_pins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
ALTER TABLE businesses ADD COLUMN link_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN reseller_id INTEGER REFERENCES resellers(id);
ALTER TABLE cards ADD COLUMN activated_via TEXT;
CREATE INDEX IF NOT EXISTS cards_reseller ON cards(reseller_id);
