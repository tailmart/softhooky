export const LANGUAGES = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: '英语' },
  { value: 'ru', label: '俄语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'th', label: '泰语' },
  { value: 'ms', label: '马来语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'es', label: '西班牙语' },
];

const STORAGE_KEY = 'preferred_language';

export function getSavedLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some(l => l.value === saved)) return saved;
  } catch {}
  return 'zh';
}

export function saveLanguage(lang: string) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}
