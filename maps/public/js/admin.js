import { api, bindForm, esc, formatDate, toast } from '/js/common.js';

const root = document.getElementById('admin');
let overview;
let lastActivation = null;

const destinationNote = (kind) => (kind === 'review'
  ? 'Langsung ke form ulasan.'
  : 'Ke halaman Maps. Pelanggan perlu mengetuk Ulasan sekali lagi.');

const proLabel = (b) => {
  if (b.plan !== 'pro') return 'Basic';
  if (b.proUntil && b.proUntil < Date.now()) return `Pro habis ${formatDate(b.proUntil)}`;
  if (b.isTrial) return `Trial s.d. ${formatDate(b.proUntil)}`;
  return b.proUntil ? `Pro s.d. ${formatDate(b.proUntil)}` : 'Pro';
};

function businessRows(filter = '') {
  const query = filter.toLowerCase();
  const rows = overview.businessList.filter((b) =>
    `${b.name} ${b.codes ?? ''}`.toLowerCase().includes(query));
  if (!rows.length) {
    return `<p class="muted">${overview.businessList.length ? 'Tidak ada yang cocok.' : 'Belum ada bisnis. Kartu yang diaktifkan pelanggan muncul di sini.'}</p>`;
  }
  return rows.map((b) => `
    <article class="admin-row">
      <div>
        ${esc(b.name)}${b.isDemo ? ' <span class="muted">(demo)</span>' : ''}
        <small>${esc(proLabel(b))} · ${b.cards} kartu · ${b.taps30} tap 30 hari</small>
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
      </div>
    </article>`).join('');
}

function activationResult() {
  if (!lastActivation) return '';
  const { name, code, pin, kind, trial, trialDays } = lastActivation;
  return `
    <article class="ticket">
      <div class="ticket-top">
        <p class="muted">${esc(name)}</p>
        <h2>Kartu aktif</h2>
      </div>
      <dl>
        <div><dt>Kode kartu</dt><dd>${esc(code)}</dd></div>
        <div><dt>PIN pembeli</dt><dd>${esc(pin)}</dd></div>
        <div><dt>Paket</dt><dd>${trial ? `Trial Pro ${trialDays} hari` : 'Basic'}</dd></div>
        <div><dt>Tujuan</dt><dd>${esc(destinationNote(kind))}</dd></div>
      </dl>
      <p class="muted ticket-note">Berikan kode dan PIN ke pembeli sekarang. PIN tidak bisa dilihat lagi.</p>
    </article>`;
}

function render() {
  root.innerHTML = `
    <header class="admin-head">
      <h1>Stok dan pelanggan</h1>
      <button class="btn btn-small" id="logout">Keluar</button>
    </header>

    <section class="admin-stock">
      <div class="admin-stock-main"><b class="num">${overview.ready}</b><span>kartu kosong siap jual</span></div>
      <dl>
        <div><dt>Kartu aktif</dt><dd>${overview.active}</dd></div>
        <div><dt>Bisnis</dt><dd>${overview.businesses}</dd></div>
        <div><dt>Tap 30 hari</dt><dd>${overview.taps30}</dd></div>
        <div><dt>Pro</dt><dd>${overview.pro}</dd></div>
        <div><dt>Trial</dt><dd>${overview.trials}</dd></div>
      </dl>
    </section>

    <section class="panel">
      <h2>Atur kartu untuk pembeli</h2>
      <form id="activate" class="stack-sm" autocomplete="off">
        <label class="field"><span>Kode kartu</span><input class="code" name="code" maxlength="10" required placeholder="7 karakter"></label>
        <label class="field"><span>Nama bisnis</span><input name="name" maxlength="80" required placeholder="Nama sesuai Google Maps"></label>
        <label class="field"><span>Link Google Maps</span><input name="link" inputmode="url" required placeholder="https://maps.app.goo.gl/..."></label>
        <div class="split-fields">
          <label class="field"><span>Jumlah ulasan sekarang</span><input name="reviewCount" inputmode="numeric" maxlength="7" placeholder="Opsional"></label>
          <label class="field"><span>Rating</span><input name="rating" inputmode="decimal" maxlength="3" placeholder="Misal: 4,5"></label>
        </div>
        <p class="form-msg" role="alert"></p>
        <button class="cta" type="submit">Aktifkan kartu</button>
      </form>
    </section>
    ${activationResult()}

    <section class="panel">
      <h2>Tujuan kartu belum terjual</h2>
      <p class="muted">${overview.defaultUrl ? 'Kartu kosong dibuka ke link ini.' : 'Belum diatur, jadi kartu kosong membuka halaman aktivasi.'}</p>
      <form id="default-link" class="stack-sm">
        <label class="field"><span>Link Google Maps</span><input name="link" inputmode="url" value="${esc(overview.defaultUrl ?? '')}" placeholder="https://maps.app.goo.gl/..."></label>
        <p class="form-msg" role="alert"></p>
        <button class="btn btn-small btn-light" type="submit">Simpan tujuan</button>
      </form>
    </section>

    <section class="panel">
      <h2>Buat batch kartu</h2>
      <form id="batch" class="stack-sm">
        <div class="split-fields">
          <label class="field"><span>Catatan</span><input name="note" maxlength="80" placeholder="Misal: Reseller Bandung"></label>
          <label class="field"><span>Jumlah</span><input name="qty" type="number" inputmode="numeric" min="1" max="1000" value="50" required></label>
        </div>
        <p class="form-msg" role="alert"></p>
        <button class="btn btn-light" type="submit">Buat batch</button>
      </form>
      ${overview.batches.map((b) => `
        <article class="admin-row">
          <div>Batch #${b.id}${b.note ? ` · ${esc(b.note)}` : ''}
            <small>${formatDate(b.createdAt)} · ${b.activated} dari ${b.qty} teraktivasi</small></div>
          <div class="admin-actions">
            <a class="btn btn-small" href="/admin/cetak/${b.id}" target="_blank">Lembar cetak</a>
            <a class="btn btn-small" href="/admin/batch/${b.id}.csv">CSV vendor</a>
          </div>
        </article>`).join('') || '<p class="muted">Belum ada batch. Buat batch pertama di atas.</p>'}
    </section>

    <section class="panel">
      <h2>Bisnis</h2>
      <input class="search" id="search" type="search" aria-label="Cari bisnis atau kode kartu" placeholder="Cari nama atau kode kartu">
      <div id="rows">${businessRows()}</div>
    </section>`;

  bindForm(document.getElementById('activate'), async (values) => {
    lastActivation = await api('/api/admin/activate', { method: 'POST', body: values });
    await refresh();
    scrollTo({ top: 0 });
    document.querySelector('.ticket')?.scrollIntoView({ block: 'center' });
  });
  bindForm(document.getElementById('default-link'), async (values) => {
    await api('/api/admin/default-link', { method: 'PUT', body: values });
    await refresh();
    toast('Tujuan disimpan');
  });
  bindForm(document.getElementById('batch'), async (values) => {
    await api('/api/admin/batches', { method: 'POST', body: { qty: Number(values.qty), note: values.note } });
    await refresh();
    toast('Batch dibuat');
  });
  document.getElementById('search').addEventListener('input', (event) => {
    document.getElementById('rows').innerHTML = businessRows(event.target.value);
  });
  document.getElementById('rows').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const message = form.querySelector('.form-msg');
    message.textContent = '';
    try {
      const result = await api(`/api/admin/businesses/${form.dataset.edit}`, {
        method: 'PUT',
        body: Object.fromEntries(new FormData(form)),
      });
      await refresh();
      toast(destinationNote(result.kind));
    } catch (error) {
      message.textContent = error.message;
    }
  });
  document.getElementById('rows').addEventListener('click', async (event) => {
    const { plan, months, id } = event.target.dataset;
    if (!plan) return;
    try {
      await api(`/api/admin/businesses/${id}/plan`, { method: 'POST', body: { plan, months: Number(months) } });
      await refresh();
      toast('Paket diubah');
    } catch (error) {
      toast(error.message);
    }
  });
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });
}

async function refresh() {
  overview = await api('/api/admin/overview');
  render();
}

bindForm(document.getElementById('admin-login'), async (values) => {
  await api('/api/admin/login', { method: 'POST', body: values });
  await refresh();
});

refresh().catch(() => {});
