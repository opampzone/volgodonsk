console.log('🚀 register.js загружен');

// Функция для переключения видимости пароля
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

// Показывать/скрывать поля ремонтника при выборе роли
document.getElementById('roleRepairman').addEventListener('change', (e) => {
  const show = e.target.checked;
  document.getElementById('repairmanTypeBlock').classList.toggle('hidden', !show);
  document.getElementById('specializationsBlock').classList.toggle('hidden', !show);
  document.getElementById('resumeBlock').classList.toggle('hidden', !show);
  document.getElementById('phone').required = show;
});

// Отправка формы регистрации
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const roles = [];
  if (document.getElementById('roleProfessional').checked) roles.push('professional');
  if (document.getElementById('roleRepairman').checked) roles.push('repairman');
  if (document.getElementById('roleHobby').checked) roles.push('hobby');
  if (document.getElementById('roleSeller').checked) roles.push('seller');

  if (roles.length === 0) {
    document.getElementById('statusMessage').innerHTML = '<div class="error">⚠️ Выберите хотя бы одну роль</div>';
    return;
  }

  const repairmanType = document.querySelector('input[name="repairmanType"]:checked')?.value || null;
  const location = document.getElementById('location').value.trim();

  if (!isValidLocation(location)) {
    document.getElementById('statusMessage').innerHTML = '<div class="error">❌ Населённый пункт не входит в список разрешённых</div>';
    return;
  }

  const specs = [];
  if (document.getElementById('specPhones').checked) specs.push('Смартфоны и планшеты');
  if (document.getElementById('specPC').checked) specs.push('Компьютерная техника');
  if (document.getElementById('specSoftware').checked) specs.push('Программный ремонт');
  if (document.getElementById('specHome').checked) specs.push('Бытовая аппаратура');
  if (document.getElementById('specAuto').checked) specs.push('Автоэлектроника');
  if (document.getElementById('specIndustrial').checked) specs.push('Промышленная электроника');

  const data = {
    login: document.getElementById('login').value.trim(),
    password: document.getElementById('password').value,
    email: document.getElementById('email').value.trim() || null,
    full_name: document.getElementById('fullName').value.trim(),
    roles,
    repairman_type: repairmanType,
    specializations: specs,
    resume: document.getElementById('resume').value.trim() || null,
    phone: document.getElementById('phone').value.trim() || null,
    telegram: document.getElementById('telegram').value.trim() || null,
    location
  };

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Регистрация...';

  try {
    const res = await fetch('/api/volgodonsk/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();

    if (result.success) {
      document.getElementById('statusMessage').innerHTML =
        `<div class="success">🎉 ${result.message}<br><br><a href="/volgodonsk/login.html" style="color:#4caf50;">→ Перейти ко входу</a></div>`;
      btn.textContent = '✅ Готово';
    } else {
      document.getElementById('statusMessage').innerHTML = `<div class="error">❌ ${result.error}</div>`;
      btn.disabled = false;
      btn.textContent = '✅ Зарегистрироваться';
    }
  } catch (err) {
    document.getElementById('statusMessage').innerHTML = `<div class="error">❌ Ошибка сети: ${err.message}</div>`;
    btn.disabled = false;
    btn.textContent = '✅ Зарегистрироваться';
  }
});

// Запуск определения геолокации при загрузке страницы
(async function initGeo() {
  const geoStatus = document.getElementById('geoStatus');
  const city = await detectCity();

  if (city) {
    if (isValidLocation(city)) {
      geoStatus.className = 'geo-status geo-ok';
      geoStatus.textContent = `✅ Ваш регион: ${city}. Регистрация доступна.`;
      document.getElementById('location').value = city;
      document.getElementById('registerForm').classList.remove('hidden');
    } else {
      geoStatus.className = 'geo-status geo-error';
      geoStatus.textContent = `❌ Регистрация в регионе "${city}" невозможна. Доступно только для Волгодонска и района.`;
    }
  } else {
    geoStatus.className = 'geo-status geo-error';
    geoStatus.innerHTML = '⚠️ Не удалось определить местоположение. Попробуйте обновить страницу, включить GPS или ввести город вручную.<br><br><button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;background:#2196f3;color:white;border:none;border-radius:4px;cursor:pointer;">🔄 Обновить</button>';
  }
})();
