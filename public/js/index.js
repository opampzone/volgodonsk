// Регистрация Service Worker для PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/volgodonsk/sw.js')
    .then(reg => console.log('✅ SW зарегистрирован'))
    .catch(err => console.log('⚠️ SW ошибка:', err));
}

let allRepairmen = [];

async function loadRepairmen() {
  try {
    const res = await fetch('/api/volgodonsk/repairmen');
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    allRepairmen = data.repairmen || [];
    renderRepairmen(allRepairmen);
  } catch (e) {
    document.getElementById('repairmenList').innerHTML =
      '<div class="empty-state">❌ Ошибка загрузки. Попробуйте позже.</div>';
  }
}

function renderRepairmen(list) {
  const container = document.getElementById('repairmenList');

  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state">Пока нет зарегистрированных мастеров</div>';
    return;
  }

  container.innerHTML = list.map(r => {
    const typeLabel = r.repairman_type === 'service_center' ? '🏢 Сервис-центр' : '👤 Частник';
    const location = r.location || '—';
    const resume = r.resume || 'Резюме не указано';

    // Специализации как теги
    const specs = (r.specializations || []).map(s => `<span class="spec-tag">${escapeHtml(s)}</span>`).join('');

    return `
      <div class="repairman-card" data-id="${r.id}">
        <div class="card-header">
          <div class="card-name">${escapeHtml(r.full_name)}</div>
          <div class="card-type">${typeLabel}</div>
        </div>
        ${specs ? `<div class="card-specs">${specs}</div>` : ''}
        <div class="card-location">📍 ${escapeHtml(location)}</div>
        <div class="card-resume">${escapeHtml(resume)}</div>
        <button class="show-contact-btn" onclick="toggleContact(this, '${r.id}')">
          📞 Показать контакт
        </button>
        <div class="contact-wrapper" id="contact-${r.id}">
          <div class="loading" style="padding:20px;">Загрузка контакта...</div>
        </div>
      </div>
    `;
  }).join('');
}

async function toggleContact(btn, id) {
  const wrapper = document.getElementById(`contact-${id}`);

  if (wrapper.classList.contains('show')) {
    wrapper.classList.remove('show');
    btn.textContent = '📞 Показать контакт';
    return;
  }

  if (wrapper.querySelector('.qr-contact')) {
    wrapper.classList.add('show');
    btn.textContent = '🔒 Скрыть контакт';
    return;
  }

  try {
    const res = await fetch(`/api/volgodonsk/repairman/${id}`);
    const data = await res.json();

    if (!data.success) throw new Error('Не удалось загрузить контакт');

    const r = data.repairman;
    const phone = r.phone || '';

    if (!phone) {
      wrapper.innerHTML = '<div style="color:#888;">Телефон не указан</div>';
    } else {
      const digits = phone.replace(/\D/g, '');
      const telLink = 'tel:+' + (digits.startsWith('8') ? '7' + digits.slice(1) : digits);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(telLink)}`;
      const formattedPhone = formatPhone(digits);

      wrapper.innerHTML = `
        <div class="qr-contact">
          <a href="${telLink}">
            <img src="${qrUrl}" alt="QR" class="qr-image" loading="lazy">
          </a>
          <div class="qr-label">Сканируйте или нажмите на QR</div>
          <a href="${telLink}" class="call-btn">📞 Позвонить</a>
          <div class="phone-display">
            <span class="phone-number">${formattedPhone}</span>
            <button class="copy-btn" onclick="copyPhone(this, '${digits}')">Копировать</button>
          </div>
        </div>
      `;
    }

    wrapper.classList.add('show');
    btn.textContent = '🔒 Скрыть контакт';
  } catch (e) {
    wrapper.innerHTML = '<div style="color:#ff5252;">Ошибка загрузки контакта</div>';
  }
}

function formatPhone(digits) {
  if (digits.length === 11) {
    return '+7 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7, 9) + '-' + digits.slice(9, 11);
  }
  return digits;
}

function copyPhone(btn, phone) {
  navigator.clipboard.writeText(phone).then(() => {
    btn.textContent = '✓ Скопировано';
    setTimeout(() => { btn.textContent = 'Копировать'; }, 2000);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Применение фильтров
function applyFilters() {
  const typeFilter = document.querySelector('input[name="filterType"]:checked').value;
  const specCheckboxes = document.querySelectorAll('.filter-spec:checked');
  const selectedSpecs = Array.from(specCheckboxes).map(cb => cb.value);

  const filtered = allRepairmen.filter(r => {
    if (typeFilter !== 'all' && r.repairman_type !== typeFilter) return false;

    if (selectedSpecs.length > 0) {
      const userSpecs = r.specializations || [];
      const hasMatch = selectedSpecs.some(spec => userSpecs.includes(spec));
      if (!hasMatch) return false;
    }

    return true;
  });

  renderRepairmen(filtered);
}

document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);

loadRepairmen();