const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const groupCode = (code) => code.replace(/^(.{4})(.+)$/, '$1-$2');

export const cardUrls = (baseUrl, code) => ({
  nfc: `${baseUrl}/t/${code}`,
  qr: `${baseUrl}/q/${code}`,
});

// QR dibuat di browser. Membuat ratusan QR di Worker melebihi batas CPU paket gratis.
export function renderPrintSheet({ brand, baseUrl, batch, cards }) {
  const faces = cards.map((card) => `
    <article class="qr-tile">
      <div class="qr-box" data-qr="${esc(cardUrls(baseUrl, card.code).qr)}"></div>
      <p class="qr-code">${esc(card.code)}</p>
    </article>`).join('');

  // QR lembar ini membuka aktivasi dengan kedua kode terisi. Kode aktivasi di fragmen tidak terkirim ke server.
  const slips = cards.map((card) => `
    <article class="print-slip">
      <div class="slip-qr" data-qr="${esc(`${baseUrl}/aktivasi/${card.code}#${card.activation_code}`)}"></div>
      <div>
        <p class="print-sub">Kode kartu</p>
        <p class="print-code">${esc(card.code)}</p>
        <p class="print-sub">Kode aktivasi (rahasia)</p>
        <p class="print-code big">${esc(groupCode(card.activation_code))}</p>
        <p class="print-sub">Scan QR ini, atau buka ${esc(baseUrl.replace(/^https?:\/\//, ''))} lalu masukkan kedua kode. Simpan lembar ini untuk memulihkan PIN.</p>
      </div>
    </article>`).join('');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Cetak batch #${batch.id} - ${esc(brand)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/print.css"></head>
<body>
<header class="print-toolbar">
  <div><strong>Batch #${batch.id}</strong> &middot; ${cards.length} kartu ${batch.note ? `&middot; ${esc(batch.note)}` : ''}</div>
  <button type="button" data-print disabled>Menyiapkan QR</button>
</header>
<section class="print-grid">${faces}</section>
<section class="print-grid slips">${slips}</section>
<script type="module" src="/js/print.js"></script>
</body></html>`;
}
