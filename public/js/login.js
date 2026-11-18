// public/js/login.js
// Совместим с защищённым сервером: httpOnly cookie + fallback в localStorage.

// === ФОРМА ВХОДА ===
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = document.getElementById('login').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('errorMessage');
  const btn = document.getElementById('loginBtn');

  errorDiv.textContent = '';
  btn.disabled = true;
  btn.textContent = '⏳ Проверяем...';

  try {
    const res = await fetch('/api/volgodonsk/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ login, password })
    });
    const data = await res.json();

    if (data.success) {
      localStorage.setItem('volg_user', JSON.stringify(data.user));
      if (data.token) localStorage.setItem('volg_token', data.token);
      // Сервер уже поставил httpOnly cookie — он и есть основной механизм.
      window.location.href = '/volgodonsk/dashboard.html';
    } else {
      errorDiv.textContent = '❌ ' + (data.error || 'Неверный логин или пароль');
      btn.disabled = false;
      btn.textContent = '🔑 Войти';
    }
  } catch (err) {
    errorDiv.textContent = '❌ Ошибка соединения с сервером';
    btn.disabled = false;
    btn.textContent = '🔑 Войти';
  }
});

// === ПЕРЕКЛЮЧАТЕЛЬ ПАРОЛЯ ===
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}
window.togglePassword = togglePassword;

// === ВОССТАНОВЛЕНИЕ ПАРОЛЯ ===
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const forgotModal = document.getElementById('forgotModal');
const closeForgotBtn = document.getElementById('closeForgotBtn');
const forgotForm = document.getElementById('forgotForm');
const forgotMessage = document.getElementById('forgotMessage');

const resetModal = document.getElementById('resetModal');
const closeResetBtn = document.getElementById('closeResetBtn');
const resetForm = document.getElementById('resetForm');
const resetMessage = document.getElementById('resetMessage');

// Запоминаем email, к которому привязан код, между двумя модалками
let resetEmail = '';

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    forgotModal.classList.remove('hidden');
  });
}

if (closeForgotBtn) {
  closeForgotBtn.addEventListener('click', () => {
    forgotModal.classList.add('hidden');
    forgotMessage.textContent = '';
    if (forgotForm) forgotForm.reset();
  });
}

if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();
    const btn = document.getElementById('forgotBtn');
    
    btn.disabled = true;
    btn.textContent = '⏳ Отправка...';
    forgotMessage.className = 'status';
    forgotMessage.textContent = '';

    try {
      const res = await fetch('/api/volgodonsk/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await res.json();

      if (result.success) {
        // СОХРАНЯЕМ EMAIL ДЛЯ СЛЕДУЮЩЕГО ШАГА
        sessionStorage.setItem('resetEmail', email);
        
        forgotMessage.className = 'status success';
        forgotMessage.textContent = '✅ ' + result.message;
        setTimeout(() => {
          forgotModal.classList.add('hidden');
          resetModal.classList.remove('hidden');
        }, 1500);
      } else {
        forgotMessage.className = 'status error';
        forgotMessage.textContent = '❌ ' + result.error;
      }
    } catch (err) {
      forgotMessage.className = 'status error';
      forgotMessage.textContent = '❌ Ошибка сети: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '📧 Отправить временный пароль';
    }
  });
}

if (closeResetBtn) {
  closeResetBtn.addEventListener('click', () => {
    resetModal.classList.add('hidden');
    resetMessage.textContent = '';
    if (resetForm) resetForm.reset();
    resetEmail = '';
  });
}

if (resetForm) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tempPassword = document.getElementById('tempPassword').value.trim();
    const newPassword = document.getElementById('newPassword').value;
    const btn = document.getElementById('resetBtn');
    
    // ДОСТАЁМ EMAIL ИЗ ПАМЯТИ
    const email = sessionStorage.getItem('resetEmail');

    if (!email) {
      resetMessage.className = 'status error';
      resetMessage.textContent = '❌ Сначала запросите код через «Забыли пароль?»';
      return;
    }

    if (newPassword.length < 8) {
      resetMessage.className = 'status error';
      resetMessage.textContent = '❌ Новый пароль должен быть не менее 8 символов';
      return;
    }
    
    btn.disabled = true;
    btn.textContent = '⏳ Установка...';
    resetMessage.className = 'status';
    resetMessage.textContent = '';

    try {
      const res = await fetch('/api/volgodonsk/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tempPassword, newPassword }) // ПЕРЕДАЁМ EMAIL
      });
      const result = await res.json();

      if (result.success) {
        sessionStorage.removeItem('resetEmail');
        resetMessage.className = 'status success';
        resetMessage.textContent = '✅ ' + result.message + ' Перенаправление на вход...';
        setTimeout(() => {
          resetModal.classList.add('hidden');
          window.location.reload();
        }, 1500);
      } else {
        resetMessage.className = 'status error';
        resetMessage.textContent = '❌ ' + result.error;
      }
    } catch (err) {
      resetMessage.className = 'status error';
      resetMessage.textContent = '❌ Ошибка сети: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '✅ Установить новый пароль';
    }
  });
}