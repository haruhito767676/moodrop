// 利用するMoodleサイトの登録（権限の取得とコンテンツスクリプトの動的登録）

const SCRIPT = 'src/content/content.js';
const STYLE = 'src/content/content.css';

export function originOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}

const scriptId = (origin) => `site-${origin.replace(/[^a-z0-9]/gi, '_')}`;

export async function getSites() {
  const { sites = [] } = await chrome.storage.local.get('sites');
  return sites;
}

// ユーザー操作（クリック）の中から直接呼ぶこと（permissions.request の要件）
export async function enableSite(origin, tabId) {
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return false;

  const id = scriptId(origin);
  await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [`${origin}/*`],
      js: [SCRIPT],
      css: [STYLE],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);

  const sites = await getSites();
  if (!sites.includes(origin)) {
    await chrome.storage.local.set({ sites: [...sites, origin] });
  }

  // 開いているタブにはすぐ反映する
  if (tabId != null) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: [STYLE] });
      await chrome.scripting.executeScript({ target: { tabId }, files: [SCRIPT] });
    } catch { /* タブが閉じられた等。次回の読み込みから有効になる */ }
  }
  return true;
}

export async function disableSite(origin) {
  await chrome.scripting.unregisterContentScripts({ ids: [scriptId(origin)] }).catch(() => {});
  await chrome.permissions.remove({ origins: [`${origin}/*`] }).catch(() => {});
  const sites = await getSites();
  await chrome.storage.local.set({ sites: sites.filter((s) => s !== origin) });
}

// 開いているページが Moodle かどうか（activeTab 権限の範囲で調べる）
export async function looksLikeMoodle(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => Boolean(window.M && window.M.cfg),
    });
    return Boolean(res && res.result);
  } catch {
    return false;
  }
}
