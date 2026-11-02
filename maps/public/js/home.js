import { waUrl } from '/js/common.js';

document.getElementById('code-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = new FormData(event.target).get('code').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (code) location.href = `/aktivasi/${code}`;
});

const number = document.body.dataset.wa;
document.querySelectorAll('[data-wa-link]').forEach((link) => {
  if (number) link.href = waUrl(number, link.dataset.waLink);
  else link.hidden = true;
});
