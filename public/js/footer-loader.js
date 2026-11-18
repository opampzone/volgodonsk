// Автоматическая загрузка футера в конец body
document.addEventListener('DOMContentLoaded', function() {
  fetch('/volgodonsk/includes/footer.html')
    .then(response => {
      if (!response.ok) throw new Error('Не удалось загрузить футер');
      return response.text();
    })
    .then(html => {
      document.body.insertAdjacentHTML('beforeend', html);
    })
    .catch(err => {
      console.warn('⚠️ Футер не загружен:', err.message);
    });
});
