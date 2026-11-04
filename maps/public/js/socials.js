// Social media Minipage. Dipakai dasbor Kelola dan server, jadi tanpa akses DOM.
// Yang disimpan hanya nama akun. Link selalu dibangun ke domain resmi, jadi isian tidak bisa membuka situs lain.

export const SOCIALS = [
  { key: 'instagram', label: 'Instagram', placeholder: '@namabisnis' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@namabisnis' },
  { key: 'facebook', label: 'Facebook', placeholder: 'namabisnis' },
  { key: 'youtube', label: 'YouTube', placeholder: '@namabisnis' },
];

const HOSTS = {
  instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i,
  tiktok: /^(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\//i,
  facebook: /^(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:facebook|fb)\.com\//i,
  youtube: /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\//i,
};

// Mengubah isian bebas (nama akun atau link profil) menjadi nama akun. Hasil null berarti tidak valid.
export function socialHandle(key, value) {
  let text = String(value ?? '').trim();
  if (!text) return '';
  if (key === 'facebook') {
    const id = text.match(/profile\.php\?id=(\d{5,20})/);
    if (id) return id[1];
  }
  text = text.replace(HOSTS[key], '').split(/[?#]/)[0].replace(/\/+$/, '');
  if (key === 'youtube') {
    const channel = text.match(/^channel\/(UC[\w-]{20,24})$/);
    if (channel) return `channel/${channel[1]}`;
  }
  text = text.replace(/^@/, '');
  return /^[\w.-]{1,60}$/.test(text) ? text : null;
}

export function socialUrl(key, handle) {
  if (key === 'instagram') return `https://www.instagram.com/${handle}`;
  if (key === 'tiktok') return `https://www.tiktok.com/@${handle}`;
  if (key === 'facebook') return /^\d+$/.test(handle) ? `https://www.facebook.com/profile.php?id=${handle}` : `https://www.facebook.com/${handle}`;
  return handle.startsWith('channel/') ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/@${handle}`;
}

export const socialText = (key, handle) => (key === 'facebook' || handle.startsWith('channel/') ? handle.replace('channel/', '') : `@${handle}`);
