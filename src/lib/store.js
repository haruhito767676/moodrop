// 保存先フォルダのハンドル（IndexedDB）と、設定類（chrome.storage）

const DB_NAME = 'moodrop';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const getRootHandle = () => idb('readonly', (s) => s.get('root'));

export async function setRootHandle(handle) {
  await idb('readwrite', (s) => s.put(handle, 'root'));
  await chrome.storage.local.set({ rootName: handle.name });
}

export const permissionOf = (handle) => handle.queryPermission({ mode: 'readwrite' });

/* ---------- 科目 → フォルダ名 ---------- */

// 科目名はMoodle側で変わる（年度の付け替えなど）ことがあるので、
// 最初に使った名前を科目IDに紐づけて固定する。
export async function courseDirName(courseKey, courseName, sanitize) {
  const { courseDirs = {} } = await chrome.storage.local.get('courseDirs');
  if (courseDirs[courseKey]) return courseDirs[courseKey];
  const name = sanitize(courseName, '無題の科目');
  courseDirs[courseKey] = name;
  await chrome.storage.local.set({ courseDirs });
  return name;
}

/* ---------- 保存履歴 ---------- */

export async function bumpRecent(entry) {
  const { recentSaves = [] } = await chrome.storage.local.get('recentSaves');
  recentSaves.unshift(entry);
  await chrome.storage.local.set({ recentSaves: recentSaves.slice(0, 20) });
}

export async function getRecent() {
  const { recentSaves = [] } = await chrome.storage.local.get('recentSaves');
  return recentSaves;
}

/* ---------- 保存済みマーク ---------- */

const SAVED_LIMIT = 1000;

export async function markSaved(key, info) {
  const { savedFiles = {} } = await chrome.storage.local.get('savedFiles');
  savedFiles[key] = { ...info, at: Date.now() };
  const entries = Object.entries(savedFiles);
  const keep =
    entries.length > SAVED_LIMIT
      ? Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, SAVED_LIMIT))
      : savedFiles;
  await chrome.storage.local.set({ savedFiles: keep });
}

export async function lookupSaved(keysByUrl) {
  const { savedFiles = {} } = await chrome.storage.local.get('savedFiles');
  const out = {};
  for (const [url, key] of Object.entries(keysByUrl)) {
    if (savedFiles[key]) out[url] = savedFiles[key];
  }
  return out;
}
