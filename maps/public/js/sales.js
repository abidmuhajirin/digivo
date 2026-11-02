import { esc, waUrl } from '/js/common.js';

// Bagian yang sama di panel admin dan panel reseller.

export const destinationNote = (kind) => (kind === 'review'
  ? 'Langsung ke form ulasan.'
  : 'Ke halaman Maps. Pelanggan perlu mengetuk Ulasan sekali lagi.');

export const buyerFormFields = `
  <label class="field"><span>Kode kartu</span><input class="code" name="code" maxlength="10" required placeholder="7 karakter"></label>
  <label class="field"><span>Nama bisnis</span><input name="name" maxlength="80" required placeholder="Nama sesuai Google Maps"></label>
  <label class="field"><span>Link Google Maps</span><input name="link" inputmode="url" required placeholder="https://maps.app.goo.gl/..."></label>
  <div class="split-fields">
    <label class="field"><span>Jumlah ulasan</span><input name="reviewCount" inputmode="numeric" maxlength="7" placeholder="Opsional"></label>
    <label class="field"><span>Rating</span><input name="rating" inputmode="decimal" maxlength="3" placeholder="Misal: 4,5"></label>
  </div>
  <p class="form-msg" role="alert"></p>
  <button class="cta" type="submit">Aktifkan kartu</button>`;

const buyerMessage = ({ name, code, pin }, origin) =>
  `Kartu ulasan ${name} sudah aktif.\nMasuk: ${origin}/kelola\nKode kartu: ${code}\nPIN: ${pin}\nSimpan PIN ini.`;

export function activationTicket(result) {
  if (!result) return '';
  const { name, code, pin, kind, trial, trialDays } = result;
  return `
    <article class="ticket" id="result">
      <div class="ticket-top"><p class="muted">${esc(name)}</p><h2>Kartu aktif</h2></div>
      <dl class="ticket-secret">
        <div><dt>Kode kartu</dt><dd>${esc(code)}</dd></div>
        <div><dt>PIN pembeli</dt><dd>${esc(pin)}</dd></div>
      </dl>
      <dl>
        <div><dt>Paket</dt><dd>${trial ? `Trial Pro ${trialDays} hari` : 'Basic'}</dd></div>
        <div><dt>Tujuan</dt><dd>${esc(destinationNote(kind))}</dd></div>
      </dl>
      <p class="muted">PIN tidak bisa dilihat lagi. Pembeli tidak bisa mengganti tujuan kartu, jadi perubahan lewat Anda.</p>
      <a class="btn btn-light" href="${esc(waUrl('', buyerMessage(result, location.origin)))}" target="_blank" rel="noopener">Kirim ke WhatsApp pembeli</a>
    </article>`;
}

export function pinTicket({ title, name, pin }) {
  return `
    <article class="ticket" id="result">
      <div class="ticket-top"><p class="muted">${esc(name)}</p><h2>${esc(title)}</h2></div>
      <dl class="ticket-secret"><div><dt>PIN</dt><dd>${esc(pin)}</dd></div></dl>
      <p class="muted">PIN tidak bisa dilihat lagi. Berikan sekarang.</p>
    </article>`;
}

export const showResult = () => document.getElementById('result')?.scrollIntoView({ block: 'center' });
