import { api, bindForm, esc, icon } from '/js/common.js';

const check = document.getElementById('check');
const form = document.getElementById('activate');
const suggest = document.getElementById('suggest');
const picked = document.getElementById('picked');
const linkBox = document.getElementById('link-box');
const linkNote = document.getElementById('link-note');
const nameHint = document.getElementById('name-hint');
let placeId = null;

const codeFromPath = location.pathname.split('/')[2];
if (codeFromPath) check.code.value = codeFromPath;
// QR di lembar aktivasi membawa kodenya di fragmen, jadi pembeli online tidak perlu mengetik.
if (location.hash.length > 1) {
  check.activationCode.value = location.hash.slice(1);
  check.activationCode.dispatchEvent(new Event('input', { bubbles: true }));
}
(codeFromPath ? check.activationCode : check.code).focus();

// Kode kartu dan kode aktivasi ikut di setiap panggilan yang memakai kuota Google.
const codes = () => ({ code: form.code.value, activationCode: form.activationCode.value });

// Langkah 1: kode dicek dulu. Isian bisnis dan PIN baru tampil setelah kodenya cocok.
bindForm(check, async (values, message) => {
  try {
    const { code } = await api('/api/activate/check', { method: 'POST', body: values });
    form.code.value = code;
    form.activationCode.value = values.activationCode;
    document.getElementById('verified-code').textContent = code;
    check.hidden = true;
    form.hidden = false;
    form.name.focus();
  } catch (error) {
    if (error.status !== 409) throw error;
    message.innerHTML = `${esc(error.message)} <a class="text-link" href="/kelola?kartu=${encodeURIComponent(values.code.toUpperCase())}">Masuk</a>`;
  }
});

document.getElementById('change-code').addEventListener('click', () => {
  form.hidden = true;
  check.hidden = false;
  check.code.focus();
});

const config = await api('/api/config').catch(() => ({ placesEnabled: false }));

if (config.placesEnabled) {
  nameHint.hidden = false;
  let timer;
  form.name.addEventListener('input', () => {
    placeId = null;
    picked.hidden = true;
    linkBox.hidden = false;
    clearTimeout(timer);
    const query = form.name.value.trim();
    if (query.length < 3) { suggest.hidden = true; return; }
    timer = setTimeout(async () => {
      try {
        const { places } = await api('/api/places', { method: 'POST', body: { q: query, ...codes() } });
        suggest.innerHTML = places.map((place, i) => `
          <li><button type="button" data-i="${i}">${esc(place.name)}<small>${esc(place.address)}</small></button></li>`).join('');
        suggest.hidden = !places.length;
        suggest.onclick = (event) => {
          const button = event.target.closest('button');
          if (!button) return;
          const place = places[Number(button.dataset.i)];
          placeId = place.placeId;
          form.name.value = place.name;
          suggest.hidden = true;
          linkBox.hidden = true;
          picked.hidden = false;
          picked.innerHTML = `${icon('check')}<span>${esc(place.address)}. Bukan bisnis Anda? Ubah nama untuk mencari lagi.</span>`;
        };
      } catch {
        suggest.hidden = true;
      }
    }, 300);
  });
}

form.link.addEventListener('change', async () => {
  linkNote.hidden = true;
  if (!form.link.value.trim()) return;
  try {
    const result = await api('/api/resolve-link', { method: 'POST', body: { link: form.link.value, ...codes() } });
    linkNote.classList.toggle('warn', result.kind !== 'review');
    linkNote.innerHTML = result.kind === 'review'
      ? `${icon('check')}<span>Link langsung ke form ulasan.</span>`
      : `${icon('open')}<span>Link diterima, tapi pelanggan perlu mengetuk "Ulasan" sekali lagi. Link "Minta ulasan" dari Profil Bisnis lebih mulus.</span>`;
    if (result.nameGuess && !form.name.value) form.name.value = result.nameGuess;
  } catch (error) {
    linkNote.classList.add('warn');
    linkNote.textContent = error.message;
  }
  linkNote.hidden = false;
});

bindForm(form, async (values) => {
  if (!placeId && !values.link.trim()) throw new Error('Pilih bisnis dari hasil pencarian atau tempel link Google Maps.');
  const result = await api('/api/activate', { method: 'POST', body: { ...values, placeId } });
  form.hidden = true;
  const done = document.getElementById('done');
  done.hidden = false;
  done.innerHTML = `
    <article class="ticket">
      <div class="ticket-top">
        <div class="ticket-seal">${icon('check')}</div>
        <p class="muted">${esc(result.name)}</p>
        <h2>Kartu aktif</h2>
      </div>
      <dl>
        <div><dt>Kode kartu</dt><dd>${esc(result.code)}</dd></div>
        <div><dt>Tujuan</dt><dd>${result.kind === 'review' ? 'Form ulasan Google' : 'Halaman Google Maps'}</dd></div>
        <div><dt>Paket</dt><dd>${result.trial ? `Trial Pro ${result.trialDays} hari` : 'Basic'}</dd></div>
        <div><dt>Status</dt><dd>Siap ditempel</dd></div>
      </dl>
    </article>
    <a class="cta" href="${esc(result.reviewUrl)}" target="_blank" rel="noopener">Buka halaman ulasan</a>
    <a class="btn" href="/app">Buka dasbor</a>
    <p class="muted">Tempelkan ponsel ke kartu sekali lagi untuk mengujinya. Simpan lembar aktivasi di tempat aman.</p>`;
  scrollTo({ top: 0 });
});
