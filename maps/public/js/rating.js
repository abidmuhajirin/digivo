// Ringkasan ulasan bergaya Google Maps. Dipakai dasbor Kelola dan Minipage (server), jadi tanpa akses DOM.

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="/icons.svg#gstar"/></svg>';

export const formatRating = (rating) => rating.toFixed(1).replace('.', ',');

// Bintang dibulatkan ke setengah terdekat seperti di Google Maps: kuning, setengah, atau abu-abu.
export function googleStars(rating) {
  const rounded = Math.round(rating * 2) / 2;
  return Array.from({ length: 5 }, (_, i) => {
    const kind = rounded >= i + 1 ? 'full' : rounded >= i + 0.5 ? 'half' : 'empty';
    return `<span class="gstar ${kind}">${STAR}${kind === 'half' ? `<span class="gstar-half">${STAR}</span>` : ''}</span>`;
  }).join('');
}

// Google tidak membagikan jumlah per bintang, jadi panjang batang diperkirakan dari rating rata-rata.
// Batang terpanjang 100%. Batang yang sangat pendek tetap tampil sebagai titik, sama seperti di Google Maps.
export function ratingSpread(rating) {
  const target = Math.min(5, Math.max(1, rating));
  const weights = (t) => [5, 4, 3, 2, 1].map((star) => Math.exp(t * star));
  const mean = (t) => weights(t).reduce((sum, w, i) => sum + w * (5 - i), 0) / weights(t).reduce((sum, w) => sum + w, 0);
  let low = -12;
  let high = 12;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (mean(mid) < target) low = mid; else high = mid;
  }
  const list = weights(low);
  const top = Math.max(...list);
  return list.map((w) => Math.round((w / top) * 100));
}

// Lebar batang dipasang lewat data-w oleh skrip halaman, karena CSP melarang atribut style.
export function scoreGrid({ rating, count }) {
  const total = `${count.toLocaleString('id-ID')} ulasan`;
  if (!rating) return `<p class="review-count review-count-only">${total}</p>`;
  return `
      <div class="score-grid">
        <div class="spread">
          <h3>Ringkasan Ulasan</h3>
          <ol class="spread-bars" aria-label="Perkiraan sebaran bintang dari rating rata-rata">${ratingSpread(rating).map((w, i) =>
            `<li><span>${5 - i}</span><i><b data-w="${w}"></b></i></li>`).join('')}</ol>
          <small>Perkiraan dari rating</small>
        </div>
        <div class="score-main">
          <b class="review-score">${formatRating(rating)}</b>
          <span class="gstars" role="img" aria-label="Rating ${formatRating(rating)} dari 5">${googleStars(rating)}</span>
          <p class="review-count">${total}</p>
        </div>
      </div>`;
}
