# Panduan TapUlas

Alamat aplikasi: `https://maps.digivo.biz.id`. Tampilan dibuat khusus ponsel: di layar besar pun tetap selebar 480 px.

"TapUlas" nama kerja. Ganti lewat `BRAND` di `wrangler.toml`.

## Cara kerja

NFC dan QR tidak pernah berubah. Keduanya berisi link tetap:

- NFC: `https://maps.digivo.biz.id/t/KODE`
- QR: `https://maps.digivo.biz.id/q/KODE`

Saat dibuka, server mengecek kartu. Kartu belum terjual diarahkan ke tujuan bawaan, atau ke aktivasi kalau tujuan bawaan belum diatur. Kartu aktif diarahkan ke Google. Yang berubah hanya catatan di database, jadi kartu fisik tidak perlu ditulis ulang.

**Jangan pernah menulis link `maps.app.goo.gl` langsung ke chip atau QR.** Link itu tidak bisa diganti dari dashboard, sehingga kartu tidak bisa dijual ke pembeli lain. Chip dan QR harus berisi link dari CSV vendor. Link Google hanya dimasukkan di `/admin`.

## Di mana data tersimpan

| Bagian | Tempat |
| --- | --- |
| Aplikasi | Cloudflare Worker `digivo-maps` |
| Database | Cloudflare D1 `digivo-maps-db`, region APAC, di akun Cloudflare-mu |
| Kata sandi admin | Cloudflare secret `ADMIN_PASSWORD`, tidak ada di kode |
| Kode sumber | Repo GitHub `digivo`, branch `maps-app`, folder `maps/` |

GitHub Pages tidak dipakai untuk aplikasi ini karena hanya melayani file statis. Pages tidak bisa menjalankan redirect dinamis dan tidak punya database.

Cadangkan database secara rutin:

```bash
npm run backup
```

Perintah itu membuat `backup.sql`. Simpan di luar komputer ini. Kehilangan database berarti semua kartu berhenti berfungsi sampai dipulihkan.

## Deploy pembaruan

Pembaruan reseller menambah tabel dan kolom baru, jadi jalankan migrasi **sekali** sebelum deploy. Urutannya wajib: migrasi dulu, baru deploy.

```bash
npm.cmd run db:migrate
```

```bash
npx.cmd wrangler deploy
```

Kalau migrasi dijalankan dua kali, muncul pesan `duplicate column`. Pesan itu tidak merusak data.

Isi `ADMIN_WA` di `wrangler.toml` lalu deploy ulang supaya tombol WhatsApp ke admin muncul.

## Menjalankan di komputer

Butuh Node.js. Perintah awal hanya sekali:

```bash
npm install
```

```bash
npm run db:init:local
```

```bash
npm run seed:local
```

Lalu jalankan, dan buka `http://localhost:3000`:

```bash
npm run dev
```

Akun demo lokal: `/kelola` dengan kode `DEMOKP1`, dan `/reseller` dengan nomor `081200000000`. Keduanya memakai PIN `482915`. Data demo hanya ada di komputer ini. Kata sandi `/admin` lokal ada di `.dev.vars`.

### Alamat penting

| Alamat | Untuk |
| --- | --- |
| `/` | Halaman depan dan input kode kartu |
| `/kelola` | Login pemilik usaha |
| `/admin` | Panel penjual |
| `/reseller` | Panel reseller |
| `/t/KODE`, `/q/KODE` | Link yang tertanam di kartu |

## Alur penjualan

### Persiapan

1. Buka `/admin`, tab **Kartu**. Di **Tujuan kartu belum terjual**, tempel link Maps contoh, misalnya Malioboro. Semua kartu kosong langsung membuka link itu.
2. Buat batch, lalu unduh **CSV vendor**. Kolom `url_nfc` ditulis ke chip, kolom `url_qr` menjadi QR. Tombol **QR dan kode** menampilkan QR dan kode kartu saja, plus lembar aktivasi untuk kemasan.
3. Minta vendor **mengunci chip (lock) setelah ditulis**. Chip yang tidak dikunci bisa ditimpa orang iseng dengan aplikasi NFC gratis.

Setiap kartu kosong sudah bisa dipakai demo, karena membuka link contoh. Jadi tidak perlu menyiapkan kartu demo khusus.

### Jual langsung atau lewat reseller

Cara 1 dan cara 2 sama di sistem. Bedanya hanya kartu mana yang diberikan: kartu baru dari tas, atau kartu yang tadi dipakai demo.

1. Di tab **Aktivasi**, isi kode kartu, nama bisnis, dan link Google Maps pembeli. Jumlah ulasan dan rating boleh diisi, supaya langsung tampil di dasbor pembeli.
2. QR dan NFC langsung mengarah ke bisnis itu. Pembeli mendapat trial Pro 7 hari.
3. Berikan kode kartu dan PIN, atau tekan **Kirim ke WhatsApp pembeli**. PIN hanya tampil sekali.
4. Pembeli **tidak bisa mengganti tujuan QR dan NFC**, dan tidak bisa mereset kartu. Perubahan lewat admin di tab **Bisnis**, atau reseller di tab **Riwayat**.
5. PIN hilang: tekan **PIN baru** di tab **Bisnis** atau **Riwayat**.

Salah mengaktifkan kartu: admin memakai **Kosongkan kartu salah aktivasi** di tab **Kartu**. Kartu kembali ke stok.

### Jual online

Sertakan lembar aktivasi di kemasan. Pembeli memindai QR di lembar itu, kode terisi otomatis, lalu mengisi nama bisnis, link Maps, dan PIN sendiri. Pembeli online tetap bisa mengganti tujuan kartunya dari menu Atur.

Bila kertas panduan dibuat sendiri, gunakan kode kartu dan kode aktivasi dari CSV. Jangan mengarahkan pembeli online untuk menempelkan ponsel ke kartu, karena kartu kosong membuka link demo.

### Reseller

1. Di tab **Reseller**, isi **Daftarkan reseller**. PIN muncul sekali. Reseller masuk di `/reseller` dengan nomor WhatsApp dan PIN itu.
2. Di **Serahkan kartu**, pilih reseller, lalu pilih satu batch atau tempel daftar kode. Kode harus sama dengan kartu fisik yang diserahkan. Kartu kembali ke pusat dengan pilihan **Stok pusat**.
3. Reseller hanya bisa mengaktifkan kartu di stoknya. Kartu milik reseller lain atau stok pusat ditolak.
4. Setiap kartu yang terjual tercatat di tab **Riwayat** reseller: nama bisnis, kode kartu, kode aktivasi, tanggal, dan siapa yang mengaktifkan. Admin melihat jumlah stok dan terjual di daftar reseller, dan bisa mencari nama reseller di tab **Bisnis**.
5. Kartu reseller yang diaktifkan pembeli sendiri tetap tercatat, tetapi reseller tidak bisa mengubah bisnisnya.

Upgrade Pro tetap lewat admin. Setelah bayar, cari bisnisnya di tab **Bisnis**, tekan `+1 bln` atau `+12 bln`.

### Spesifikasi kartu 10 x 10 cm

- **Desain kartu** dibuat terpisah. Aplikasi hanya menyediakan QR dan kode kartu.
- **Chip:** stiker NTAG213 sudah cukup karena URL di sini pendek. Pilih antena lebar, sekitar 25 mm atau lebih, supaya tetap terbaca menembus akrilik.
- **Posisi chip:** tempel di belakang pusat lingkaran "Tempel HP". Tanda dan chip harus sejajar, karena area baca ponsel kecil.
- **Akrilik:** ketebalan menurunkan jarak baca. Uji contoh akrilik dengan chip di beberapa ponsel sebelum memesan massal.
- **Permukaan:** pilih doff. Akrilik mengilap memantulkan lampu dan menyulitkan pemindaian QR.
- **Logam:** jangan letakkan standee langsung di atas meja atau rak logam tanpa uji. Logam dapat mengganggu NFC, kecuali memakai chip anti-logam.
- **Cetak:** minta bukti cetak dan pindai QR-nya sebelum produksi.

## Alur pemilik usaha

Pembeli masuk di `/kelola` dengan kode kartu dan PIN. Beranda menampilkan rating, bintang, dan jumlah ulasan di semua paket.

Lupa PIN dipulihkan dengan kode aktivasi di halaman `/kelola`, atau minta PIN baru ke penjual. Pembeli online bisa mereset kartu di menu Kartu dengan PIN.

## Tanpa API key

Aplikasi berjalan penuh tanpa API key Google. Hanya angka ulasan yang berbeda.

| Fitur | Tanpa API key | Dengan API key |
| --- | --- | --- |
| Link Maps jadi link form ulasan | Bisa | Bisa |
| Cari bisnis dengan mengetik nama | Tidak, tempel link | Bisa |
| Rating dan jumlah ulasan di dasbor | Diisi manual | Otomatis, diperbarui maksimal sekali sehari saat dasbor dibuka |

Link Maps diubah menjadi `search.google.com/local/writereview?placeid=...`, sehingga pelanggan langsung memberi bintang dan menulis. Cara ini memakai format Place ID yang tidak didokumentasikan Google, jadi uji satu tap setiap selesai aktivasi. Kalau konversi gagal, aplikasi memberi peringatan dan link "Minta ulasan" dari Profil Bisnis (`g.page/r/.../review`) menjadi cadangan.

Link pendek `maps.app.goo.gl` diperiksa dulu oleh server. Kalau tidak bisa diverifikasi atau keluar dari Google, link ditolak, karena link pendek pernah disalahgunakan untuk mengarahkan orang ke situs phishing.

Untuk mengaktifkan API key nanti, buat kunci **Places API (New)** di Google Cloud, pasang batas kuota harian, lalu jalankan:

```bash
npx wrangler secret put GOOGLE_PLACES_API_KEY
```

Bagian ini belum diuji dengan kunci sungguhan. Tanpa kunci, Google tidak menyediakan rating lewat link atau embed peta, sudah dicoba. Mengambil angka dari halaman Google tanpa izin melanggar ketentuan Google dan mudah rusak, jadi tidak dipakai.

## Trial Pro

Setiap kartu baru mendapat Pro gratis 7 hari saat aktivasi. Setelah habis, bisnis turun ke Basic otomatis dan kartu tetap berjalan. Trial hanya berlaku sekali per kartu, termasuk setelah reset.

## Before-After

Fitur Pro ini membandingkan jumlah ulasan pertama dengan angka terbaru.

Tujuan kartu yang diganti menghapus angka Before lama, karena tempatnya sudah berbeda.

## Sebelum menjual ke publik

- Tambahkan Syarat Layanan dan Kebijakan Privasi. Aplikasi menyimpan pesan dan kontak pelanggan.
- Harga Rp99.000 dan Rp49.000 di halaman depan hanya usulan. Ubah di `public/pages/home.html`.
- Uji dengan kartu NFC fisik dan link Google Maps bisnis sungguhan.

Paket gratis Cloudflare punya batas CPU per permintaan, jadi PIN memakai `PBKDF2_ITER = "10000"`. Kalau pindah ke Workers Paid, naikkan ke `100000` di `wrangler.toml`. PIN lama tetap berlaku. Cek batas kuota terbaru di halaman harga Cloudflare.

## Tes

```bash
npm test
```
