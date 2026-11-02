import { api, bindForm, esc, formatDate, toast } from '/js/common.js';
import { activationTicket, buyerFormFields, destinationNote, pinTicket, showResult } from '/js/sales.js';

const root = document.getElementById('reseller');
const dock = document.querySelector('.dock');
const TABS = ['aktivasi', 'stok', 'riwayat', 'akun'];
const TITLES = { aktivasi: 'Aktivasi pembeli', stok: 'Stok kartu', riwayat: 'Riwayat penjualan', akun: 'Akun' };
const VIA = { reseller: 'Diaktifkan Anda', self: 'Diaktifkan pembeli', admin: 'Diaktifkan admin' };
let data;
let result = '';
let prefillCode = '';

const currentTab = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'aktivasi');

function aktivasiView() {
  return `
    <dl class="admin-stock">
      <div><dt>Stok</dt><dd>${data.stock.length}</dd></div>
      <div><dt>Terjual</dt><dd>${data.sold.length}</dd></div>
    </dl>
    ${result}
    <section class="panel">
      <h2>Aktifkan untuk pembeli</h2>
      ${data.stock.length
        ? `<form id="activate" class="stack-sm" autocomplete="off">${buyerFormFields}</form>`
        : '<p class="muted">Stok kartu kosong. Minta admin menyerahkan kartu ke akun Anda.</p>'}
    </section>`;
}

function stokView() {
  return `<section class="panel">
    <h2>Kartu siap dijual</h2>
    ${data.stock.length ? `<div>${data.stock.map((card) => `
      <article class="admin-row">
        <div class="admin-row-head">
          <span class="mono">${esc(card.code)}<small>Aktivasi ${esc(card.activationCode)}</small></span>
          <button class="btn btn-small btn-light" data-use="${esc(card.code)}">Aktifkan</button>
        </div>
      </article>`).join('')}</div>` : '<p class="muted">Belum ada kartu di stok Anda.</p>'}
  </section>`;
}

function soldRows(filter = '') {
  const query = filter.toLowerCase();
  const rows = data.sold.filter((row) => `${row.businessName} ${row.code}`.toLowerCase().includes(query));
  if (!rows.length) return `<p class="muted">${data.sold.length ? 'Tidak ada yang cocok.' : 'Belum ada kartu terjual.'}</p>`;
  return rows.map((row) => `
    <article class="admin-row">
      <div>
        ${esc(row.businessName)}
        <small>${row.activatedAt ? formatDate(row.activatedAt) : '-'} · ${esc(VIA[row.via] ?? 'Aktif')}</small>
        <small class="mono">${esc(row.code)} · Aktivasi ${esc(row.activationCode)}</small>
      </div>
      ${row.via === 'reseller' ? `
      <details class="drawer">
        <summary>Ganti nama atau link</summary>
        <form class="stack-sm" data-edit="${row.businessId}">
          <label class="field"><span>Nama bisnis</span><input name="name" maxlength="80" required value="${esc(row.businessName)}"></label>
          <label class="field"><span>Link Google Maps</span><input name="link" inputmode="url" required value="${esc(row.reviewUrl)}"></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-small btn-light" type="submit">Simpan</button>
        </form>
      </details>
      <div class="admin-actions"><button class="btn btn-small" data-new-pin="${row.businessId}">PIN baru pembeli</button></div>` : ''}
    </article>`).join('');
}

function riwayatView() {
  return `
    ${result}
    <section class="panel">
      <h2>Kartu terjual</h2>
      <input class="search" id="search" type="search" aria-label="Cari bisnis atau kode kartu" placeholder="Cari nama atau kode">
      <div id="rows">${soldRows()}</div>
    </section>`;
}

function akunView() {
  const { name, whatsapp, city } = data.reseller;
  return `
    <section class="panel">
      <h2>${esc(name)}</h2>
      <p class="muted">${esc(whatsapp.replace(/^62/, '0'))}${city ? ` · ${esc(city)}` : ''}</p>
    </section>
    <form id="pin-form" class="panel">
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
    <button class="btn" id="logout">Keluar</button>`;
}

function bindAktivasi() {
  const form = document.getElementById('activate');
  if (!form) return;
  form.code.value = prefillCode;
  prefillCode = '';
  bindForm(form, async (values) => {
    const activated = await api('/api/reseller/activate', { method: 'POST', body: values });
    result = activationTicket(activated);
    await refresh();
    showResult();
  });
}

function bindRiwayat() {
  document.getElementById('search').addEventListener('input', (event) => {
    document.getElementById('rows').innerHTML = soldRows(event.target.value);
  });
  const rows = document.getElementById('rows');
  rows.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const message = form.querySelector('.form-msg');
    message.textContent = '';
    try {
      const saved = await api(`/api/reseller/businesses/${form.dataset.edit}`, {
        method: 'PUT',
        body: Object.fromEntries(new FormData(form)),
      });
      await refresh();
      toast(destinationNote(saved.kind));
    } catch (error) {
      message.textContent = error.message;
    }
  });
  rows.addEventListener('click', async (event) => {
    const { newPin } = event.target.dataset;
    if (!newPin || !confirm('Buat PIN baru? PIN lama pembeli langsung tidak berlaku.')) return;
    try {
      const made = await api(`/api/reseller/businesses/${newPin}/pin`, { method: 'POST' });
      result = pinTicket({ title: 'PIN pembeli baru', name: made.name, pin: made.pin });
      await refresh();
      showResult();
    } catch (error) {
      toast(error.message);
    }
  });
}

function bindAkun() {
  const form = document.getElementById('pin-form');
  bindForm(form, async (values, message) => {
    await api('/api/reseller/pin', { method: 'POST', body: values });
    form.reset();
    message.textContent = 'PIN diganti.';
    message.classList.add('ok');
  });
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/reseller/logout', { method: 'POST' });
    location.href = '/reseller';
  });
}

function render() {
  const tab = currentTab();
  dock.hidden = false;
  dock.querySelectorAll('button').forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const views = { aktivasi: aktivasiView, stok: stokView, riwayat: riwayatView, akun: akunView };
  root.innerHTML = `<div class="topbar page-top"><h1>${TITLES[tab]}</h1></div>${views[tab]()}`;
  ({ aktivasi: bindAktivasi, riwayat: bindRiwayat, akun: bindAkun })[tab]?.();
}

async function refresh() {
  data = await api('/api/reseller/me');
  render();
}

root.addEventListener('click', (event) => {
  const { use } = event.target.dataset;
  if (!use) return;
  prefillCode = use;
  location.hash = 'aktivasi';
});
dock.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) location.hash = button.dataset.tab;
});
addEventListener('hashchange', () => {
  result = '';
  scrollTo({ top: 0 });
  if (data) refresh().catch(() => location.reload());
});

bindForm(document.getElementById('reseller-login'), async (values) => {
  await api('/api/reseller/login', { method: 'POST', body: values });
  await refresh();
});

refresh().catch(() => {});
