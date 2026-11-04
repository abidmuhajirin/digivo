export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error ?? 'Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.');
    error.status = res.status;
    throw error;
  }
  return data;
}

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const icon = (name) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;
export const groupCode = (code) => code.replace(/^(.{4})(.+)$/, '$1-$2');

export function bindForm(form, handler) {
  const message = form.querySelector('.form-msg');
  const submit = form.querySelector('[type=submit]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (message) { message.textContent = ''; message.classList.remove('ok'); }
    if (submit) submit.disabled = true;
    try {
      await handler(Object.fromEntries(new FormData(form)), message);
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

export function toast(text) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role', 'status');
  node.textContent = text;
  document.body.append(node);
  setTimeout(() => node.remove(), 2400);
}

export function waUrl(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function formatDate(ts) {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(ts);
}

// Kode aktivasi tercetak XXXX-XXXX, jadi strip muncul sendiri saat diketik. Server tetap menerima tanpa strip.
document.addEventListener('input', (event) => {
  const field = event.target;
  if (field.name !== 'activationCode') return;
  const raw = field.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  const value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  if (value !== field.value) field.value = value;
});

// Segel terverifikasi KasirBosku: lingkaran dengan delapan lekuk lembut.
const SEAL_D = `M${Array.from({ length: 120 }, (_, i) => {
  const a = (i / 120) * 2 * Math.PI;
  const r = 10.4 + 1.2 * Math.cos(8 * a);
  return `${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`;
}).join('L')}Z`;
const SEAL_TONE = { pro: ['#0a6cf5', '#ffffff'], basic: ['#ffd93b', '#1b2341'], trial: ['#e5342b', '#ffffff'], verified: ['#16a34a', '#ffffff'] };
export const seal = (tier) => `<svg class="seal" viewBox="0 0 24 24" aria-hidden="true"><path fill="${SEAL_TONE[tier][0]}" d="${SEAL_D}"/><path fill="none" stroke="${SEAL_TONE[tier][1]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M7.6 12.3l3 3 5.8-6.2"/></svg>`;

// Konfirmasi di tengah layar dengan gaya aplikasi, pengganti confirm() bawaan browser.
// Menu bawah: pil kuning digeser ke menu aktif. Transisi baru dinyalakan setelah posisi awal terpasang.
export function moveDock(dock) {
  const buttons = [...dock.querySelectorAll('button')];
  const index = buttons.findIndex((button) => button.getAttribute('aria-current') === 'page');
  let ink = dock.querySelector('.dock-ink');
  if (!ink) {
    ink = document.createElement('span');
    ink.className = 'dock-ink';
    ink.setAttribute('aria-hidden', 'true');
    dock.prepend(ink);
    requestAnimationFrame(() => requestAnimationFrame(() => dock.classList.add('ready')));
  }
  ink.hidden = index < 0;
  dock.style.setProperty('--i', Math.max(index, 0));
}

export function confirmBox({ title, text, ok = 'Ya, lanjutkan', danger = false }) {
  let dialog = document.querySelector('.cdlg');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'cdlg';
    dialog.innerHTML = '<form method="dialog"><h2></h2><p></p><div class="cdlg-actions"><button class="btn" value="cancel">Batal</button><button class="cta" value="ok"></button></div></form>';
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close('cancel'); });
    document.body.append(dialog);
  }
  dialog.querySelector('h2').textContent = title;
  dialog.querySelector('p').textContent = text;
  const okButton = dialog.querySelector('[value=ok]');
  okButton.textContent = ok;
  okButton.classList.toggle('danger', danger);
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

export function copyCode(code) {
  navigator.clipboard.writeText(code)
    .then(() => toast(`Kode ${code} disalin`))
    .catch(() => toast('Gagal menyalin. Tahan kodenya untuk menyalin manual.'));
}

export const codeChip = (code, label = code) => `<button type="button" class="code-chip" data-copy="${esc(code)}" aria-label="Salin kode ${esc(code)}">${esc(label)}${icon('copy')}</button>`;
