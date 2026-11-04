-- Menghapus semua data akun demo yang dibuat scripts/seed-demo.js. Data pelanggan sungguhan tidak tersentuh:
-- yang dihapus hanya kartu di batch 'Akun demo TapUlas (seed-demo)', bisnis demo, dan reseller demo.
DELETE FROM events WHERE card_id IN (SELECT id FROM cards WHERE batch_id IN (SELECT id FROM batches WHERE note = 'Akun demo TapUlas (seed-demo)'))
  OR business_id IN (SELECT id FROM businesses WHERE name = 'Sate Dino Pak Ti Rek! (Demo)' AND is_demo = 1);
DELETE FROM feedback WHERE card_id IN (SELECT id FROM cards WHERE batch_id IN (SELECT id FROM batches WHERE note = 'Akun demo TapUlas (seed-demo)'))
  OR business_id IN (SELECT id FROM businesses WHERE name = 'Sate Dino Pak Ti Rek! (Demo)' AND is_demo = 1);
DELETE FROM review_snapshots WHERE business_id IN (SELECT id FROM businesses WHERE name = 'Sate Dino Pak Ti Rek! (Demo)' AND is_demo = 1);
DELETE FROM sessions WHERE (kind = 'owner' AND business_id IN (SELECT id FROM businesses WHERE name = 'Sate Dino Pak Ti Rek! (Demo)' AND is_demo = 1))
  OR (kind = 'reseller' AND business_id IN (SELECT id FROM resellers WHERE whatsapp = '6280000000001'));
DELETE FROM cards WHERE batch_id IN (SELECT id FROM batches WHERE note = 'Akun demo TapUlas (seed-demo)');
DELETE FROM businesses WHERE name = 'Sate Dino Pak Ti Rek! (Demo)' AND is_demo = 1;
UPDATE cards SET reseller_id = NULL WHERE reseller_id IN (SELECT id FROM resellers WHERE whatsapp = '6280000000001');
DELETE FROM resellers WHERE whatsapp = '6280000000001';
DELETE FROM batches WHERE note = 'Akun demo TapUlas (seed-demo)';
