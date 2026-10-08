// 表示文言（chrome.i18n）。Node のテストなど、拡張機能の外ではキーをそのまま返す。

export function t(key, ...subs) {
  try {
    return chrome.i18n.getMessage(key, subs.map(String)) || key;
  } catch {
    return key;
  }
}

// HTML の data-i18n="キー"（本文）/ data-i18n-placeholder / -title / -aria-label を、現在の言語の文言に置き換える
export function applyI18n(root = document) {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  root.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
  for (const attr of ['placeholder', 'title', 'aria-label']) {
    const data = `data-i18n-${attr}`;
    root.querySelectorAll(`[${data}]`).forEach((n) => n.setAttribute(attr, t(n.getAttribute(data))));
  }
}
