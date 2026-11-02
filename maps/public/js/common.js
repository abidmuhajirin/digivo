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
