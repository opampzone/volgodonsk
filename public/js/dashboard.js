// public/js/dashboard.js

console.log('🚀 dashboard.js загружен');

// Обертка для запросов: ловит 401 и редиректит на вход
async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const resp = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (resp.status === 401) {
    localStorage.removeItem('volg_user');
    localStorage.removeItem('volg_token');
    window.location.href = '/volgodonsk/login.html';
    throw new Error('Unauthorized');
  }
  return resp;
}

// Функция экранирования HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Глобальная функция для показа/скрытия пароля
window.togglePassword = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM загружен, начинаем инициализацию...');

  // 1. Проверка авторизации
  const userStr = localStorage.getItem('volg_user');
  if (!userStr) {
    console.warn('⚠️ Пользователь не найден, редирект на вход');
    window.location.href = '/volgodonsk/login.html';
    return;
  }

  const user = JSON.parse(userStr);
  console.log('✅ Пользователь авторизован:', user.login);

  // 2. Заполнение профиля
  const elName = document.getElementById('userName');
  if (elName) elName.textContent = user.full_name || 'Имя не указано';
  
  const elRoles = document.getElementById('userRoles');
  const roleNames = { 'professional': 'Профессионал', 'repairman': 'Ремонтник', 'hobby': 'Хобби', 'seller': 'Продавец' };
  const rolesRu = (user.roles || []).map(r => roleNames[r] || r);
  if (elRoles) elRoles.textContent = rolesRu.join(', ') || 'Не указаны';
  
  const elLocation = document.getElementById('userLocation');
  if (elLocation) elLocation.textContent = user.location || 'Не указан';

  // Заполняем форму редактирования текущими данными
  const editEmail = document.getElementById('editEmail');
  if (editEmail) editEmail.value = user.email || '';
  
  const editPhone = document.getElementById('editPhone');
  if (editPhone) editPhone.value = user.phone || '';
  
  const editTelegram = document.getElementById('editTelegram');
  if (editTelegram) editTelegram.value = user.telegram || '';

  // 3. Показываем основной контент
  const dashboardContent = document.getElementById('dashboardContent');
  if (dashboardContent) {
    dashboardContent.classList.remove('hidden');
    console.log('✅ Интерфейс отображён');
  }

  // 4. Логика выхода
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await apiFetch('/api/volgodonsk/logout', { method: 'POST' }); } catch (e) {}
      localStorage.removeItem('volg_user');
      localStorage.removeItem('volg_token');
      window.location.href = '/volgodonsk/';
    });
  }

  // 5. Обновление профиля (email, телефон, telegram)
  const updateForm = document.getElementById('updateForm');
  const updateStatus = document.getElementById('updateStatus');
  
  if (updateForm) {
    updateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = updateForm.querySelector('.btn-save');
      btn.disabled = true;
      btn.textContent = '⏳ Сохранение...';
      updateStatus.className = 'status';
      updateStatus.textContent = '';

      try {
        const res = await apiFetch('/api/volgodonsk/user/update', {
          method: 'POST',
          body: JSON.stringify({
            email: document.getElementById('editEmail').value.trim(),
            phone: document.getElementById('editPhone').value.trim(),
            telegram: document.getElementById('editTelegram').value.trim()
          })
        });
        const result = await res.json();

        if (result.success) {
          updateStatus.className = 'status success';
          updateStatus.textContent = '✅ ' + result.message;
          const updatedUser = { ...user, ...result.user };
          localStorage.setItem('volg_user', JSON.stringify(updatedUser));
        } else {
          updateStatus.className = 'status error';
          updateStatus.textContent = '❌ ' + result.error;
        }
      } catch (err) {
        updateStatus.className = 'status error';
        updateStatus.textContent = '❌ Ошибка сети: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '💾 Сохранить изменения';
      }
    });
  }

  // 6. Смена пароля
  const passwordForm = document.getElementById('passwordForm');
  const passwordStatus = document.getElementById('passwordStatus');
  
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const btn = passwordForm.querySelector('.btn-save');

      if (newPassword !== confirmPassword) {
        passwordStatus.className = 'status error';
        passwordStatus.textContent = '❌ Новый пароль и подтверждение не совпадают';
        return;
      }
      if (newPassword.length < 8) {
        passwordStatus.className = 'status error';
        passwordStatus.textContent = '❌ Пароль должен быть не менее 8 символов';
        return;
      }

      btn.disabled = true;
      btn.textContent = '⏳ Смена пароля...';
      passwordStatus.className = 'status';
      passwordStatus.textContent = '';

      try {
        const res = await apiFetch('/api/volgodonsk/user/update', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const result = await res.json();

        if (result.success) {
          passwordStatus.className = 'status success';
          passwordStatus.textContent = '✅ ' + result.message;
          passwordForm.reset();
        } else {
          passwordStatus.className = 'status error';
          passwordStatus.textContent = '❌ ' + result.error;
        }
      } catch (err) {
        passwordStatus.className = 'status error';
        passwordStatus.textContent = '❌ Ошибка сети: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '🔒 Сменить пароль';
      }
    });
  }

  // 7. Логика загрузки Excel
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const previewSection = document.getElementById('previewSection');
  const itemsCountSpan = document.getElementById('itemsCount');
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadStatus = document.getElementById('uploadStatus');

  let parsedItems = [];

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#4caf50'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#444'; });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#444';
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  function handleFile(file) {
    if (uploadStatus) { uploadStatus.className = 'status'; uploadStatus.textContent = 'Чтение файла...'; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        parsedItems = jsonData.map(row => ({
          name: String(row['Название'] || row['name'] || '').trim(),
          category: String(row['Категория'] || row['category'] || 'Без категории').trim(),
          qty: parseInt(row['Количество'] || row['qty'] || 0) || 0,
          price: parseInt(row['Цена'] || row['price'] || 0) || 0,
          condition: String(row['Состояние'] || row['condition'] || 'Не указано').trim(),
          description: String(row['Описание'] || row['description'] || '').trim()
        })).filter(item => item.name.length > 0);

        if (parsedItems.length === 0) {
          if (uploadStatus) { uploadStatus.className = 'status error'; uploadStatus.textContent = '❌ Файл пуст или нет колонки "Название"'; }
          if (previewSection) previewSection.classList.add('hidden');
        } else {
          if (itemsCountSpan) itemsCountSpan.textContent = parsedItems.length;
          if (previewSection) previewSection.classList.remove('hidden');
          if (uploadStatus) { uploadStatus.className = 'status'; uploadStatus.textContent = ''; }
        }
      } catch (err) {
        console.error('❌ Ошибка парсинга Excel:', err);
        if (uploadStatus) { uploadStatus.className = 'status error'; uploadStatus.textContent = '❌ Ошибка чтения: ' + err.message; }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  if (uploadBtn) {
    uploadBtn.addEventListener('click', async () => {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '⏳ Загрузка...';
      if (uploadStatus) { uploadStatus.className = 'status'; uploadStatus.textContent = 'Отправка на сервер...'; }

      try {
        const res = await apiFetch('/api/volgodonsk/components/upload', {
          method: 'POST',
          body: JSON.stringify({ items: parsedItems })
        });
        const result = await res.json();

        if (result.success) {
          if (uploadStatus) { uploadStatus.className = 'status success'; uploadStatus.textContent = '✅ Успешно загружено ' + result.count + ' товаров!'; }
          if (previewSection) previewSection.classList.add('hidden');
          if (fileInput) fileInput.value = '';
        } else {
          if (uploadStatus) { uploadStatus.className = 'status error'; uploadStatus.textContent = '❌ ' + result.error; }
        }
      } catch (err) {
        if (uploadStatus) { uploadStatus.className = 'status error'; uploadStatus.textContent = '❌ Ошибка сети: ' + err.message; }
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '✅ Загрузить на сервер';
      }
    });
  }

  // 7.5. Удаление всех компонентов
  const deleteComponentsBtn = document.getElementById('deleteComponentsBtn');
  const deleteComponentsStatus = document.getElementById('deleteComponentsStatus');

  if (deleteComponentsBtn) {
    deleteComponentsBtn.addEventListener('click', async () => {
      if (!confirm('⚠️ Вы уверены, что хотите удалить ВСЕ ваши компоненты? Это действие нельзя отменить.')) return;
      deleteComponentsBtn.disabled = true;
      deleteComponentsBtn.textContent = '⏳ Удаление...';
      if (deleteComponentsStatus) { deleteComponentsStatus.className = 'status'; deleteComponentsStatus.textContent = ''; }

      try {
        const res = await apiFetch('/api/volgodonsk/components/delete', {
          method: 'POST',
          body: JSON.stringify({ deleteAll: true })
        });
        const result = await res.json();

        if (result.success) {
          if (deleteComponentsStatus) { deleteComponentsStatus.className = 'status success'; deleteComponentsStatus.textContent = '✅'; }
          const componentsListBlock = document.getElementById('componentsListBlock');
          if (componentsListBlock) componentsListBlock.classList.add('hidden');
        } else {
          if (deleteComponentsStatus) { deleteComponentsStatus.className = 'status error'; deleteComponentsStatus.textContent = '❌ ' + result.error; }
        }
      } catch (err) {
        if (deleteComponentsStatus) { deleteComponentsStatus.className = 'status error'; deleteComponentsStatus.textContent = '❌ Ошибка сети: ' + err.message; }
      } finally {
        deleteComponentsBtn.disabled = false;
        deleteComponentsBtn.textContent = '🗑️ Удалить все мои компоненты';
      }
    });
  }

  // 7.6. Просмотр и редактирование компонентов
  const viewComponentsBtn = document.getElementById('viewComponentsBtn');
  const componentsListBlock = document.getElementById('componentsListBlock');
  const closeComponentsBtn = document.getElementById('closeComponentsBtn');
  const componentsList = document.getElementById('componentsList');
  const componentsCount = document.getElementById('componentsCount');
  const componentSearch = document.getElementById('componentSearch');
  const saveComponentsBtn = document.getElementById('saveComponentsBtn');
  const componentsControls = document.getElementById('componentsControls');
  const saveStatus = document.getElementById('saveStatus');

  let originalComponents = [];
  let currentComponents = [];
  let searchQuery = '';

  function renderComponentsList(itemsToRender) {
    if (!componentsList) return;

    if (itemsToRender.length === 0) {
      componentsList.innerHTML = '<div class="empty-message">📭 Компоненты не найдены</div>';
      componentsControls.classList.add('hidden');
      return;
    }

    componentsControls.classList.remove('hidden');
    
    componentsList.innerHTML = itemsToRender.map(item => {
      const originalItem = originalComponents.find(c => String(c.id) === String(item.id));
      const hasChanges = originalItem && JSON.stringify(originalItem) !== JSON.stringify(item);
      const highlightClass = hasChanges ? 'changed' : '';
      
      return `
      <div class="component-item ${highlightClass}" data-id="${item.id}">
        <div class="edit-row">
          <div>
            <span class="cell-label">Наименование</span>
            <input type="text" class="edit-input" data-field="name" value="${escapeHtml(item.name)}">
          </div>
          <div>
            <span class="cell-label">Категория</span>
            <input type="text" class="edit-input" data-field="category" value="${escapeHtml(item.category)}">
          </div>
          <div>
            <span class="cell-label">Кол-во</span>
            <input type="number" class="edit-input number" data-field="qty" value="${item.qty}">
          </div>
          <div>
            <span class="cell-label">Цена (₽)</span>
            <input type="number" class="edit-input number" data-field="price" value="${item.price}">
          </div>
          <div>
            <span class="cell-label">Состояние</span>
            <input type="text" class="edit-input" data-field="condition" value="${escapeHtml(item.condition)}">
          </div>
        </div>
        <div>
          <span class="cell-label">Описание</span>
          <textarea class="edit-textarea" data-field="description">${escapeHtml(item.description)}</textarea>
        </div>
      </div>
    `}).join('');

    const inputs = componentsList.querySelectorAll('.edit-input, .edit-textarea');
    inputs.forEach(input => {
      input.addEventListener('input', handleComponentEdit);
      input.addEventListener('change', handleComponentEdit);
    });
  }

  function handleComponentEdit(e) {
    const input = e.target;
    const itemElement = input.closest('.component-item');
    const itemId = itemElement.dataset.id;
    const field = input.dataset.field;
    let value = input.value;

    if (field === 'qty' || field === 'price') value = parseInt(value) || 0;

    const itemIndex = currentComponents.findIndex(c => String(c.id) === String(itemId));
    if (itemIndex !== -1) {
      currentComponents[itemIndex][field] = value;
    }
    itemElement.classList.add('changed');
    checkForChanges();
  }

  function checkForChanges() {
    const hasChanges = JSON.stringify(originalComponents) !== JSON.stringify(currentComponents);
    if (saveComponentsBtn) saveComponentsBtn.disabled = !hasChanges;
  }

  async function loadUserComponents() {
    if (!componentsList) return;
    componentsList.innerHTML = '<div class="empty-message">Загрузка...</div>';
    if (componentSearch) componentSearch.value = '';
    searchQuery = '';
    if (saveStatus) { saveStatus.className = 'status'; saveStatus.textContent = ''; }
    if (saveComponentsBtn) saveComponentsBtn.disabled = true;
    
    try {
      const res = await apiFetch(`/api/volgodonsk/components/user/${user.id}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      originalComponents = JSON.parse(JSON.stringify(result.items));
      currentComponents = JSON.parse(JSON.stringify(result.items));
      if (componentsCount) componentsCount.textContent = result.count;
      
      renderComponentsList(currentComponents);
    } catch (err) {
      componentsList.innerHTML = `<div class="empty-message" style="color:#ff5252;">❌ Ошибка загрузки: ${err.message}</div>`;
    }
  }

  if (componentSearch) {
    componentSearch.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      if (!searchQuery) { renderComponentsList(currentComponents); return; }
      const filtered = currentComponents.filter(item => item.name.toLowerCase().includes(searchQuery));
      renderComponentsList(filtered);
    });
  }

  if (saveComponentsBtn) {
    saveComponentsBtn.addEventListener('click', async () => {
      saveComponentsBtn.disabled = true;
      saveComponentsBtn.textContent = '⏳ Сохранение...';
      if (saveStatus) { saveStatus.className = 'status'; saveStatus.textContent = 'Отправка данных на сервер...'; }

      try {
        const res = await apiFetch('/api/volgodonsk/components/update', {
          method: 'PUT',
          body: JSON.stringify({ items: currentComponents })
        });
        const result = await res.json();

        if (result.success) {
          if (saveStatus) { saveStatus.className = 'status success'; saveStatus.textContent = '✅ ' + result.message; }
          originalComponents = JSON.parse(JSON.stringify(currentComponents));
          saveComponentsBtn.disabled = true;
          const changedItems = componentsList.querySelectorAll('.component-item.changed');
          changedItems.forEach(item => item.classList.remove('changed'));
          
          if (searchQuery) {
            renderComponentsList(currentComponents.filter(item => item.name.toLowerCase().includes(searchQuery)));
          } else {
            renderComponentsList(currentComponents);
          }
        } else {
          if (saveStatus) { saveStatus.className = 'status error'; saveStatus.textContent = '❌ ' + result.error; }
          saveComponentsBtn.disabled = false;
        }
      } catch (err) {
        if (saveStatus) { saveStatus.className = 'status error'; saveStatus.textContent = '❌ Ошибка сети: ' + err.message; }
        saveComponentsBtn.disabled = false;
      } finally {
        saveComponentsBtn.textContent = '💾 Сохранить изменения';
      }
    });
  }

  if (viewComponentsBtn && componentsListBlock) {
    viewComponentsBtn.addEventListener('click', async () => {
      componentsListBlock.classList.remove('hidden');
      await loadUserComponents();
    });
  }

  if (closeComponentsBtn && componentsListBlock) {
    closeComponentsBtn.addEventListener('click', () => {
      componentsListBlock.classList.add('hidden');
    });
  }

  // 8. Удаление аккаунта
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  const deleteModal = document.getElementById('deleteModal');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const deletePassword = document.getElementById('deletePassword');
  const deleteStatus = document.getElementById('deleteStatus');

  if (deleteAccountBtn && deleteModal) {
    deleteAccountBtn.addEventListener('click', () => deleteModal.classList.remove('hidden'));
  }

  if (cancelDeleteBtn && deleteModal) {
    cancelDeleteBtn.addEventListener('click', () => {
      deleteModal.classList.add('hidden');
      deletePassword.value = '';
      if (deleteStatus) deleteStatus.textContent = '';
    });
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      const password = deletePassword.value;
      if (!password) {
        if (deleteStatus) { deleteStatus.className = 'status error'; deleteStatus.textContent = '❌ Введите пароль'; }
        return;
      }

      confirmDeleteBtn.disabled = true;
      confirmDeleteBtn.textContent = '⏳ Удаление...';
      if (deleteStatus) { deleteStatus.className = 'status'; deleteStatus.textContent = ''; }

      try {
        const res = await apiFetch('/api/volgodonsk/user/delete', {
          method: 'POST',
          body: JSON.stringify({ password })
        });
        const result = await res.json();

        if (result.success) {
          localStorage.removeItem('volg_user');
          localStorage.removeItem('volg_token');
          alert('✅ ' + result.message);
          window.location.href = '/volgodonsk/';
        } else {
          if (deleteStatus) { deleteStatus.className = 'status error'; deleteStatus.textContent = '❌ ' + result.error; }
          confirmDeleteBtn.disabled = false;
          confirmDeleteBtn.textContent = 'Да, удалить';
        }
      } catch (err) {
        if (deleteStatus) { deleteStatus.className = 'status error'; deleteStatus.textContent = '❌ Ошибка сети: ' + err.message; }
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = 'Да, удалить';
      }
    });
  }
});