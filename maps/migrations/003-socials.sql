-- Jalankan SEKALI di database yang sudah ada. Database baru cukup memakai schema.sql.
-- Social media Minipage disimpan sebagai JSON nama akun. Isian Instagram lama ikut dipindahkan.
ALTER TABLE businesses ADD COLUMN socials TEXT NOT NULL DEFAULT '{}';
UPDATE businesses SET socials = json_object('instagram', replace(instagram, '@', '')) WHERE instagram <> '';
