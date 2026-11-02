# TapUlas — Design System

> Mengikuti `DESIGN.md` KasirBosku (`D:\claude-worldAI\DESIGN.md`): tenang, cepat dibaca, garis tipis, angka rapi. Warnanya memakai tone Google.

**Theme:** light · **Mode:** Operate, kecuali halaman depan (Persuade). Khusus ponsel, lebar kolom maksimal 480px.

## Warna

Token ada di `:root`, `public/css/app.css`.

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `blue-700` | `#1967d2` | Tombol utama, tab aktif, link |
| `blue-600` | `#1a73e8` | Logo, cincin fokus, batang grafik |
| `blue-50` | `#e8f0fe` | Tombol lembut, latar pilihan aktif |
| `yellow` | `#fbbc04` | Hanya bintang rating |
| `green` / `green-50` | `#137333` / `#e6f4ea` | Berhasil, kartu aktif, pertambahan ulasan |
| `red` / `red-50` | `#c5221f` / `#fce8e6` | Hapus, nonaktifkan, kosongkan |
| `amber-50` / `amber-900` | `#fef7e0` / `#7a4f01` | Peringatan ringan |
| `text` / `text-2` | `#202124` / `#5f6368` | Teks utama / keterangan |
| `line` / `line-2` | `#dadce0` / `#bdc1c6` | Garis kartu / garis input |
| `canvas` | `#f8f9fa` | Latar halaman, kartu putih di atasnya |

Merah hanya untuk tindakan yang menghapus atau mematikan. Hijau hanya untuk hasil berhasil. Jangan menambah warna aksen baru.

## Tipografi

Satu font: **Inter**, tersimpan di `public/fonts/inter.woff2`. Semua angka `tabular-nums`.

| Peran | Ukuran | Tebal |
|---|---|---|
| Judul halaman depan | 36px | 700 |
| Judul halaman | 16px di bilah atas | 600 |
| Judul kartu | 16px | 600 |
| Angka rating | 40px | 600 |
| Angka statistik | 20–24px | 600 |
| Isi, label, tombol | 14px | 400–600 |
| Keterangan | 12px, tidak boleh lebih kecil | 400–500 |
| Input | 16px, supaya iOS tidak memperbesar halaman | 400 |

## Jarak dan bentuk

Dasar 4px. Dalam kartu 16px, antar kartu 20px, antar field 12px, label ke input 6px.

| Elemen | Tinggi | Radius |
|---|---|---|
| Input, select, tombol utama | 44px | 12px |
| Tombol kecil | 36px | 8px |
| Kartu | | 16px |
| Label status | | penuh |

Kartu tanpa bayangan, cukup garis 1px. Kartu terpilih memakai garis plus `inset` 1px. Select digambar sendiri. Label tombol tidak boleh turun ke dua baris.

## Gerak

Durasi 150–220ms, ease-out. Tanpa blur. Hover hanya untuk perangkat ber-mouse.

## Jangan

- Jangan memakai gradien, teks bergradien, atau bayangan besar di kartu.
- Jangan memakai emoji sebagai ikon. Ikon dari `public/icons.svg`.
- Jangan menulis teks di bawah 12px.
- Jangan memakai warna kartu fisik di aplikasi. Desain kartu dibuat terpisah.
