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

## Menyelesaikan deploy

Worker dan database sudah dibuat, dan record CNAME `maps` lama sudah dihapus. Jalankan berurutan dari folder proyek.

1. Perbarui tabel database. Perintah ini aman diulang:

```bash
npm run db:init
```

2. Deploy. Cloudflare membuat DNS `maps` dan sertifikat HTTPS otomatis:

```bash
npx wrangler deploy
```

3. Pasang kata sandi admin. Salin nilai `ADMIN_PASSWORD` dari file `.dev.vars` saat diminta:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Lalu buka `https://maps.digivo.biz.id/admin`. Isi `ADMIN_WA` di `wrangler.toml` dan deploy ulang supaya tombol WhatsApp muncul.

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

Masuk ke akun demo lokal di `/kelola` dengan kode `DEMOKP1` dan PIN `482915`. Data demo hanya ada di komputer ini. Kata sandi `/admin` lokal ada di `.dev.vars`.

### Alamat penting

| Alamat | Untuk |
| --- | --- |
| `/` | Halaman depan dan input kode kartu |
| `/kelola` | Login pemilik usaha |
| `/admin` | Panel penjual |
| `/t/KODE`, `/q/KODE` | Link yang tertanam di kartu |

## Alur penjual

1. Buka `/admin`. Di **Tujuan kartu belum terjual**, tempel link Maps contoh, misalnya Malioboro. Semua kartu belum terjual langsung mengarah ke sana untuk demo.
2. Buat batch, misalnya 100 kartu, lalu unduh **CSV vendor**. Kolom `url_nfc` ditulis ke chip, kolom `url_qr` dicetak sebagai QR. Tombol **Lembar cetak** berguna untuk contoh dan produksi kecil.
3. Minta vendor **mengunci chip (lock) setelah ditulis**. Chip yang tidak dikunci bisa ditimpa orang iseng dengan aplikasi NFC gratis.
4. Sertakan **lembar aktivasi** di setiap kemasan, bukan dicetak di kartu. Kode aktivasi mencegah orang lain mengklaim kartu lebih dulu.
5. Ada pembeli: di **Atur kartu untuk pembeli**, isi kode kartu, nama bisnis, dan link Google Maps-nya. Kartu langsung mengarah ke bisnis itu dan mendapat trial Pro 7 hari.
6. Berikan kode kartu dan PIN yang muncul ke pembeli. PIN hanya tampil sekali. Kalau hilang, pembeli memakai Lupa PIN dengan kode aktivasi.
7. Salah link atau pindah lokasi: di daftar **Bisnis**, buka **Ganti nama atau link**.
8. Pembeli upgrade lewat WhatsApp. Setelah bayar, cari bisnisnya, tekan `+1 bln` atau `+12 bln`.

Panel admin dan aplikasi khusus ponsel, tetapi cetak lembar A4 lebih nyaman dari komputer.

### Spesifikasi kartu 10 x 10 cm

- **Lembar cetak** berukuran 100 x 100 mm, 4 kartu per A4. Lembar aktivasi ada di halaman terpisah.
- **Chip:** stiker NTAG213 sudah cukup karena URL di sini pendek. Pilih antena lebar, sekitar 25 mm atau lebih, supaya tetap terbaca menembus akrilik.
- **Posisi chip:** tempel di belakang pusat lingkaran "Tempel HP". Tanda dan chip harus sejajar, karena area baca ponsel kecil.
- **Akrilik:** ketebalan menurunkan jarak baca. Uji contoh akrilik dengan chip di beberapa ponsel sebelum memesan massal.
- **Permukaan:** pilih doff. Akrilik mengilap memantulkan lampu dan menyulitkan pemindaian QR.
- **Logam:** jangan letakkan standee langsung di atas meja atau rak logam tanpa uji. Logam dapat mengganggu NFC, kecuali memakai chip anti-logam.
- **Cetak:** minta bukti cetak dan pindai QR-nya sebelum produksi.

## Alur pemilik usaha

Kalau pembeli mengaktifkan sendiri, bukan lewat admin:

1. Buka halaman depan dan masukkan kode kartu. Kalau tujuan bawaan belum diatur, tempelkan ponsel ke kartu juga bisa.
2. Isi kode aktivasi, nama bisnis, link Google Maps, dan PIN 6 angka.
3. Kartu aktif. Tempelkan lagi untuk menguji.
4. Kelola di `/kelola` dengan kode kartu dan PIN.

Lupa PIN dipulihkan dengan kode aktivasi di halaman `/kelola`. Reset kartu ada di menu Kartu dan memerlukan PIN.

## Tanpa API key

Aplikasi berjalan penuh tanpa API key Google.

| Fitur | Tanpa API key | Dengan API key |
| --- | --- | --- |
| Link Maps jadi link form ulasan | Bisa | Bisa |
| Cari bisnis dengan mengetik nama | Tidak, tempel link | Bisa |
| Jumlah ulasan untuk Before-After | Diisi manual | Otomatis |

Link Maps diubah menjadi `search.google.com/local/writereview?placeid=...`, sehingga pelanggan langsung memberi bintang dan menulis. Cara ini memakai format Place ID yang tidak didokumentasikan Google, jadi uji satu tap setiap selesai aktivasi. Kalau konversi gagal, aplikasi memberi peringatan dan link "Minta ulasan" dari Profil Bisnis (`g.page/r/.../review`) menjadi cadangan.

Link pendek `maps.app.goo.gl` diperiksa dulu oleh server. Kalau tidak bisa diverifikasi atau keluar dari Google, link ditolak, karena link pendek pernah disalahgunakan untuk mengarahkan orang ke situs phishing.

Untuk mengaktifkan API key nanti, buat kunci **Places API (New)** di Google Cloud, pasang batas kuota harian, lalu jalankan:

```bash
npx wrangler secret put GOOGLE_PLACES_API_KEY
```

Bagian ini belum diuji dengan kunci sungguhan.

## Trial Pro

Setiap kartu baru mendapat Pro gratis 7 hari saat aktivasi. Setelah habis, bisnis turun ke Basic otomatis dan kartu tetap berjalan. Trial hanya berlaku sekali per kartu, termasuk setelah reset.

## Before-After

Fitur ini membandingkan jumlah ulasan saat aktivasi dengan sekarang. Pemilik mengisi angka Sebelum saat aktivasi, lalu memperbarui angka sekarang dari dasbor. Dengan API key, angka diambil otomatis maksimal sekali sehari.

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
