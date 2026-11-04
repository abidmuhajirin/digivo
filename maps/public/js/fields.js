// Setiap isian ketik mendapat tombol silang untuk menghapus cepat. Isian PIN dan kata sandi juga
// mendapat tombol mata. Dipasang otomatis, termasuk pada isian yang dibuat ulang oleh skrip halaman.

const SKIP = new Set(['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'range', 'color', 'image', 'date', 'time']);
const svg = (name) => `<svg class="i" aria-hidden="true"><use href="/icons.svg#${name}"/></svg>`;

function button(className, label, iconName) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `fx-btn ${className}`;
  node.setAttribute('aria-label', label);
  node.innerHTML = svg(iconName);
  // Fokus tetap di isian, jadi keyboard ponsel tidak tertutup lalu terbuka lagi.
  node.addEventListener('pointerdown', (event) => event.preventDefault());
  return node;
}

function enhance(field) {
  if (field.dataset.fx || field.readOnly || field.closest('.hp, .fx')) return;
  if (field.tagName === 'INPUT' && SKIP.has(field.type)) return;
  field.dataset.fx = '1';
  const secret = field.type === 'password' || field.classList.contains('pin');
  const focused = document.activeElement === field;
  const box = document.createElement('span');
  box.className = `fx${secret ? ' fx-secret' : ''}${field.tagName === 'TEXTAREA' ? ' fx-area' : ''}`;
  field.replaceWith(box);
  box.append(field);
  // Tombol silang disembunyikan lewat :placeholder-shown, jadi ikut benar walau isian diubah skrip.
  if (!field.placeholder) field.placeholder = ' ';

  const clear = button('fx-clear', 'Hapus isian', 'x');
  clear.tabIndex = -1;
  clear.addEventListener('click', () => {
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  });
  box.append(clear);

  if (secret) {
    const kind = field.classList.contains('pin') ? 'PIN' : 'kata sandi';
    field.type = 'password';
    const eye = button('fx-eye', `Tampilkan ${kind}`, 'eye');
    eye.setAttribute('aria-pressed', 'false');
    eye.addEventListener('click', () => {
      const show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', `${show ? 'Sembunyikan' : 'Tampilkan'} ${kind}`);
      eye.innerHTML = svg(show ? 'eye-off' : 'eye');
    });
    box.append(eye);
  }
  if (focused) field.focus();
}

const scan = (root) => root.querySelectorAll?.('input, textarea').forEach(enhance);

scan(document);
new MutationObserver((changes) => {
  for (const change of changes) change.addedNodes.forEach((node) => { if (node.nodeType === 1) { if (node.matches('input, textarea')) enhance(node); else scan(node); } });
}).observe(document.body, { childList: true, subtree: true });
