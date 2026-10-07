// ファイル名・フォルダ名まわりの純粋関数（ブラウザ／Node どちらでも動く）

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_BYTES = 200; // 多くのファイルシステムは 255 バイトまで。余裕を見て短めに。

const encoder = new TextEncoder();
const byteLength = (s) => encoder.encode(s).length;

export function splitExt(name) {
  const i = name.lastIndexOf('.');
  if (i <= 0 || name.length - i > 12) return [name, ''];
  return [name.slice(0, i), name.slice(i)];
}

// UTF-8 のバイト数で切り詰める（日本語は 1 文字 3 バイトなので文字数では足りない）。拡張子は残す。
function truncateBytes(name, max) {
  if (byteLength(name) <= max) return name;
  const [base, ext] = splitExt(name);
  let out = '';
  for (const ch of base) {
    if (byteLength(out + ch + ext) > max) break;
    out += ch;
  }
  return out + ext;
}

// macOS / Windows / Linux のどれでも作れる名前にする
export function sanitizeName(name, fallback = 'file') {
  let s = String(name ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '_') // 先頭ドット（隠しファイル／ ".." ）を避ける
    .replace(/[. ]+$/, ''); // Windows は末尾のドット・空白を許さない
  if (!s) return fallback;
  if (WIN_RESERVED.test(s)) s = `_${s}`;
  return truncateBytes(s, MAX_BYTES);
}

// "資料.pdf" → "資料 (2).pdf"
export function numberedName(name, n) {
  const [base, ext] = splitExt(name);
  return `${base} (${n})${ext}`;
}

// 同じ資料へのリンクでも forcedownload / redirect などの付随パラメータで
// URL が揺れるので、それらを落として突き合わせ用のキーにする。
export function savedKey(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    ['forcedownload', 'redirect', 'preview', 'time'].forEach((p) => u.searchParams.delete(p));
    return u.href;
  } catch {
    return String(url || '');
  }
}

// 科目名から検索に使えそうな語を抜き出す（「2026」「前期」「火3」などの共通語は除外）
export function nameTokens(name) {
  return (String(name).match(/[A-Za-z0-9぀-ヿ㐀-鿿豈-﫿]{2,}/g) || [])
    .filter((t) => !/^(19\d{2}|20\d{2}|令和|平成|前期|後期|通年|集中|補講|月|火|水|木|金|土|日|限|曜日?|クラス|組)$/.test(t))
    .sort((a, b) => b.length - a.length);
}

// 既存フォルダ名のうち、科目名に近いものを近い順に返す（0件のこともある）
export function rankFolders(names, courseName) {
  const q = sanitizeName(courseName, '');
  if (!q) return [];
  const tokens = nameTokens(courseName).slice(0, 3);
  const score = (n) => {
    if (n === q) return 5;
    if (n.startsWith(q) || q.startsWith(n)) return 4;
    if (n.includes(q)) return 3;
    if (n.length >= 2 && q.includes(n)) return 2;
    return tokens.some((t) => t.length >= 3 && n.includes(t)) ? 1 : 0;
  };
  return names
    .map((n) => [n, score(n)])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n]) => n);
}
