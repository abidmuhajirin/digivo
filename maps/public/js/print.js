import QRCode from '/js/qrcode.js';

const button = document.querySelector('[data-print]');
button.addEventListener('click', () => window.print());

try {
  await Promise.all([...document.querySelectorAll('[data-qr]')].map(async (node) => {
    node.innerHTML = await QRCode.toString(node.dataset.qr, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  }));
  button.disabled = false;
  button.textContent = 'Cetak';
} catch {
  button.textContent = 'QR gagal dibuat. Muat ulang halaman';
}
