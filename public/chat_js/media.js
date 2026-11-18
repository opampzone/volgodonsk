import { CONFIG } from './config.js';

export function handleImageSelect(file, previewCallback) {
    if (!file) return null;

    if (file.size > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
        alert(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум ${CONFIG.MAX_FILE_SIZE_MB} МБ. Сожмите изображение или выберите другое.`);
        return null;
    }

    if (!file.type.startsWith('image/')) {
        alert('Можно загружать только изображения');
        return null;
    }

    // Показываем превью
    const reader = new FileReader();
    reader.onload = (e) => previewCallback(e.target.result);
    reader.readAsDataURL(file);

    return file;
}

export function clearImagePreview() {
    const preview = document.getElementById('image-preview');
    preview.innerHTML = '';
    preview.classList.add('hidden');
    document.getElementById('image-input').value = '';
}