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

function showTab(name) {
  tablist.dataset.active = name;
  tabs.forEach((tab) => {
    const active = tab.id === `tab-${name}`;
    tab.setAttribute('aria-selected', active);
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  });
}

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

const proof = document.querySelector('.proof');
new IntersectionObserver((entries, observer) => {
  if (!entries[0].isIntersecting) return;
  proof.classList.add('in');
  observer.disconnect();
}, { threshold: .3 }).observe(proof);
