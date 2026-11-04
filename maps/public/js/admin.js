import { api, bindForm, codeChip, confirmBox, copyCode, esc, formatDate, icon, moveDock, seal, toast } from '/js/common.js';
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
// Reseller yang dituju dari tab Bisnis, disorot setelah tab Reseller tampil.
let focusReseller = null;

const currentTab = () => (TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'jual');
const displayWa = (number) => number.replace(/^62/, '0');

const TIER_NAME = { pro: 'Pro', basic: 'Basic', trial: 'Trial' };
const tierOf = (b) => {
  if (b.plan !== 'pro' || (b.proUntil && b.proUntil < Date.now())) return 'basic';
  return b.isTrial ? 'trial' : 'pro';
};
const planDetail = (b) => {
  if (b.plan !== 'pro') return 'Paket Basic';
  if (b.proUntil && b.proUntil < Date.now()) return `Pro berakhir ${formatDate(b.proUntil)}`;
  if (b.isTrial) return `Trial Pro sampai ${formatDate(b.proUntil)}`;
  return b.proUntil ? `Pro sampai ${formatDate(b.proUntil)}` : 'Pro tanpa batas waktu';
};
const sealTile = (tier) => `<span class="seal-tile seal-${tier}">${seal(tier)}<span>${TIER_NAME[tier]}</span></span>`;
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
    return `<p class="muted list-empty">${overview.businessList.length ? 'Tidak ada yang cocok.' : 'Belum ada bisnis. Kartu yang aktif muncul di sini.'}</p>`;
  }
  return rows.map((b) => {
    const codes = (b.codes ?? '').split(' ').filter(Boolean);
    return `
    <article class="lcard">
      <div class="lcard-head">
        <div class="lcard-title"><h3>${esc(b.name)}</h3>${b.isDemo ? '<small>Akun demo</small>' : ''}</div>
        ${sealTile(tierOf(b))}
      </div>
      <div class="lcard-body">
        <p>${esc(planDetail(b))}</p>
        <p>${b.cards} kartu · ${b.taps30} tap 30 hari${b.linkLocked ? ' · link terkunci' : ''}</p>
        <p class="seller-line">${b.sellerId
          ? `${icon('user')}<button type="button" class="seller-link" data-goto-reseller="${b.sellerId}">Reseller: ${esc(b.seller)}</button>`
          : `${icon('store')}<span>Penjualan pusat</span>`}</p>
        ${codes.length ? `<div class="code-chips">${codes.map((code) => codeChip(code)).join('')}</div>` : ''}
      </div>
      <details class="lcard-more">
        <summary>Kelola bisnis${icon('back')}</summary>
        <div class="lcard-drawer stack-sm">
          <form class="stack-sm" data-edit="${b.id}">
            <label class="field"><span>Nama bisnis</span><input name="name" maxlength="80" required value="${esc(b.name)}"></label>
            <label class="field"><span>Link Google Maps</span><input name="link" inputmode="url" required value="${esc(b.reviewUrl)}"></label>
            <p class="form-msg" role="alert"></p>
            <button class="btn btn-small btn-light" type="submit">Simpan nama dan link</button>
          </form>
          <div class="admin-actions">
            <button class="btn btn-small" data-plan="pro" data-months="1" data-id="${b.id}">Pro +1 bulan</button>
            <button class="btn btn-small" data-plan="pro" data-months="12" data-id="${b.id}">Pro +12 bulan</button>
            ${b.plan === 'pro' ? `<button class="btn btn-small btn-danger" data-plan="basic" data-id="${b.id}">Ubah ke Basic</button>` : ''}
            <button class="btn btn-small" data-new-pin="${b.id}" data-name="${esc(b.name)}">PIN baru</button>
          </div>
        </div>
      </details>
    </article>`;
  }).join('');
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
    </section>

    <h2 class="list-title">Daftar batch</h2>
    <div class="lcards">${batchRows()}</div>

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

function batchRows() {
  if (!overview.batches.length) return '<p class="muted list-empty">Belum ada batch.</p>';
  return overview.batches.map((b) => {
    const rows = overview.batchStock.filter((row) => row.batchId === b.id);
    const stock = rows.reduce((sum, row) => sum + row.n, 0);
    const holders = rows.map((row) => `${row.resellerId ? esc(resellerName(row.resellerId)) : 'Pusat'} ${row.n}`).join(' · ');
    return `
    <article class="lcard">
      <div class="lcard-head">
        <div class="lcard-title"><h3>Batch #${b.id}</h3><small>${b.note ? `${esc(b.note)} · ` : ''}${formatDate(b.createdAt)}</small></div>
        <span class="seal-tile seal-stock"><b>${stock}</b><span>stok</span></span>
      </div>
      <div class="lcard-body">
        <p>Stok ${stock} · Aktif ${b.activated} dari ${b.qty} kartu</p>
        <p>${stock ? `Dipegang: ${holders}` : 'Stok habis, semua kartu sudah aktif.'}</p>
      </div>
      <details class="lcard-more">
        <summary>Cetak dan unduh${icon('back')}</summary>
        <div class="lcard-drawer admin-actions">
          <a class="btn btn-small" href="/admin/cetak/${b.id}" target="_blank" rel="noopener">QR dan kode</a>
          <a class="btn btn-small" href="/admin/batch/${b.id}.csv">CSV vendor</a>
        </div>
      </details>
    </article>`;
  }).join('');
}

function resellerRows() {
  if (!overview.resellers.length) return '<p class="muted list-empty">Belum ada reseller.</p>';
  return overview.resellers.map((r) => `
    <article class="lcard" data-reseller-card="${r.id}">
      <div class="lcard-head">
        <div class="lcard-title"><h3>${esc(r.name)}</h3>${r.active ? '<small>Aktif</small>' : '<small class="off">Nonaktif</small>'}</div>
        <span class="seal-tile seal-stock"><b>${r.stock}</b><span>stok</span></span>
      </div>
      <div class="lcard-body">
        <p>${esc(displayWa(r.whatsapp))}${r.city ? ` · ${esc(r.city)}` : ''}</p>
        <p>Stok ${r.stock} · Terjual ${r.sold}</p>
      </div>
      <details class="lcard-more">
        <summary>Kelola reseller${icon('back')}</summary>
        <div class="lcard-drawer stack-sm">
          <form class="stack-sm" data-reseller="${r.id}">
            <label class="field"><span>Nama</span><input name="name" maxlength="80" required value="${esc(r.name)}"></label>
            <div class="split-fields">
              <label class="field"><span>WhatsApp</span><input name="whatsapp" inputmode="tel" maxlength="20" required value="${esc(displayWa(r.whatsapp))}"></label>
              <label class="field"><span>Kota</span><input name="city" maxlength="60" value="${esc(r.city)}"></label>
            </div>
            <p class="form-msg" role="alert"></p>
            <button class="btn btn-small btn-light" type="submit">Simpan data</button>
          </form>
          <div class="admin-actions">
            <button class="btn btn-small" data-reseller-pin="${r.id}">PIN baru</button>
            ${r.active
              ? `<button class="btn btn-small btn-danger" data-active="0" data-id="${r.id}">Nonaktifkan</button>`
              : `<button class="btn btn-small" data-active="1" data-id="${r.id}">Aktifkan</button>`}
          </div>
        </div>
      </details>
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

    <h2 class="list-title">Daftar reseller</h2>
    <div id="resellers" class="lcards">${resellerRows()}</div>`;
}

function bisnisView() {
  return `
    ${result}
    <section class="panel">
      <h2>Bisnis</h2>
      <input class="search" id="search" type="search" aria-label="Cari bisnis, kode kartu, atau reseller" placeholder="Cari nama, kode, atau reseller" value="${esc(searchQuery)}">
    </section>
    <div id="rows" class="lcards">${businessRows(searchQuery)}</div>`;
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
    const ok = await confirmBox({ title: 'Kosongkan kartu?', text: `Kartu ${values.code.toUpperCase()} kembali kosong dan riwayat tap-nya ikut terhapus. Tindakan ini tidak bisa dibatalkan.`, ok: 'Kosongkan', danger: true });
    if (!ok) return;
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
    const { resellerPin, active, id } = event.target.closest('button')?.dataset ?? {};
    try {
      if (resellerPin && await confirmBox({ title: 'Buat PIN baru?', text: 'PIN lama reseller langsung tidak berlaku.', ok: 'Buat PIN baru' })) {
        const made = await api(`/api/admin/resellers/${resellerPin}/pin`, { method: 'POST' });
        result = pinTicket({ title: 'PIN reseller baru', name: made.name, pin: made.pin });
        await refresh();
        showResult();
      }
      if (active !== undefined) {
        if (active === '0' && !await confirmBox({ title: 'Nonaktifkan reseller?', text: 'Reseller langsung keluar dan tidak bisa masuk sampai diaktifkan lagi.', ok: 'Nonaktifkan', danger: true })) return;
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
    const { plan, months, id, newPin } = event.target.closest('button')?.dataset ?? {};
    try {
      if (plan) {
        if (plan === 'basic' && !await confirmBox({ title: 'Ubah ke Basic?', text: 'Fitur Pro bisnis ini langsung terkunci.', ok: 'Ubah ke Basic', danger: true })) return;
        await api(`/api/admin/businesses/${id}/plan`, { method: 'POST', body: { plan, months: Number(months) } });
        await reload('Paket diubah');
      }
      if (newPin && await confirmBox({ title: 'Buat PIN baru pembeli?', text: 'PIN lama pembeli langsung tidak berlaku.', ok: 'Buat PIN baru' })) {
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
  moveDock(dock);
  const views = { jual: jualView, kartu: kartuView, reseller: resellerView, bisnis: bisnisView };
  root.innerHTML = `
    <div class="topbar page-top"><h1>${TITLES[tab]}</h1>${tab === 'bisnis' ? '<button class="btn btn-small" id="logout">Keluar</button>' : ''}</div>
    ${usageWarnings()}${views[tab]()}`;
  root.querySelectorAll('[data-w]').forEach((bar) => { bar.style.width = `${bar.dataset.w}%`; });
  ({ jual: bindJual, kartu: bindKartu, reseller: bindReseller, bisnis: bindBisnis })[tab]();
  if (tab === 'reseller' && focusReseller) {
    const card = root.querySelector(`[data-reseller-card="${focusReseller}"]`);
    focusReseller = null;
    if (card) requestAnimationFrame(() => {
      card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      card.classList.add('spot');
    });
  }
  document.getElementById('logout')?.addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });
}

root.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-copy]');
  if (chip) copyCode(chip.dataset.copy);
  const seller = event.target.closest('[data-goto-reseller]');
  if (seller) {
    focusReseller = seller.dataset.gotoReseller;
    location.hash = 'reseller';
  }
});

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
  if (!focusReseller) scrollTo({ top: 0 });
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
