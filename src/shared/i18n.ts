export function t(key: string, fallback: string, substitutions?: string | string[]): string {
  const value = chrome.i18n.getMessage(key, substitutions);
  return value || fallback;
}

export function applyExtensionLocale(root: ParentNode = document): void {
  const language = chrome.i18n.getUILanguage();
  document.documentElement.lang = language;
  document.documentElement.dir = /^(ar|fa|he|ur)(-|$)/i.test(language) ? 'rtl' : 'ltr';

  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n;
    if (!key) continue;
    const value = chrome.i18n.getMessage(key);
    if (value) element.textContent = value;
  }
}
