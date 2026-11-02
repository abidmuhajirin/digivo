import { api, bindForm } from '/js/common.js';

const login = document.getElementById('login');
const preset = new URLSearchParams(location.search).get('kartu');
if (preset) {
  login.code.value = preset;
  login.pin.focus();
}

bindForm(login, async (values) => {
  await api('/api/login', { method: 'POST', body: values });
  location.href = '/app';
});

bindForm(document.getElementById('forgot'), async (values) => {
  await api('/api/forgot-pin', { method: 'POST', body: values });
  location.href = '/app';
});
