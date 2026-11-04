import '/js/fields.js';

// Lebar batang ringkasan ulasan dipasang di sini karena CSP melarang atribut style.
document.querySelectorAll('[data-w]').forEach((node) => { node.style.width = `${node.dataset.w}%`; });

const form = document.getElementById('fb');
const message = form.querySelector('.form-msg');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  message.textContent = '';
  message.classList.remove('ok');
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), code: document.body.dataset.code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Pesan gagal terkirim. Coba lagi.');
    form.reset();
    message.textContent = 'Terkirim. Terima kasih.';
    message.classList.add('ok');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
