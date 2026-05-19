/* auth.js — shared auth logic */

function initAuthUI() {
  const user        = getUser();
  const authButtons = document.getElementById('authButtons');
  const userMenu    = document.getElementById('userMenu');

  if (user && isLoggedIn()) {
    // Скрываем "Войти / Регистрация", показываем аватар
    authButtons && authButtons.classList.add('hidden');
    userMenu    && userMenu.classList.remove('hidden');

    const icon = document.getElementById('userAvatarIcon');
    if (icon) {
      if (user.avatar) {
        icon.innerHTML = `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        icon.textContent = user.username ? user.username[0].toUpperCase() : 'U';
      }
    }
    const un = document.getElementById('dropdownUsername');
    if (un) un.textContent = user.username;
  } else {
    // Показываем "Войти / Регистрация", скрываем аватар
    authButtons && authButtons.classList.remove('hidden');
    userMenu    && userMenu.classList.add('hidden');
  }
  // Кнопка "Загрузить" — всегда видна, никогда не трогаем
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

function switchTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
  }
}

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg || '';
}

async function doLogin() {
  setErr('loginEmailErr',''); setErr('loginPasswordErr',''); setErr('loginGlobalErr','');
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email)    { setErr('loginEmailErr',    'Обязательное поле'); return; }
  if (!password) { setErr('loginPasswordErr', 'Обязательное поле'); return; }

  const data = await apiPost('/api/auth/login', { email, password });
  if (data.error) { setErr('loginGlobalErr', data.error); return; }

  localStorage.setItem('access_token',  data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  closeModal('authModal');
  location.reload();
}

async function doRegister() {
  ['regEmailErr','regUsernameErr','regPasswordErr','regConfirmErr','regGlobalErr']
    .forEach(id => setErr(id, ''));

  const email    = document.getElementById('regEmail').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;

  const data = await apiPost('/api/auth/register', { email, username, password, confirm_password: confirm });

  if (data.errors) {
    if (data.errors.email)            setErr('regEmailErr',    data.errors.email);
    if (data.errors.username)         setErr('regUsernameErr', data.errors.username);
    if (data.errors.password)         setErr('regPasswordErr', data.errors.password);
    if (data.errors.confirm_password) setErr('regConfirmErr',  data.errors.confirm_password);
    return;
  }
  if (data.error) { setErr('regGlobalErr', data.error); return; }

  localStorage.setItem('access_token',  data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('user', JSON.stringify(data.user));
  closeModal('authModal');
  location.reload();
}

function logout() {
  clearAuth();
  window.location.href = '/';
}

// Wire up buttons
document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();

  const loginBtn    = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const avatarWrap  = document.getElementById('avatarWrap');
  const dropdown    = document.getElementById('userDropdown');

  loginBtn    && loginBtn.addEventListener('click',    () => { openModal('authModal'); switchTab('login'); });
  registerBtn && registerBtn.addEventListener('click', () => { openModal('authModal'); switchTab('register'); });

  // Если нажали "Загрузить" не будучи авторизованным — открываем вход
  const uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', e => {
      if (!isLoggedIn()) {
        e.preventDefault();
        openModal('authModal');
        switchTab('login');
      }
      // если авторизован — href сработает сам
    });
  }

  // Toggle dropdown
  avatarWrap && avatarWrap.addEventListener('click', e => {
    e.stopPropagation();
    dropdown && dropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => dropdown && dropdown.classList.remove('open'));

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ESC closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => closeModal(m.id));
    }
  });
});
