const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const groupCode = (code) => code.replace(/^(.{4})(.+)$/, '$1-$2');

export const cardUrls = (baseUrl, code) => ({
  nfc: `${baseUrl}/t/${code}`,
  qr: `${baseUrl}/q/${code}`,
});

// QR dibuat di browser. Membuat ratusan QR di Worker melebihi batas CPU paket gratis.
export function renderPrintSheet({ brand, baseUrl, batch, cards }) {
  const faces = cards.map((card) => `
    <article class="standee">
      <div class="standee-head">
        <div class="standee-logo"><svg viewBox="0 0 48 48" aria-label="Google"><use href="/icons.svg#google-g"/></svg></div>
        <div>
          <p class="standee-title">Bantu kami dengan<br>ulasan Google</p>
          <svg class="standee-stars" viewBox="0 0 120 22" aria-hidden="true"><use href="/icons.svg#stars5"/></svg>
        </div>
      </div>
      <div class="standee-panel">
        <div class="standee-way">
          <div class="standee-ring"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="/icons.svg#tap"/></svg></div>
          <b>Tempel HP</b>
        </div>
        <span class="standee-or">atau</span>
        <div class="standee-way">
          <div class="standee-qr" data-qr="${esc(cardUrls(baseUrl, card.code).qr)}"></div>
          <b>Scan QR</b>
        </div>
      </div>
      <div class="standee-foot"><span>Kode ${esc(card.code)}</span><span>${esc(brand)}</span></div>
    </article>`).join('');

  const slips = cards.map((card) => `
    <article class="print-slip">
      <p class="print-sub">Kode kartu</p>
      <p class="print-code">${esc(card.code)}</p>
      <p class="print-sub">Kode aktivasi (rahasia)</p>
      <p class="print-code big">${esc(groupCode(card.activation_code))}</p>
      <p class="print-sub">Tempelkan ponsel ke kartu atau buka ${esc(baseUrl.replace(/^https?:\/\//, ''))}, lalu masukkan kedua kode. Simpan lembar ini untuk memulihkan PIN.</p>
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
