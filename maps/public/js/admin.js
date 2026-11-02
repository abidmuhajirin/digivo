import { api, bindForm, esc, formatDate, toast } from '/js/common.js';

const root = document.getElementById('admin');
let overview;

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
      <div class="admin-actions">
        <button class="btn btn-small" data-plan="pro" data-months="1" data-id="${b.id}">+1 bln</button>
        <button class="btn btn-small" data-plan="pro" data-months="12" data-id="${b.id}">+12 bln</button>
        ${b.plan === 'pro' ? `<button class="btn btn-small btn-danger" data-plan="basic" data-id="${b.id}">Ke Basic</button>` : ''}
      </div>
    </article>`).join('');
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

  bindForm(document.getElementById('batch'), async (values) => {
    await api('/api/admin/batches', { method: 'POST', body: { qty: Number(values.qty), note: values.note } });
    await refresh();
    toast('Batch dibuat');
  });
  document.getElementById('search').addEventListener('input', (event) => {
    document.getElementById('rows').innerHTML = businessRows(event.target.value);
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
