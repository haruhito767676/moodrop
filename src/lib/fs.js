// ローカルフォルダ（File System Access API）への書き込み

import { numberedName } from './names.js';
import { t } from './i18n.js';

export async function exists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (e) {
    if (e.name === 'NotFoundError') return false;
    if (e.name === 'TypeMismatchError') return true; // 同名のフォルダがある
    throw e;
  }
}

export async function uniqueName(dir, name) {
  if (!(await exists(dir, name))) return name;
  for (let n = 2; n < 1000; n++) {
    const candidate = numberedName(name, n);
    if (!(await exists(dir, candidate))) return candidate;
  }
  throw new Error(t('errNoFreeName'));
}

// ストリームのまま書き込む（大きなファイルでもメモリに載せない）。
// 途中で失敗したら、書きかけのファイルは残さない。
export async function writeFile(dir, name, body) {
  const existed = await exists(dir, name);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    if (body) await body.pipeTo(writable);
    else await writable.close();
  } catch (e) {
    try { await writable.abort(); } catch { /* noop */ }
    if (!existed) await dir.removeEntry(name).catch(() => {});
    throw e;
  }
}

// ルートからのパス（フォルダ名…, ファイル名）にファイルがあるか。フォルダの作成はしない。
export async function existsAtPath(root, segments) {
  try {
    let dir = root;
    for (const seg of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
    await dir.getFileHandle(segments[segments.length - 1]);
    return true;
  } catch (e) {
    if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') return false;
    throw e;
  }
}
