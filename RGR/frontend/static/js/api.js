/* api.js — fetch wrapper with JWT auto-refresh */

const API_BASE = '';

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('access_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(API_BASE + url, { ...options, headers });

  // Try refresh on 401
  if (res.status === 401) {
    const refresh = localStorage.getItem('refresh_token');
    if (refresh) {
      const r2 = await fetch(API_BASE + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${refresh}` }
      });
      if (r2.ok) {
        const data = await r2.json();
        localStorage.setItem('access_token', data.access_token);
        headers['Authorization'] = `Bearer ${data.access_token}`;
        res = await fetch(API_BASE + url, { ...options, headers });
      } else {
        clearAuth();
        return null;
      }
    } else {
      return null;
    }
  }
  return res;
}

async function apiGet(url) {
  const res = await apiFetch(url);
  if (!res) return null;
  return res.ok ? res.json() : null;
}

async function apiPost(url, body) {
  const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res) return { error: 'Не авторизован' };
  return res.json();
}

async function apiDelete(url) {
  const res = await apiFetch(url, { method: 'DELETE' });
  if (!res) return null;
  return res.ok ? res.json() : null;
}

async function apiUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = localStorage.getItem('access_token');
    xhr.open('POST', API_BASE + url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload  = () => resolve(JSON.parse(xhr.responseText));
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(formData);
  });
}

function clearAuth() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

function getUser() {
  const s = localStorage.getItem('user');
  return s ? JSON.parse(s) : null;
}

function isLoggedIn() {
  return !!localStorage.getItem('access_token');
}

function formatDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatTime(sec) {
  if (isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
