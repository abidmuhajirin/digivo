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

const tablist = document.querySelector('.tabs');
const tabs = [...tablist.querySelectorAll('[role=tab]')];
const sheet = document.querySelector('.sheet');
const calm = matchMedia('(prefers-reduced-motion: reduce)');
let releaseTimer;

function showTab(name) {
  if (tablist.dataset.active === name) return;
  const from = sheet.offsetHeight;
  tablist.dataset.active = name;
  tabs.forEach((tab) => {
    const active = tab.id === `tab-${name}`;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    tab.setAttribute('aria-selected', active);
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    panel.classList.toggle('enter', active);
  });
  releaseSheet();
  const to = sheet.offsetHeight;
  if (calm.matches || from === to) return;
  sheet.style.height = `${from}px`;
  sheet.classList.add('moving');
  void sheet.offsetHeight;
  sheet.style.height = `${to}px`;
  releaseTimer = setTimeout(releaseSheet, 600);
}

function releaseSheet() {
  clearTimeout(releaseTimer);
  sheet.classList.remove('moving');
  sheet.style.height = '';
}

sheet.addEventListener('transitionend', (event) => {
  if (event.target === sheet && event.propertyName === 'height') releaseSheet();
});

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => showTab(tab.id.slice(4)));
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = tabs[(i + 1) % tabs.length];
    showTab(next.id.slice(4));
    next.focus();
  });
});

document.querySelectorAll('[data-show]').forEach((link) => {
  link.addEventListener('click', () => showTab(link.dataset.show));
});

const insights = document.getElementById('insights');
const slides = [...insights.children];
let slide = 0;

function turnInsight(step) {
  slide = (slide + step + slides.length) % slides.length;
  insights.style.setProperty('--i', slide);
  slides.forEach((item, i) => { item.inert = i !== slide; });
}
slides.forEach((item, i) => { item.inert = i !== 0; });
document.getElementById('insight-prev').addEventListener('click', () => turnInsight(-1));
document.getElementById('insight-next').addEventListener('click', () => turnInsight(1));

// Tab Bulanan/Tahunan di kartu Pro: tinggi kartu ikut berubah halus, tombol pesan mengikuti pilihan.
const planTabs = document.querySelector('.ptabs');
const planTabList = [...planTabs.querySelectorAll('[role=tab]')];
const proCard = document.querySelector('.plan-pro');
const proOrder = document.getElementById('pro-order');
const PRO_TEXT = { bulan: 'Halo, saya mau langganan Pro bulanan kartu ulasan.', tahun: 'Halo, saya mau langganan Pro tahunan kartu ulasan.' };
let proTimer;

function releasePro() {
  clearTimeout(proTimer);
  proCard.classList.remove('moving');
  proCard.style.height = '';
}

function showPlan(name) {
  if (planTabs.dataset.active === name) return;
  const from = proCard.offsetHeight;
  planTabs.dataset.active = name;
  planTabList.forEach((tab) => {
    const active = tab.id === `ptab-${name}`;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    tab.setAttribute('aria-selected', active);
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    panel.classList.toggle('enter', active);
  });
  proOrder.dataset.waLink = PRO_TEXT[name];
  if (number) proOrder.href = waUrl(number, PRO_TEXT[name]);
  releasePro();
  const to = proCard.offsetHeight;
  if (calm.matches || from === to) return;
  proCard.style.height = `${from}px`;
  proCard.classList.add('moving');
  void proCard.offsetHeight;
  proCard.style.height = `${to}px`;
  proTimer = setTimeout(releasePro, 600);
}

proCard.addEventListener('transitionend', (event) => {
  if (event.target === proCard && event.propertyName === 'height') releasePro();
});
planTabList.forEach((tab, i) => {
  tab.addEventListener('click', () => showPlan(tab.id.slice(5)));
  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = planTabList[(i + 1) % planTabList.length];
    showPlan(next.id.slice(5));
    next.focus();
  });
});

const joinDialog = document.getElementById('join-dialog');
const joinForm = document.getElementById('join-form');
const joinOpen = document.getElementById('join-open');
const joinMsg = joinForm.querySelector('.dlg-msg');

if (number) joinOpen.addEventListener('click', () => joinDialog.showModal());
else joinOpen.hidden = true;
document.getElementById('login-open').addEventListener('click', (event) => {
  event.preventDefault();
  document.getElementById('login-dialog').showModal();
});
document.querySelectorAll('.dlg').forEach((dialog) => {
  dialog.querySelector('.dlg-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = joinForm.name.value.trim();
  const phone = joinForm.whatsapp.value.replace(/\D/g, '');
  const address = joinForm.address.value.trim().replace(/\s+/g, ' ');
  const problem = !name ? ['name', 'Isi nama.']
    : !/^(0|62)8\d{7,12}$/.test(phone) ? ['whatsapp', 'Nomor WhatsApp belum benar. Contoh: 081234567890.']
    : !address ? ['address', 'Isi alamat domisili.'] : null;
  joinForm.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
  joinMsg.textContent = problem ? problem[1] : '';
  if (problem) {
    joinForm[problem[0]].setAttribute('aria-invalid', 'true');
    joinForm[problem[0]].focus();
    return;
  }
  window.open(waUrl(number, `Halo, saya mau daftar jadi reseller kartu ulasan.\nNama: ${name}\nWhatsApp: ${phone}\nDomisili: ${address}`), '_blank', 'noopener');
  joinForm.reset();
  joinDialog.close();
});

// Contoh pengunjung per jam, 10.00 sampai 21.00.
const VISITS = {"Sen":[8,14,30,26,12,10,16,30,52,60,48,24],"Sel":[10,16,32,28,14,12,18,34,56,64,50,26],"Rab":[9,15,34,30,12,10,20,36,58,62,46,22],"Kam":[10,18,36,30,14,12,22,40,62,66,52,28],"Jum":[6,10,18,40,34,14,24,44,68,72,60,34],"Sab":[20,28,44,40,30,28,36,52,62,70,72,66],"Ahad":[30,42,58,62,54,40,44,50,56,52,40,24]};
const DAY_NAMES = {"Sen":"Senin","Sel":"Selasa","Rab":"Rabu","Kam":"Kamis","Jum":"Jumat","Sab":"Sabtu","Ahad":"Ahad"};
const visitBars = [...document.querySelectorAll('.visit-bars i')];
const visitChart = document.querySelector('.visit-bars');
const visitNote = document.querySelector('.visit-note span');
const dayButtons = [...document.querySelectorAll('.visit-days button')];
const clock = (index) => `${String(10 + index).padStart(2, '0')}.00`;

function showDay(day) {
  const counts = VISITS[day];
  let peak = 0;
  for (let i = 1; i <= counts.length - 3; i += 1) {
    if (counts[i] + counts[i + 1] + counts[i + 2] > counts[peak] + counts[peak + 1] + counts[peak + 2]) peak = i;
  }
  visitBars.forEach((bar, i) => {
    bar.style.height = `${counts[i]}px`;
    bar.classList.toggle('hot', i >= peak && i < peak + 3);
  });
  dayButtons.forEach((button) => button.setAttribute('aria-pressed', button.dataset.day === day));
  visitNote.textContent = `Paling ramai pukul ${clock(peak)}-${clock(peak + 2)}`;
  visitChart.setAttribute('aria-label', `${DAY_NAMES[day]}, paling ramai pukul ${clock(peak)} sampai ${clock(peak + 2)}`);
}
dayButtons.forEach((button) => button.addEventListener('click', () => showDay(button.dataset.day)));

const proof = document.querySelector('.proof');
new IntersectionObserver((entries, observer) => {
  if (!entries[0].isIntersecting) return;
  proof.classList.add('in');
  observer.disconnect();
}, { threshold: .3 }).observe(proof);
