// 利用するMoodleサイトの登録（権限の取得とコンテンツスクリプトの動的登録）

const SCRIPTS = ['src/content/styles.js', 'src/content/ui.js', 'src/content/content.js'];
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

async function registerSite(origin) {
  const id = scriptId(origin);
  await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => {});
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [`${origin}/*`],
      js: SCRIPTS,
      css: [STYLE],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}

// すでに開いているタブにも、再読み込みなしで反映する
async function injectIntoOpenTabs(origin) {
  const tabs = await chrome.tabs.query({ url: `${origin}/*` }).catch(() => []);
  for (const tab of tabs) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: [STYLE] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: SCRIPTS });
    } catch { /* 読み込み中・閉じられた等。次回の読み込みから有効になる */ }
  }
}

// ユーザー操作（クリック）の中から直接呼ぶこと（permissions.request の要件）
export async function enableSite(origin, tabId) {
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) return false;

  await registerSite(origin);
  const sites = await getSites();
  if (!sites.includes(origin)) {
    await chrome.storage.local.set({ sites: [...sites, origin] });
  }

  // 開いているタブにはすぐ反映する
  if (tabId != null) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: [STYLE] });
      await chrome.scripting.executeScript({ target: { tabId }, files: SCRIPTS });
    } catch { /* タブが閉じられた等。次回の読み込みから有効になる */ }
  }
  return true;
}

// 登録済みサイトのスクリプトが、拡張機能の更新・再読み込みなどで消えたり古くなったりしていないか確認して直す。
// force のときは、必ず最新のファイル構成で登録し直し、開いているタブにも反映する。
export async function ensureSiteScripts({ force = false } = {}) {
  const sites = await getSites();
  const kept = [];
  for (const origin of sites) {
    if (!(await chrome.permissions.contains({ origins: [`${origin}/*`] }))) continue; // 権限が外れたサイトは外す
    kept.push(origin);
    const existing = await chrome.scripting
      .getRegisteredContentScripts({ ids: [scriptId(origin)] })
      .catch(() => []);
    if (existing.length && !force) continue;
    await registerSite(origin);
    if (force) await injectIntoOpenTabs(origin);
  }
  if (kept.length !== sites.length) await chrome.storage.local.set({ sites: kept });
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
