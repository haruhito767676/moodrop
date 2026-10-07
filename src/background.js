// background.js
// Moodleからファイルを取得し、選ばれたローカルフォルダへ書き込みます。

import { sanitizeName, savedKey } from './lib/names.js';
import { fetchMoodleFile, parseFilenameFromDisposition } from './lib/moodle.js';
import { exists, uniqueName, writeFile } from './lib/fs.js';
import {
  getRootHandle,
  permissionOf,
  courseDirName,
  bumpRecent,
  getRecent,
  markSaved,
  lookupSaved,
} from './lib/store.js';

const GRANT_PAGE = 'src/grant/grant.html';
const OPTIONS_PAGE = 'src/options/options.html';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL(`${OPTIONS_PAGE}?welcome`) });
});

/* ---------- 保存 ---------- */

async function saveFile({ fileUrl, suggestedName, courseKey, courseName, onDuplicate }) {
  const root = await getRootHandle();
  if (!root) return { status: 'needs_setup' };
  if ((await permissionOf(root)) !== 'granted') return { status: 'needs_permission' };

  const dirName = await courseDirName(courseKey, courseName, sanitizeName);
  let dir;
  try {
    dir = await root.getDirectoryHandle(dirName, { create: true });
  } catch (e) {
    if (e.name === 'NotFoundError') {
      return { status: 'needs_setup', message: '保存先フォルダが見つかりません。設定で選び直してください' };
    }
    throw e;
  }

  const res = await fetchMoodleFile(fileUrl);
  let filename = sanitizeName(
    parseFilenameFromDisposition(res.headers.get('Content-Disposition'), suggestedName)
  );

  if (await exists(dir, filename)) {
    if (!onDuplicate) {
      await res.body?.cancel().catch(() => {});
      return { status: 'duplicate', filename };
    }
    if (onDuplicate === 'rename') filename = await uniqueName(dir, filename);
  }

  await writeFile(dir, filename, res.body);

  const path = `${dirName}/${filename}`;
  await bumpRecent({ name: filename, path, courseName: courseName || '', at: Date.now() });
  await markSaved(savedKey(fileUrl), { name: filename, path });
  return { status: 'ok', file: { name: filename, path } };
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

const handlers = {
  async SAVE_FILE(msg) {
    try {
      return await saveFile(msg);
    } catch (e) {
      if (e && e.name === 'NotAllowedError') return { status: 'needs_permission' };
      throw e;
    }
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
    return { status: 'ok', saved: await lookupSaved(keys) };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = msg && handlers[msg.type];
  if (!handler) return false;
  handler(msg)
    .then(sendResponse)
    .catch((e) => sendResponse({ status: 'error', message: (e && e.message) || String(e) }));
  return true; // 非同期で sendResponse を使うために必須
});
