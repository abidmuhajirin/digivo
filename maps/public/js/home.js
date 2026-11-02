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

const proof = document.querySelector('.proof');
new IntersectionObserver((entries, observer) => {
  if (!entries[0].isIntersecting) return;
  proof.classList.add('in');
  observer.disconnect();
}, { threshold: .3 }).observe(proof);
