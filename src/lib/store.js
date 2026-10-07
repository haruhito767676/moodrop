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

/* ---------- 設定 ---------- */

const DEFAULT_SETTINGS = { autoCreate: false };

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function setSettings(patch) {
  await chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}

/* ---------- 科目 → 保存先フォルダ ---------- */

// 保存先ルートからのフォルダ名の配列で持つ（ハンドルは持たないので、許可はルートの1回で済む）。
// 形式: { [courseKey]: { path: string[], courseName, at } }
export async function getCourseDirs() {
  const { courseDirs = {} } = await chrome.storage.local.get('courseDirs');
  // 旧形式（フォルダ名の文字列）を読み替える
  for (const [k, v] of Object.entries(courseDirs)) {
    if (typeof v === 'string') courseDirs[k] = { path: [v], courseName: '', at: 0 };
  }
  return courseDirs;
}

export async function setCourseDir(courseKey, path, courseName) {
  const courseDirs = await getCourseDirs();
  courseDirs[courseKey] = { path, courseName: courseName || '', at: Date.now() };
  await chrome.storage.local.set({ courseDirs });
}

export async function forgetCourseDir(courseKey) {
  const courseDirs = await getCourseDirs();
  delete courseDirs[courseKey];
  await chrome.storage.local.set({ courseDirs });
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
