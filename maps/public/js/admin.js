import { api, bindForm, esc, formatDate, icon, toast } from '/js/common.js';
import { activationTicket, attachPlaceSearch, buyerFormFields, destinationNote, pinTicket, showResult } from '/js/sales.js';

const root = document.getElementById('admin');
const dock = document.querySelector('.dock');
const TABS = ['jual', 'kartu', 'reseller', 'bisnis'];
const TONES = { jual: 'yellow', kartu: 'purple', reseller: 'blue', bisnis: 'coral' };
const TITLES = { jual: 'Aktivasi pembeli', kartu: 'Stok kartu', reseller: 'Reseller', bisnis: 'Bisnis' };
let overview;
let loadedAt = 0;
let searchQuery = '';
let result = '';

const currentTab = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'jual');
const displayWa = (number) => number.replace(/^62/, '0');

const proLabel = (b) => {
  if (b.plan !== 'pro') return 'Basic';
  if (b.proUntil && b.proUntil < Date.now()) return `Pro habis ${formatDate(b.proUntil)}`;
  if (b.isTrial) return `Trial s.d. ${formatDate(b.proUntil)}`;
  return b.proUntil ? `Pro s.d. ${formatDate(b.proUntil)}` : 'Pro';
};

const isActivePro = (b) => b.plan === 'pro' && (!b.proUntil || b.proUntil > Date.now());
const tier = (b) => (isActivePro(b)
  ? `<span class="tier tier-pro">${icon('verified')}Pro</span>`
  : `<span class="tier tier-basic">${icon('verified')}Basic</span>`);
const resellerName = (id) => overview.resellers.find((r) => r.id === id)?.name ?? 'reseller';

// Sisa kartu kosong per pemegang, supaya terlihat berapa yang bisa ditarik dari tiap reseller.
function batchLabel(b) {
  const rows = overview.batchStock.filter((row) => row.batchId === b.id);
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  const holders = rows.map((row) => `${row.resellerId ? resellerName(row.resellerId) : 'pusat'} ${row.n}`).join(', ');
  return `Batch #${b.id}${b.note ? ` · ${b.note}` : ''} (${total ? `sisa ${total}: ${holders}` : 'habis'})`;
}

function businessRows(filter = '') {
  const query = filter.toLowerCase();
  const rows = overview.businessList.filter((b) =>
    `${b.name} ${b.codes ?? ''} ${b.seller ?? ''}`.toLowerCase().includes(query));
  if (!rows.length) {
    return `<p class="muted">${overview.businessList.length ? 'Tidak ada yang cocok.' : 'Belum ada bisnis. Kartu yang aktif muncul di sini.'}</p>`;
  }
  return rows.map((b) => `
    <article class="admin-row">
      <div>
        ${esc(b.name)}${tier(b)}${b.isDemo ? ' <span class="muted">(demo)</span>' : ''}
        <small>${esc(proLabel(b))} · ${b.cards} kartu · ${b.taps30} tap 30 hari${b.linkLocked ? ' · link terkunci' : ''}</small>
        <small>${b.seller ? `Reseller: ${esc(b.seller)}` : 'Penjualan pusat'}</small>
        <small class="mono">${esc(b.codes ?? '')}</small>
      </div>
      <details class="drawer">
        <summary>Ganti nama atau link</summary>
        <form class="stack-sm" data-edit="${b.id}">
          <label class="field"><span>Nama bisnis</span><input name="name" maxlength="80" required value="${esc(b.name)}"></label>
          <label class="field"><span>Link Google Maps</span><input name="link" inputmode="url" required value="${esc(b.reviewUrl)}"></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-small btn-light" type="submit">Simpan</button>
        </form>
      </details>
      <div class="admin-actions">
        <button class="btn btn-small" data-plan="pro" data-months="1" data-id="${b.id}">+1 bln</button>
        <button class="btn btn-small" data-plan="pro" data-months="12" data-id="${b.id}">+12 bln</button>
        ${b.plan === 'pro' ? `<button class="btn btn-small btn-danger" data-plan="basic" data-id="${b.id}">Ke Basic</button>` : ''}
        <button class="btn btn-small" data-new-pin="${b.id}" data-name="${esc(b.name)}">PIN baru</button>
      </div>
    </article>`).join('');
}

function jualView() {
  return `
    <dl class="admin-stock">
      <div><dt>Kartu kosong</dt><dd>${overview.ready}</dd></div>
      <div><dt>Kartu aktif</dt><dd>${overview.active}</dd></div>
      <div><dt>Tap 30 hari</dt><dd>${overview.taps30}</dd></div>
      <div><dt>Bisnis</dt><dd>${overview.businesses}</dd></div>
      <div><dt>Pro</dt><dd>${overview.pro}</dd></div>
      <div><dt>Trial</dt><dd>${overview.trials}</dd></div>
    </dl>
    ${result}
    <section class="panel">
      <h2>Aktifkan untuk pembeli</h2>
      <form id="activate" class="stack-sm" autocomplete="off">${buyerFormFields}</form>
    </section>`;
}

const fmt = (n) => n.toLocaleString('id-ID');
const GOOGLE_FREE = { details: 1000, search: 5000 };
const CLOUDFLARE_FREE = 100_000;
const share = (used, free) => Math.min(100, Math.round((used / free) * 100));

function usageWarnings() {
  const { google, tapsToday } = overview;
  const notes = [];
  for (const [kind, label] of [['details', 'rating dan ulasan'], ['search', 'cari nama bisnis']]) {
    const pct = share(google[kind], GOOGLE_FREE[kind]);
    if (pct >= 80) notes.push(`Jatah gratis Google untuk ${label} sudah terpakai ${pct}% bulan ini.`);
  }
  if (share(tapsToday, CLOUDFLARE_FREE) >= 80) notes.push(`Tap hari ini sudah ${share(tapsToday, CLOUDFLARE_FREE)}% dari batas harian Cloudflare.`);
  return notes.map((text) => `<p class="note warn">${icon('lock')}<span>${esc(text)}</span></p>`).join('');
}

function usageRow(label, used, free) {
  const pct = share(used, free);
  return `<div class="usage-row${pct >= 80 ? ' hot' : ''}"><span>${label}</span><b>${fmt(used)} / ${fmt(free)}</b>
    <span class="usage-bar" role="img" aria-label="${label}: ${pct} persen terpakai"><i data-w="${pct}"></i></span></div>`;
}

function usagePanel() {
  const { google, tapsToday } = overview;
  return `<section class="panel">
    <h2>Pemakaian bulan ini</h2>
    ${google.enabled ? '' : '<p class="note warn">API key Google belum dipasang. Rating dan jumlah ulasan masih diisi manual.</p>'}
    ${usageRow('Rating dan ulasan Google', google.details, GOOGLE_FREE.details)}
    ${usageRow('Cari nama bisnis', google.search, GOOGLE_FREE.search)}
    <p class="muted">Jatah gratis Google per bulan. Lewat dari itu, Google menagih kartu billing. Email peringatan diatur di Budgets & alerts Google Cloud.</p>
    ${usageRow('Tap kartu hari ini', tapsToday, CLOUDFLARE_FREE)}
    <p class="muted">Batas gratis Cloudflare 100.000 permintaan per hari. Paket gratis tidak menagih, situs hanya berhenti sampai hari berganti.</p>
  </section>`;
}

function kartuView() {
  return `
    ${usagePanel()}
    <section class="panel">
      <h2>Tujuan kartu belum terjual</h2>
      <p class="muted">${overview.defaultUrl ? 'Kartu kosong membuka link ini, cocok untuk demo.' : 'Belum diatur, jadi kartu kosong membuka halaman aktivasi.'}</p>
      <form id="default-link" class="stack-sm">
        <label class="field"><span>Link Google Maps</span><input name="link" inputmode="url" value="${esc(overview.defaultUrl ?? '')}" placeholder="https://maps.app.goo.gl/..."></label>
        <p class="form-msg" role="alert"></p>
        <button class="btn btn-light" type="submit">Simpan tujuan</button>
      </form>
    </section>

    <section class="panel">
      <h2>Buat batch kartu</h2>
      <form id="batch" class="stack-sm">
        <div class="split-fields">
          <label class="field"><span>Catatan</span><input name="note" maxlength="80" placeholder="Misal: Cetak Juni"></label>
          <label class="field"><span>Jumlah</span><input name="qty" type="number" inputmode="numeric" min="1" max="1000" value="50" required></label>
        </div>
        <p class="form-msg" role="alert"></p>
        <button class="btn btn-light" type="submit">Buat batch</button>
      </form>
      ${overview.batches.map((b) => `
        <article class="admin-row">
          <div>Batch #${b.id}${b.note ? ` · ${esc(b.note)}` : ''}
            <small>${formatDate(b.createdAt)} · ${b.activated} dari ${b.qty} aktif</small></div>
          <div class="admin-actions">
            <a class="btn btn-small" href="/admin/cetak/${b.id}" target="_blank">QR dan kode</a>
            <a class="btn btn-small" href="/admin/batch/${b.id}.csv">CSV vendor</a>
          </div>
        </article>`).join('') || '<p class="muted">Belum ada batch.</p>'}
    </section>

    <section class="panel">
      <details class="drawer">
        <summary>Kosongkan kartu salah aktivasi</summary>
        <form id="clear-card" class="stack-sm" autocomplete="off">
          <p class="muted">Kartu kembali kosong dan siap dijual. Kartu terakhir sebuah bisnis ikut menghapus data bisnisnya. Tindakan ini tidak bisa dibatalkan.</p>
          <label class="field"><span>Kode kartu</span><input class="code" name="code" maxlength="10" required></label>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-danger" type="submit">Kosongkan kartu</button>
        </form>
      </details>
    </section>`;
}

function resellerRows() {
  if (!overview.resellers.length) return '<p class="muted">Belum ada reseller.</p>';
  return overview.resellers.map((r) => `
    <article class="admin-row">
      <div class="admin-row-head">
        <span>${esc(r.name)}<small>${esc(displayWa(r.whatsapp))}${r.city ? ` · ${esc(r.city)}` : ''}</small><small>Stok ${r.stock} · Terjual ${r.sold}</small></span>
        ${r.active ? '' : '<span class="plan-chip off">Nonaktif</span>'}
      </div>
      <details class="drawer">
        <summary>Ubah data</summary>
        <form class="stack-sm" data-reseller="${r.id}">
          <label class="field"><span>Nama</span><input name="name" maxlength="80" required value="${esc(r.name)}"></label>
          <div class="split-fields">
            <label class="field"><span>WhatsApp</span><input name="whatsapp" inputmode="tel" maxlength="20" required value="${esc(displayWa(r.whatsapp))}"></label>
            <label class="field"><span>Kota</span><input name="city" maxlength="60" value="${esc(r.city)}"></label>
          </div>
          <p class="form-msg" role="alert"></p>
          <button class="btn btn-small btn-light" type="submit">Simpan</button>
        </form>
      </details>
      <div class="admin-actions">
        <button class="btn btn-small" data-reseller-pin="${r.id}">PIN baru</button>
        ${r.active
          ? `<button class="btn btn-small btn-danger" data-active="0" data-id="${r.id}">Nonaktifkan</button>`
          : `<button class="btn btn-small" data-active="1" data-id="${r.id}">Aktifkan</button>`}
      </div>
    </article>`).join('');
}

function resellerView() {
  const options = overview.resellers.filter((r) => r.active)
    .map((r) => `<option value="${r.id}">${esc(r.name)} (stok ${r.stock})</option>`).join('');
  return `
    ${result}
    <section class="panel">
      <h2>Daftarkan reseller</h2>
      <form id="reseller-new" class="stack-sm" autocomplete="off">
        <label class="field"><span>Nama</span><input name="name" maxlength="80" required></label>
        <div class="split-fields">
          <label class="field"><span>WhatsApp</span><input name="whatsapp" inputmode="tel" maxlength="20" required placeholder="08xxxxxxxxxx"></label>
          <label class="field"><span>Kota</span><input name="city" maxlength="60" placeholder="Opsional"></label>
        </div>
        <p class="form-msg" role="alert"></p>
        <button class="cta" type="submit">Daftarkan</button>
      </form>
    </section>

    <section class="panel">
      <h2>Serahkan kartu</h2>
      <form id="assign" class="stack-sm" autocomplete="off">
        <label class="field"><span>Serahkan ke</span>
          <select name="resellerId" required>${options}<option value="0">Stok pusat (tarik dari reseller)</option></select></label>
        <label class="field"><span>Satu batch penuh</span>
          <select name="batchId"><option value="">Tidak, pakai daftar kode</option>${overview.batches.map((b) => `<option value="${b.id}">${esc(batchLabel(b))}</option>`).join('')}</select></label>
        <label class="field"><span>Kode kartu</span>
          <textarea name="codes" rows="3" placeholder="Pisahkan dengan spasi atau baris baru"></textarea>
          <small>Kartu yang sudah aktif dilewati.</small></label>
        <p class="form-msg" role="alert"></p>
        <button class="btn btn-light" type="submit">Serahkan kartu</button>
      </form>
    </section>

    <section class="panel"><h2>Daftar reseller</h2><div id="resellers">${resellerRows()}</div></section>`;
}

function bisnisView() {
  return `
    ${result}
    <section class="panel">
      <h2>Bisnis</h2>
      <input class="search" id="search" type="search" aria-label="Cari bisnis, kode kartu, atau reseller" placeholder="Cari nama, kode, atau reseller" value="${esc(searchQuery)}">
      <div id="rows">${businessRows(searchQuery)}</div>
    </section>`;
}

const reload = async (message) => {
  await refresh();
  if (message) toast(message);
};

function bindJual() {
  attachPlaceSearch(document.getElementById('activate'));
  bindForm(document.getElementById('activate'), async (values) => {
    const activated = await api('/api/admin/activate', { method: 'POST', body: values });
    result = activationTicket(activated);
    await refresh();
    showResult();
  });
}

function bindKartu() {
  bindForm(document.getElementById('default-link'), async (values) => {
    await api('/api/admin/default-link', { method: 'PUT', body: values });
    await reload('Tujuan disimpan');
  });
  bindForm(document.getElementById('batch'), async (values) => {
    await api('/api/admin/batches', { method: 'POST', body: { qty: Number(values.qty), note: values.note } });
    await reload('Batch dibuat');
  });
  bindForm(document.getElementById('clear-card'), async (values) => {
    if (!confirm(`Kosongkan kartu ${values.code.toUpperCase()}? Riwayat tap kartu ini ikut terhapus.`)) return;
    await api('/api/admin/cards/reset', { method: 'POST', body: values });
    await reload('Kartu dikosongkan');
  });
}

function bindReseller() {
  bindForm(document.getElementById('reseller-new'), async (values) => {
    const created = await api('/api/admin/resellers', { method: 'POST', body: values });
    result = pinTicket({ title: 'Reseller terdaftar', name: `${created.name}, masuk di /reseller`, pin: created.pin });
    await refresh();
    showResult();
  });
  bindForm(document.getElementById('assign'), async (values) => {
    const { moved, skipped } = await api('/api/admin/resellers/cards', {
      method: 'POST',
      body: { resellerId: Number(values.resellerId), batchId: Number(values.batchId) || null, codes: values.codes },
    });
    await reload(`${moved} kartu dipindahkan${skipped ? `, ${skipped} dilewati` : ''}`);
  });
  const list = document.getElementById('resellers');
  list.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const message = form.querySelector('.form-msg');
    message.textContent = '';
    try {
      await api(`/api/admin/resellers/${form.dataset.reseller}`, { method: 'PUT', body: Object.fromEntries(new FormData(form)) });
      await reload('Data reseller disimpan');
    } catch (error) {
      message.textContent = error.message;
    }
  });
  list.addEventListener('click', async (event) => {
    const { resellerPin, active, id } = event.target.dataset;
    try {
      if (resellerPin && confirm('Buat PIN baru? PIN lama langsung tidak berlaku.')) {
        const made = await api(`/api/admin/resellers/${resellerPin}/pin`, { method: 'POST' });
        result = pinTicket({ title: 'PIN reseller baru', name: made.name, pin: made.pin });
        await refresh();
        showResult();
      }
      if (active !== undefined) {
        if (active === '0' && !confirm('Nonaktifkan reseller ini? Dia langsung keluar dan tidak bisa masuk.')) return;
        await api(`/api/admin/resellers/${id}/status`, { method: 'POST', body: { active: active === '1' } });
        await reload(active === '1' ? 'Reseller aktif' : 'Reseller nonaktif');
      }
    } catch (error) {
      toast(error.message);
    }
  });
}

function bindBisnis() {
  document.getElementById('search').addEventListener('input', (event) => {
    searchQuery = event.target.value;
    document.getElementById('rows').innerHTML = businessRows(searchQuery);
  });
  const rows = document.getElementById('rows');
  rows.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const message = form.querySelector('.form-msg');
    message.textContent = '';
    try {
      const saved = await api(`/api/admin/businesses/${form.dataset.edit}`, {
        method: 'PUT',
        body: Object.fromEntries(new FormData(form)),
      });
      await reload(destinationNote(saved.kind));
    } catch (error) {
      message.textContent = error.message;
    }
  });
  rows.addEventListener('click', async (event) => {
    const { plan, months, id, newPin } = event.target.dataset;
    try {
      if (plan) {
        await api(`/api/admin/businesses/${id}/plan`, { method: 'POST', body: { plan, months: Number(months) } });
        await reload('Paket diubah');
      }
      if (newPin && confirm('Buat PIN baru? PIN lama pembeli langsung tidak berlaku.')) {
        const made = await api(`/api/admin/businesses/${newPin}/pin`, { method: 'POST' });
        result = pinTicket({ title: 'PIN pembeli baru', name: made.name, pin: made.pin });
        await refresh();
        showResult();
      }
    } catch (error) {
      toast(error.message);
    }
  });
}

function render() {
  const tab = currentTab();
  document.body.dataset.tone = TONES[tab];
  dock.hidden = false;
  dock.querySelectorAll('button').forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const views = { jual: jualView, kartu: kartuView, reseller: resellerView, bisnis: bisnisView };
  root.innerHTML = `
    <div class="topbar page-top"><h1>${TITLES[tab]}</h1><button class="btn btn-small" id="logout">Keluar</button></div>
    ${usageWarnings()}${views[tab]()}`;
  root.querySelectorAll('[data-w]').forEach((bar) => { bar.style.width = `${bar.dataset.w}%`; });
  ({ jual: bindJual, kartu: bindKartu, reseller: bindReseller, bisnis: bindBisnis })[tab]();
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });
}

async function refresh() {
  overview = await api('/api/admin/overview');
  loadedAt = Date.now();
  render();
}

// Isian yang sedang diketik tidak boleh hilang karena data diperbarui di belakang.
const editing = () => root.contains(document.activeElement) && document.activeElement.matches('input:not([type=search]), textarea, select')
  || [...root.querySelectorAll('input, textarea, select')].some((field) => {
    if (field.type === 'search') return false;
    if (field.tagName === 'SELECT') return [...field.options].some((option) => option.selected !== option.defaultSelected);
    return field.value !== field.defaultValue;
  });

dock.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) location.hash = button.dataset.tab;
});
// Pindah menu langsung memakai data yang sudah ada, lalu data terbaru diambil di belakang.
addEventListener('hashchange', () => {
  result = '';
  scrollTo({ top: 0 });
  if (!overview) return;
  render();
  if (Date.now() - loadedAt < 2000) return;
  const tabAtRequest = currentTab();
  api('/api/admin/overview').then((fresh) => {
    overview = fresh;
    loadedAt = Date.now();
    if (currentTab() === tabAtRequest && !editing()) render();
  }).catch(() => {});
});

bindForm(document.getElementById('admin-login'), async (values) => {
  await api('/api/admin/login', { method: 'POST', body: values });
  await refresh();
});

refresh().catch(() => {});
