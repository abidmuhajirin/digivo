# TapUlas — Design System

> Folder warna bertumpuk, blok warna penuh, huruf lebar, tombol pil gelap. Warna diambil dari gradien empat sudut pilihan pemilik: kuning, hijau, biru, merah.

**Theme:** light · **Mode:** Operate, kecuali halaman depan (Persuade). Khusus ponsel, lebar kolom maksimal 480px.

## Halaman depan

Halaman depan punya sistem sendiri di `public/css/home.css` dan tidak memuat `app.css`, jadi perubahannya tidak menyentuh dasbor. Isi bagian di bawah ini hanya berlaku untuk aplikasi.

Polanya: blok biru penuh di atas, empat tombol lingkaran kuning, lembar putih dengan tab melengkung, kartu putih berisi contoh dasbor. Warna: biru `#0a6cf5`, ungu `#cb80f5`, kuning `#ffd93b`, koral `#f27b76`, latar `#eef2fa`. Ungu dan koral hanya untuk ikon langkah. Jarak sisi konten 20px, teks di luar kartu 28px. Semua angka contoh wajib berlabel contoh, dan jangan memakai testimoni, nama, atau foto pelanggan karangan.

## Warna

Token ada di `:root`, `public/css/app.css`.

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `yellow` | `#ffe500` | Folder, tombol sekunder, tab aktif di dock |
| `green` | `#3dee1f` | Folder, tiket berhasil, pertambahan ulasan |
| `blue` | `#0066ee` | Folder dengan teks putih, batang grafik |
| `red` | `#ff2d1f` | Folder dengan teks gelap |
| `mesh` | gradien empat sudut | Kartu rating, blok hero, kepala Minipage |
| `ink` / `ink-2` | `#141414` / `#565656` | Teks, tombol utama, dock / keterangan |
| `red-ink` / `green-ink` | `#c00f06` / `#0a6e22` | Teks bahaya dan berhasil di latar putih |
| `yellow-50` | `#fff8b8` | Peringatan ringan, pesan belum dibaca |
| `line` / `line-2` | `#e2e2dd` / `#8e8e88` | Garis antar baris / garis input |
| `canvas` / `surface` | `#f3f3ef` / `#ffffff` | Latar halaman / panel |

Teks di kuning, hijau, dan merah selalu `ink`. Teks di biru selalu putih. Di `mesh`, teks kecil hanya di area atas yang kuning dan hijau. Di bagian biru dan merah, isi harus berada di atas pil putih atau pil gelap.

## Warna per menu

Bilah atas memakai `data-tone` di `body`, diatur dari JS per tab.

| Panel | Kuning | Hijau | Biru | Merah |
|---|---|---|---|---|
| Pembeli | | Kartu | Masukan | Atur |
| Admin | Aktivasi | Kartu | Reseller | Bisnis |
| Reseller | Aktivasi | Stok | Riwayat | Akun |

## Tipografi

Satu keluarga: **Archivo** variabel, tersimpan di `public/fonts/archivo.woff2`. Judul memakai lebar 125%, isi memakai lebar normal. Semua angka `tabular-nums`.

| Peran | Ukuran | Tebal |
|---|---|---|
| Judul halaman depan | 34px, lebar 125% | 800 |
| Angka rating | 72px, lebar 125% | 700 |
| Judul bilah atas | 21px, lebar 125% | 700 |
| Judul panel | 18px, lebar 125% | 700 |
| Isi, label, tombol | 14px | 400–600 |
| Keterangan | 12px, tidak boleh lebih kecil | 400–500 |
| Input | 16px, supaya iOS tidak memperbesar halaman | 400 |

## Bentuk

Dasar 4px. Antar panel 16px, antar field 12px, label ke input 6px.

| Elemen | Tinggi | Radius |
|---|---|---|
| Tombol utama | 52px | penuh |
| Tombol biasa | 44px | penuh |
| Tombol kecil | 36px | penuh |
| Input, select | 48px | 16px |
| Panel, folder | | 24px |
| Dock | | 30px |

**Folder** adalah ciri khas: badan warna dengan tab melengkung setinggi 26px. Kelas `.folder` memberi bentuk, `.f-yellow`, `.f-green`, `.f-red`, `.f-blue`, atau `.f-white` memberi warna. Di dalam `.folders`, tiap folder menimpa folder sebelumnya 14px. Saat ditekan folder turun, saat di-hover naik.

Panel putih tanpa garis tepi. Dock berupa pil gelap mengambang. Select digambar sendiri. Label tombol tidak boleh turun ke dua baris.

## Gerak

Durasi 150–220ms, ease-out. Tanpa blur. Hover hanya untuk perangkat ber-mouse.

## Jangan

- Jangan memakai teks bergradien, atau `mesh` di luar tiga tempat yang tertulis.
- Jangan menaruh teks kecil langsung di bagian biru dan merah pada `mesh`.
- Jangan memakai emoji sebagai ikon. Ikon dari `public/icons.svg`.
- Jangan menulis teks di bawah 12px.
- Jangan menambah warna aksen baru.
- Jangan memakai warna kartu fisik di aplikasi. Desain kartu dibuat terpisah.
