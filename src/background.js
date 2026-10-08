// background.js
// Moodleからファイルを取得し、選ばれたローカルフォルダへ書き込みます。

import { sanitizeName, savedKey, rankFolders } from './lib/names.js';
import { fetchMoodleFile, parseFilenameFromDisposition, filenameFromUrl } from './lib/moodle.js';
import { exists, existsAtPath, uniqueName, writeFile } from './lib/fs.js';
import { ensureSiteScripts } from './lib/sites.js';
import { t } from './lib/i18n.js';
import {
  getRootHandle,
  permissionOf,
  getCourseDirs,
  setCourseDir,
  getSettings,
  bumpRecent,
  getRecent,
  markSaved,
  lookupSaved,
  forgetSaved,
} from './lib/store.js';

const GRANT_PAGE = 'src/grant/grant.html';
const OPTIONS_PAGE = 'src/options/options.html';
const WELCOME_PAGE = 'src/welcome/welcome.html';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) });
  // 更新・再読み込みのあとも、登録済みサイトで確実に動くようにスクリプトを登録し直す
  ensureSiteScripts({ force: true }).catch((e) => console.warn('[Moodrop]', e));
});
chrome.runtime.onStartup.addListener(() => {
  ensureSiteScripts().catch((e) => console.warn('[Moodrop]', e));
});
// service worker が起動するたびに、登録が消えていないか確認する
ensureSiteScripts().catch((e) => console.warn('[Moodrop]', e));

/* ---------- 保存先フォルダ ---------- */

async function walk(root, path, create) {
  let dir = root;
  for (const seg of path) dir = await dir.getDirectoryHandle(seg, { create });
  return dir;
}

async function listDirs(dir) {
  const names = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory' && !name.startsWith('.')) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

// 科目に対応する保存先（ルートからのパス）を決める。
// 未登録で自動作成もオフなら null を返し、ユーザーに選んでもらう。
async function resolveCoursePath({ courseKey, courseName, dirPath }) {
  if (dirPath) {
    const path = dirPath.map((s) => sanitizeName(s, t('fallbackFolder'))).slice(0, 8);
    await setCourseDir(courseKey, path, courseName);
    return path;
  }
  const entry = (await getCourseDirs())[courseKey];
  if (entry && entry.path.length) return entry.path;
  if ((await getSettings()).autoCreate) {
    const path = [sanitizeName(courseName, t('fallbackCourse'))];
    await setCourseDir(courseKey, path, courseName);
    return path;
  }
  return null;
}

/* ---------- 保存 ---------- */

async function saveFile({ fileUrl, suggestedName, courseKey, courseName, onDuplicate, dirPath }) {
  const root = await getRootHandle();
  if (!root) return { status: 'needs_setup' };
  if ((await permissionOf(root)) !== 'granted') return { status: 'needs_permission', rootName: root.name };

  const path = await resolveCoursePath({ courseKey, courseName, dirPath });
  if (!path) {
    let existing = [];
    try {
      existing = await listDirs(root);
    } catch { /* 一覧が取れなくても新規作成はできる */ }
    return {
      status: 'needs_folder',
      suggested: sanitizeName(courseName, t('fallbackCourse')),
      matches: rankFolders(existing, courseName).slice(0, 5),
      rootName: root.name,
    };
  }

  let dir;
  try {
    dir = await walk(root, path, true);
  } catch (e) {
    if (e.name === 'NotFoundError') {
      return { status: 'needs_setup', message: t('errFolderMissing') };
    }
    throw e;
  }

  const res = await fetchMoodleFile(fileUrl);
  // ファイル名は Content-Disposition → 最終URLの末尾 → リンクの文言 の順で決める
  let filename = sanitizeName(
    parseFilenameFromDisposition(
      res.headers.get('Content-Disposition'),
      filenameFromUrl(res.url) || suggestedName
    )
  );

  if (await exists(dir, filename)) {
    if (!onDuplicate) {
      await res.body?.cancel().catch(() => {});
      return { status: 'duplicate', filename };
    }
    if (onDuplicate === 'rename') filename = await uniqueName(dir, filename);
  }

  await writeFile(dir, filename, res.body);

  const shown = [...path, filename].join('/');
  await bumpRecent({ name: filename, path: shown, courseName: courseName || '', at: Date.now() });
  await markSaved(savedKey(fileUrl), { name: filename, path: shown });
  return { status: 'ok', file: { name: filename, path: shown } };
}

/* ---------- フォルダへのアクセス許可 ---------- */

// 許可の再確認はユーザー操作が要るので、小さなウィンドウを開いて結果を待つ。
function requestGrant() {
  return new Promise((resolve) => {
    let winId = null;
    const finish = (granted) => {
      chrome.runtime.onMessage.removeListener(onMsg);
      chrome.windows.onRemoved.removeListener(onRemoved);
      resolve(granted);
    };
    const onMsg = (m) => {
      if (m && m.type === 'GRANT_RESULT') finish(Boolean(m.granted));
    };
    const onRemoved = (id) => {
      if (id === winId) finish(false);
    };
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.windows.onRemoved.addListener(onRemoved);
    chrome.windows
      .create({ url: chrome.runtime.getURL(GRANT_PAGE), type: 'popup', width: 440, height: 320 })
      .then((w) => { winId = w.id; })
      .catch(() => finish(false));
  });
}

/* ---------- メッセージ処理 ---------- */

// 保存を頼めるのは、そのMoodle自身のページからだけ（別オリジンのURLは取りに行かない）
function assertSameOrigin(fileUrl, sender) {
  const from = sender && sender.url && new URL(sender.url).origin;
  if (!from || new URL(fileUrl).origin !== from) throw new Error(t('errOtherOrigin'));
}

const handlers = {
  async SAVE_FILE(msg, sender) {
    assertSameOrigin(msg.fileUrl, sender);
    try {
      return await saveFile(msg);
    } catch (e) {
      if (e && e.name === 'NotAllowedError') return { status: 'needs_permission' };
      throw e;
    }
  },

  async LIST_DIRS({ path }) {
    const root = await getRootHandle();
    if (!root || (await permissionOf(root)) !== 'granted') return { status: 'error', message: t('errNoAccess') };
    const dir = await walk(root, (path || []).slice(0, 8), false);
    return { status: 'ok', dirs: await listDirs(dir) };
  },

  async REQUEST_GRANT() {
    return (await requestGrant()) ? { status: 'ok' } : { status: 'cancelled' };
  },

  async OPEN_OPTIONS() {
    await chrome.tabs.create({ url: chrome.runtime.getURL(OPTIONS_PAGE) });
    return { status: 'ok' };
  },

  async GET_RECENT() {
    return { recent: await getRecent() };
  },

  async CHECK_SAVED({ urls }) {
    const keys = Object.fromEntries((urls || []).map((u) => [u, savedKey(u)]));
    const saved = await lookupSaved(keys);

    // 手元で消された（動かされた）ファイルは、保存済みから外す（確認できるのはアクセス許可があるときだけ）
    const root = await getRootHandle();
    if (root && (await permissionOf(root)) === 'granted') {
      const gone = [];
      await Promise.all(
        Object.entries(saved).map(async ([url, info]) => {
          try {
            if (info.path && !(await existsAtPath(root, info.path.split('/')))) {
              gone.push(keys[url]);
              delete saved[url];
            }
          } catch { /* 確認できなければ、保存済みのままにしておく */ }
        })
      );
      if (gone.length) await forgetSaved(gone);
    }
    return { status: 'ok', saved };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg && handlers[msg.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(sendResponse)
    .catch((e) => sendResponse({ status: 'error', message: (e && e.message) || String(e) }));
  return true; // 非同期で sendResponse を使うために必須
});
