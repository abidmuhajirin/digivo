import { api, bindForm, esc, formatDate, icon, moveDock, toast, waUrl } from '/js/common.js';

const view = document.getElementById('view');
const dock = document.querySelector('.dock');
const brand = document.body.dataset.brand;
const TABS = ['beranda', 'masukan', 'kartu', 'atur'];
const TONES = { beranda: 'yellow', masukan: 'blue', kartu: 'green', atur: 'red' };
const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

let me;
let stats;
let loadedAt = 0;
let inboxCache = null;

const isPro = () => me.business.plan === 'pro';
const trialDaysLeft = () => Math.max(1, Math.ceil((me.business.proUntil - Date.now()) / 86_400_000));
const firstCardUrl = () => `${me.baseUrl}/q/${me.cards[0]?.code}`;

function upgradeBlock(title, text) {
  const link = me.adminWa
    ? `<a class="btn btn-light btn-small" href="${esc(waUrl(me.adminWa, `Halo, saya mau upgrade ke Pro untuk ${me.business.name}.`))}" target="_blank" rel="noopener">Upgrade ke Pro</a>`
    : '<p class="muted">Hubungi penjual kartu untuk upgrade.</p>';
  return `<div class="locked"><h3>${icon('lock')}${esc(title)}</h3><p class="muted">${esc(text)}</p>${link}</div>`;
}

function capsules(week) {
  const peak = Math.max(1, ...week.map((day) => day.n));
  return `<div class="capsules" role="img" aria-label="Tap per hari selama 7 hari terakhir">${week.map((day) => `
    <div class="capsule"><b>${day.n}</b>
      <div class="capsule-track"><div class="capsule-fill" data-h="${Math.round((day.n / peak) * 100)}"></div></div>
      ${DAY_NAMES[new Date(`${day.d}T12:00:00Z`).getUTCDay()]}
    </div>`).join('')}</div>`;
}

function hoursChart(hours) {
  const peak = Math.max(1, ...hours);
  const top = hours.indexOf(Math.max(...hours));
  return `
    <p class="muted">Paling ramai sekitar pukul ${String(top).padStart(2, '0')}.00 WIB. Taruh kartu di tempat yang terlihat pada jam ini.</p>
    <div class="hours" role="img" aria-label="Sebaran tap per jam">${hours.map((n) => `<i data-h="${Math.round((n / peak) * 100)}"></i>`).join('')}</div>
    <div class="hours-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>`;
}

function trialPanel() {
  const link = me.adminWa
    ? `<a class="btn btn-light btn-small" href="${esc(waUrl(me.adminWa, `Halo, saya mau lanjut Pro untuk ${me.business.name}.`))}" target="_blank" rel="noopener">Lanjutkan Pro</a>`
    : '';
  return `<section class="panel">
    <div class="panel-head"><h2>Trial Pro</h2><span class="num">${trialDaysLeft()} hari lagi</span></div>
    <p class="muted">Semua fitur Pro terbuka sampai ${formatDate(me.business.proUntil)}. Setelah itu kartu tetap berjalan dan fitur Pro terkunci.</p>
    ${link}
  </section>`;
}

function snapshotCell(label, snapshot) {
  return `<div><small>${label}</small><span class="num">${snapshot.count}</span>
    <small>${snapshot.rating ? `Rating ${String(snapshot.rating).replace('.', ',')} · ` : ''}${formatDate(snapshot.at)}</small></div>`;
}

function beforeAfterPanel() {
  const data = stats.beforeAfter;
  return `<section class="panel">
    <h2>Before-After ulasan</h2>
    <div class="split ba-split">
      ${snapshotCell('Sebelum', data.before)}
      ${data.after ? snapshotCell('Sekarang', data.after) : '<div><small>Sekarang</small><span class="num">-</span><small>Belum ada data baru</small></div>'}
    </div>
    ${data.after ? `<p class="ba-gain">${data.gained >= 0 ? '+' : ''}${data.gained} ulasan sejak titik awal</p>` : ''}
    <p class="muted">Angka ini mencakup semua ulasan, termasuk yang tidak lewat kartu.</p>
  </section>`;
}

const formatRating = (rating) => rating.toFixed(1).replace('.', ',');

function reviewForm(hasData) {
  return `
    <form id="review-form" class="stack-sm">
      <div class="split-fields">
        <label class="field"><span>Jumlah ulasan</span><input name="reviewCount" inputmode="numeric" maxlength="7" required></label>
        <label class="field"><span>Rating</span><input name="rating" inputmode="decimal" maxlength="3" required placeholder="Misal: 4,9"></label>
      </div>
      <p class="form-msg" role="alert"></p>
      <button class="btn btn-small" type="submit">${hasData ? 'Perbarui angka' : 'Simpan angka'}</button>
    </form>`;
}

function reviewsPanel() {
  const { business } = me;
  const data = stats.reviews;
  const form = business.reviewTracking ? '' : data
    ? `<details class="drawer"><summary>Perbarui angka</summary><p class="muted">Salin angka dari profil bisnis di Google Maps.</p>${reviewForm(true)}</details>`
    : `<p class="muted">Salin rating dan jumlah ulasan dari profil bisnis di Google Maps.</p>${reviewForm(false)}`;
  const head = '<div class="review-head"><svg viewBox="0 0 48 48" aria-hidden="true"><use href="/icons.svg#google-g"/></svg><h2>Ulasan Google</h2></div>';
  if (!data) {
    return `<section class="panel">
      ${head}
      ${business.reviewTracking ? '<p class="muted">Angka pertama muncul setelah Google merespons.</p>' : ''}
      ${form}
    </section>`;
  }
  return `<section class="folder score-card">
      ${head}
      ${data.rating ? `
      <b class="review-score">${formatRating(data.rating)}</b>
      <span class="star-track" role="img" aria-label="Rating ${formatRating(data.rating)} dari 5"><svg viewBox="0 0 120 22" aria-hidden="true"><use href="/icons.svg#stars5"/></svg><span class="star-fill" data-w="${Math.round((data.rating / 5) * 100)}"><svg viewBox="0 0 120 22" aria-hidden="true"><use href="/icons.svg#stars5"/></svg></span></span>` : ''}
      <p class="review-count${data.rating ? '' : ' review-count-only'}">${data.count.toLocaleString('id-ID')} ulasan</p>
      <p class="score-source">${data.source === 'google' ? 'Otomatis dari Google' : 'Diisi manual'}, ${formatDate(data.at)}</p>
    </section>
    ${form ? `<section class="panel">${form}</section>` : ''}`;
}

function renderBeranda() {
  const { business } = me;
  const sources = Object.fromEntries((stats.sources ?? []).map((row) => [row.source, row.n]));
  const pro = isPro();
  const clicks = stats.reviewClicks ?? 0;

  view.innerHTML = `
    <div class="greet">
      <span class="business-name">${esc(business.name)}</span>
      <span class="plan-chip ${pro ? 'pro' : ''}">${business.isTrial ? 'Trial Pro' : pro ? 'Pro' : 'Basic'}</span>
    </div>

    <main class="wrap app-main stack">
      ${reviewsPanel()}

      <div class="folders">
        <a class="folder folder-link f-green" href="${esc(waUrl('', `Terima kasih sudah berkunjung ke ${business.name}. Bantu kami dengan memberi ulasan: ${firstCardUrl()}`))}" target="_blank" rel="noopener"><span>Kirim WA</span>${icon('share')}</a>
        <button class="folder folder-link f-red" id="copy-link"><span>Salin link</span>${icon('copy')}</button>
        <a class="folder folder-link f-blue" href="${esc(business.reviewUrl)}" target="_blank" rel="noopener"><span>Uji tujuan</span>${icon('open')}</a>
      </div>

      ${business.isTrial ? trialPanel() : ''}
      ${pro && stats.beforeAfter ? beforeAfterPanel() : ''}

      <section class="panel">
        <div class="panel-head"><h2>Tap minggu ini</h2><span class="num">${stats.weekTotal}</span></div>
        ${stats.total === 0
          ? '<p class="muted">Belum ada tap. Tempelkan ponsel ke kartu untuk memastikan semuanya berjalan, lalu letakkan kartu di kasir.</p>'
          : capsules(stats.week)}
        <p class="muted">Total ${stats.total.toLocaleString('id-ID')} tap dari ${me.cards.length} kartu.</p>
      </section>

      ${pro ? `
      <section class="panel">
        <h2>30 hari terakhir</h2>
        <div class="split">
          <div><span class="num">${stats.monthTaps}</span><small>Tap kartu</small></div>
          <div><span class="num">${clicks}</span><small>Lanjut ke Google</small></div>
          <div><span class="num">${sources.nfc ?? 0}</span><small>Lewat NFC</small></div>
          <div><span class="num">${sources.qr ?? 0}</span><small>Lewat QR</small></div>
        </div>
        ${business.mode === 'page' ? '' : '<p class="muted">"Lanjut ke Google" hanya terhitung saat Minipage aktif.</p>'}
      </section>
      <section class="panel"><h2>Jam ramai</h2>${stats.monthTaps ? hoursChart(stats.hours) : '<p class="muted">Muncul setelah ada tap pertama.</p>'}</section>
      <section class="panel">
        <h2>Kartu paling aktif</h2>
        <ul class="list">${stats.perCard.map((card, i) => `
          <li><span class="round">${i + 1}</span>
            <span class="grow">${esc(card.label || card.code)}${card.label ? `<small>${esc(card.code)}</small>` : ''}</span>
            <span class="num">${card.n}</span></li>`).join('')}</ul>
      </section>`
      : `<section class="panel">${upgradeBlock('Lihat hasil kartu Anda', 'Before-After jumlah ulasan, performa per kasir atau meja, jam ramai, dan data 30 hari ada di paket Pro.')}</section>`}
    </main>`;

  view.querySelectorAll('[data-w]').forEach((node) => { node.style.width = `${node.dataset.w}%`; });
  view.querySelectorAll('[data-h]').forEach((node) => { node.style.height = `${node.dataset.h}%`; });
  const reviewsForm = document.getElementById('review-form');
  if (reviewsForm) bindForm(reviewsForm, async (values) => {
    await api('/api/reviews', { method: 'POST', body: values });
    await load();
    toast('Angka ulasan disimpan');
    render();
  });
  document.getElementById('copy-link').addEventListener('click', async () => {
    await navigator.clipboard.writeText(firstCardUrl());
    toast('Link kartu disalin');
  });
}

async function renderMasukan() {
  view.innerHTML = '<div class="topbar"><h1>Masukan pelanggan</h1></div><main class="wrap app-main stack"><div id="inbox"></div></main>';
  const box = document.getElementById('inbox');
  if (!isPro()) {
    box.innerHTML = `<section class="panel">${upgradeBlock('Terima keluhan sebelum jadi masalah', 'Pelanggan bisa mengirim pesan privat lewat Minipage, sambil tetap bebas menulis ulasan di Google.')}</section>`;
    return;
  }
  // Pesan yang sudah dimuat tampil langsung, lalu diperbarui di belakang.
  const cached = inboxCache;
  if (!cached) box.innerHTML = '<p class="muted">Memuat pesan...</p>';
  else api('/api/inbox').then(({ items: fresh }) => {
    const changed = JSON.stringify(fresh) !== JSON.stringify(inboxCache);
    inboxCache = fresh;
    if (changed && currentTab() === 'masukan') renderMasukan();
  }).catch(() => {});
  const { items } = cached ? { items: cached } : await api('/api/inbox');
  inboxCache = items;
  if (!items.length) {
    box.innerHTML = `<section class="panel"><h2>Belum ada pesan</h2><p class="muted">${me.business.mode === 'page'
      ? 'Pesan pelanggan akan muncul di sini.'
      : 'Aktifkan Minipage di menu Atur supaya pelanggan bisa mengirim pesan.'}</p></section>`;
    return;
  }
  box.className = 'stack';
  box.innerHTML = items.map((item) => `
    <article class="inbox-item ${item.readAt ? '' : 'unread'}">
      <p>${esc(item.message)}</p>
      <div class="inbox-meta">${formatDate(item.createdAt)}${item.label ? ` · ${esc(item.label)}` : ''}${item.contact ? ` · ${esc(item.contact)}` : ''}</div>
      ${item.readAt ? '' : `<div><button class="btn btn-small" data-read="${item.id}">Tandai dibaca</button></div>`}
    </article>`).join('');
  box.onclick = async (event) => {
    const id = event.target.dataset.read;
    if (!id) return;
    await api(`/api/inbox/${id}/read`, { method: 'POST' });
    inboxCache = null;
    renderMasukan();
  };
}

function renderKartu() {
  const canReset = !me.business.linkLocked;
  view.innerHTML = `
    <div class="topbar"><h1>Kartu saya</h1></div>
    <main class="wrap app-main stack">
      ${me.cards.map((card) => `
        <section class="panel stack-sm">
          <div class="panel-head"><h2>${esc(card.label || 'Kartu tanpa nama')}</h2><span class="num">${card.taps} tap</span></div>
          <p class="muted">Kode ${esc(card.code)}</p>
          <form data-label="${card.id}" class="row">
            <label class="field grow"><span class="hp">Nama kartu</span><input name="label" maxlength="40" value="${esc(card.label)}" placeholder="Misal: Kasir, Meja 3"></label>
            <button class="btn btn-small" type="submit">Simpan</button>
          </form>
          ${canReset ? `<details class="drawer">
            <summary>Reset kartu ini</summary>
            <form data-reset="${card.id}" class="stack-sm">
              <p class="muted">Kartu kembali kosong dan riwayat tap-nya dihapus.${me.cards.length === 1 ? ' Ini kartu terakhir, jadi seluruh data bisnis ikut terhapus.' : ''} Tindakan ini tidak bisa dibatalkan.</p>
              <label class="field"><span>PIN untuk konfirmasi</span>
                <input class="pin" name="pin" type="password" inputmode="numeric" maxlength="6" required autocomplete="off"></label>
              <p class="form-msg" role="alert"></p>
              <button class="btn btn-danger" type="submit">Reset kartu</button>
            </form>
          </details>` : ''}
        </section>`).join('')}

      <section class="panel">
        <details class="drawer">
          <summary>Tambah kartu</summary>
          <form id="add-card" class="stack-sm" autocomplete="off">
            <p class="muted">Hubungkan kartu baru ke bisnis ini. Beri nama supaya performanya terlihat per meja atau kasir.</p>
            <label class="field"><span>Kode kartu</span><input class="code" name="code" maxlength="10" required></label>
            <label class="field"><span>Kode aktivasi</span><input class="code" name="activationCode" maxlength="12" required placeholder="XXXX-XXXX"></label>
            <label class="field"><span>Nama kartu</span><input name="label" maxlength="40" placeholder="Misal: Meja 3"></label>
            <p class="form-msg" role="alert"></p>
            <button class="btn btn-light" type="submit">Hubungkan</button>
          </form>
        </details>
      </section>
    </main>`;

  view.querySelectorAll('[data-label]').forEach((form) => bindForm(form, async (values) => {
    await api(`/api/cards/${form.dataset.label}`, { method: 'PATCH', body: values });
    await load();
    toast('Nama kartu disimpan');
    render();
  }));
  view.querySelectorAll('[data-reset]').forEach((form) => bindForm(form, async (values) => {
    const result = await api(`/api/cards/${form.dataset.reset}/reset`, { method: 'POST', body: values });
    if (result.loggedOut) { location.href = '/'; return; }
    await load();
    toast('Kartu direset');
    render();
  }));
  bindForm(document.getElementById('add-card'), async (values) => {
    await api('/api/cards', { method: 'POST', body: values });
    await load();
    toast('Kartu terhubung');
    render();
  });
}

function renderAtur() {
  const { business } = me;
  const pro = isPro();
  const sellerLink = me.sellerWa
    ? `<a class="btn btn-small" href="${esc(waUrl(me.sellerWa, `Halo, saya mau mengganti tujuan kartu ulasan ${business.name}.`))}" target="_blank" rel="noopener">Hubungi penjual</a>`
    : '';
  view.innerHTML = `
    <div class="topbar"><h1>Pengaturan</h1><button class="btn btn-small" id="logout">Keluar</button></div>
    <main class="wrap app-main stack">

      <form id="info" class="panel stack-sm">
        <h2>Info bisnis</h2>
        <label class="field"><span>Nama bisnis</span><input name="name" maxlength="80" required value="${esc(business.name)}"></label>
        ${business.linkLocked ? `
        <div class="stack-sm">
          <p class="note warn">${icon('lock')}<span>Tujuan QR dan NFC diatur penjual. Hubungi penjual untuk menggantinya.</span></p>
          ${sellerLink}
        </div>` : `
        <label class="field"><span>Tujuan kartu</span><input name="link" required value="${esc(business.reviewUrl)}">
          <small>Mengganti link langsung mengubah semua kartu. Tidak perlu cetak ulang.</small></label>`}
        ${business.linkLocked || business.linkKind === 'review' ? '' : `<p class="note warn">${icon('open')}<span>Tujuan saat ini halaman Maps. Pakai link "Minta ulasan" dari Profil Bisnis agar pelanggan langsung masuk ke form.</span></p>`}
        <p class="form-msg" role="status"></p>
        <button class="btn btn-light" type="submit">Simpan perubahan</button>
      </form>

      <section class="panel stack-sm">
        <h2>Minipage</h2>
        ${pro ? `
        <label class="toggle"><span>Tampilkan halaman singkat sebelum Google<br><span class="muted">Mati: kartu langsung ke Google.</span></span>
          <input type="checkbox" id="mode" ${business.mode === 'page' ? 'checked' : ''} aria-label="Aktifkan Minipage"></label>
        <form id="mini" class="stack-sm">
          <label class="field"><span>Sapaan</span><input name="tagline" maxlength="120" value="${esc(business.tagline)}" placeholder="Terima kasih sudah berkunjung."></label>
          <label class="field"><span>Nomor WhatsApp</span><input name="whatsapp" inputmode="tel" maxlength="20" value="${esc(business.whatsapp)}" placeholder="628xxxxxxxxxx"></label>
          <label class="field"><span>Instagram</span><input name="instagram" maxlength="60" value="${esc(business.instagram)}" placeholder="@namabisnis"></label>
          <label class="field"><span>Link menu atau katalog</span><input name="menuUrl" inputmode="url" maxlength="500" value="${esc(business.menuUrl)}" placeholder="https://"></label>
          <p class="form-msg" role="status"></p>
          <button class="btn" type="submit">Simpan Minipage</button>
        </form>
        <a class="text-btn" href="/u/${esc(me.cards[0]?.code)}" target="_blank" rel="noopener">Lihat Minipage</a>
        <p class="muted">Semua pelanggan melihat tombol Google yang sama. Aplikasi ini sengaja tidak menyaring berdasarkan rating karena itu melanggar kebijakan Google.</p>`
        : upgradeBlock('Satu halaman untuk ulasan, WhatsApp, dan menu', 'Tersedia di paket Pro.')}
      </section>

      <section class="panel stack-sm">
        <div class="panel-head"><h2>Paket</h2><span class="plan-chip ${pro ? 'pro' : ''}">${business.isTrial ? 'Trial Pro' : pro ? 'Pro' : 'Basic'}</span></div>
        ${pro && business.proUntil ? `<p class="muted">${business.isTrial ? 'Trial berakhir' : 'Aktif sampai'} ${formatDate(business.proUntil)}.</p>` : ''}
        ${pro && me.adminWa ? `<a class="btn btn-small" href="${esc(waUrl(me.adminWa, `Halo, saya mau perpanjang Pro untuk ${business.name}.`))}" target="_blank" rel="noopener">Perpanjang via WhatsApp</a>` : ''}
        ${pro ? '' : '<p class="muted">Basic tidak ada biaya bulanan.</p>'}
      </section>

      <form id="pin-form" class="panel drawer-form">
        <details class="drawer">
          <summary>Ganti PIN</summary>
          <div class="stack-sm">
            <label class="field"><span>PIN lama</span><input class="pin" name="currentPin" type="password" inputmode="numeric" maxlength="6" required autocomplete="current-password"></label>
            <label class="field"><span>PIN baru</span><input class="pin" name="newPin" inputmode="numeric" pattern="\\d{6}" maxlength="6" required autocomplete="new-password"></label>
            <p class="form-msg" role="alert"></p>
            <button class="btn btn-light" type="submit">Simpan PIN</button>
          </div>
        </details>
      </form>
    </main>`;

  const saved = (message, text = 'Tersimpan.') => { message.textContent = text; message.classList.add('ok'); };

  bindForm(document.getElementById('info'), async (values) => {
    const data = await api('/api/me', { method: 'PUT', body: values });
    me.business = data.business;
    renderAtur();
    toast('Perubahan disimpan');
  });
  document.getElementById('mini') && bindForm(document.getElementById('mini'), async (values, message) => {
    const data = await api('/api/me', { method: 'PUT', body: values });
    me.business = data.business;
    saved(message);
  });
  document.getElementById('mode')?.addEventListener('change', async (event) => {
    try {
      const data = await api('/api/me', { method: 'PUT', body: { mode: event.target.checked ? 'page' : 'direct' } });
      me.business = data.business;
      toast(event.target.checked ? 'Minipage aktif' : 'Kartu langsung ke Google');
    } catch (error) {
      event.target.checked = !event.target.checked;
      toast(error.message);
    }
  });
  bindForm(document.getElementById('pin-form'), async (values, message) => {
    await api('/api/pin', { method: 'POST', body: values });
    document.getElementById('pin-form').reset();
    saved(message, 'PIN diganti.');
  });
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.href = '/kelola';
  });
}

async function load() {
  [me, stats] = await Promise.all([api('/api/me'), api('/api/stats')]);
  document.getElementById('demo').hidden = !me.business.isDemo;
}

function currentTab() {
  const hash = location.hash.slice(1);
  return TABS.includes(hash) ? hash : 'beranda';
}

async function render() {
  const tab = currentTab();
  document.body.dataset.tone = TONES[tab];
  dock.querySelectorAll('button').forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  moveDock(dock);
  try {
    if (tab === 'beranda') renderBeranda();
    if (tab === 'masukan') await renderMasukan();
    if (tab === 'kartu') renderKartu();
    if (tab === 'atur') renderAtur();
  } catch (error) {
    fail(error);
  }
}

function fail(error) {
  if (error.status === 401) { location.href = '/kelola'; return; }
  view.innerHTML = `<main class="wrap app-main"><section class="panel"><h2>Data gagal dimuat</h2><p class="muted">${esc(error.message)}</p><a class="btn btn-light" href="/app">Muat ulang</a></section></main>`;
}

dock.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) location.hash = button.dataset.tab;
});
// Isian yang sedang diketik tidak boleh hilang karena data diperbarui di belakang.
const editing = () => view.contains(document.activeElement) && document.activeElement.matches('input, textarea, select')
  || [...view.querySelectorAll('input, textarea')].some((field) => field.type !== 'checkbox' && field.value !== field.defaultValue);

// Pindah menu memakai data yang sudah ada. Angka diperbarui di belakang bila sudah lebih dari 30 detik.
addEventListener('hashchange', () => {
  scrollTo({ top: 0 });
  render();
  if (Date.now() - loadedAt < 30_000) return;
  const tab = currentTab();
  load().then(() => {
    loadedAt = Date.now();
    if (currentTab() === tab && tab !== 'masukan' && !editing()) render();
  }).catch(() => {});
});

try {
  await load();
  loadedAt = Date.now();
  render();
} catch (error) {
  fail(error);
}

