// Moodle からのファイル取得まわり

import { t } from './i18n.js';

// HTTPヘッダーは latin1 として解釈されるため、サーバーが filename="..." に
// UTF-8 のバイト列を素で入れてくると文字化けする。latin1 → UTF-8 で読み直す。
export function fixHeaderMojibake(s) {
  if (!s || !/[\u0080-ÿ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

export function parseFilenameFromDisposition(disposition, fallback) {
  if (!disposition) return fallback;

  // RFC 5987: filename*=UTF-8''%xx%xx（こちらが優先）
  const star = disposition.match(/filename\*\s*=\s*([^;]+)/i);
  if (star) {
    const m = star[1].trim().replace(/^"|"$/g, '').match(/^([\w-]+)'[^']*'(.*)$/);
    if (m) {
      try {
        const decoded = decodeURIComponent(m[2]);
        return /utf-?8/i.test(m[1]) ? decoded : fixHeaderMojibake(decoded);
      } catch { /* fall through */ }
    }
  }

  const plain = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (plain) return fixHeaderMojibake(plain[1].trim());

  return fallback;
}

// resource モジュールの中間ページ（「続ける」ページやプレビュー埋め込み）から
// 実ファイルのURLを拾う。
export function extractRealFileLink(html, baseUrl) {
  const re = /(?:href|src)\s*=\s*"([^"]*(?:pluginfile\.php|forcedownload=1|redirect=1)[^"]*)"/gi;
  let m;
  let candidate = null;
  while ((m = re.exec(html))) {
    const raw = m[1].replace(/&amp;/g, '&');
    try {
      const abs = new URL(raw, baseUrl).href;
      candidate = abs;
      if (/pluginfile\.php/.test(abs)) return abs;
    } catch { /* noop */ }
  }
  return candidate;
}

// 最終的なURLの末尾（pluginfile.php/.../講義資料.pdf）にファイル名があれば取り出す。
// Content-Disposition がないときの、リンクの文言（拡張子がない）よりも確かな手がかり。
export function filenameFromUrl(url) {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    const name = decodeURIComponent(last);
    return /\.[A-Za-z0-9]{1,8}$/.test(name) && !/\.php$/i.test(name) ? name : '';
  } catch {
    return '';
  }
}

// 応答（ヘッダー）が来るまでだけ待つ。本文のダウンロードには時間制限をかけない。
async function fetchWithHeaderTimeout(url, ms = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { credentials: 'include', redirect: 'follow', signal: controller.signal });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(t('errTimeout'));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMoodleFile(fileUrl) {
  let res = await fetchWithHeaderTimeout(fileUrl);
  if (!res.ok) throw new Error(t('errFetchFailed', res.status));

  const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    const html = await res.text();
    const real = extractRealFileLink(html, res.url || fileUrl);
    if (!real || real === fileUrl) {
      throw new Error(t('errNoRealUrl'));
    }
    res = await fetchWithHeaderTimeout(real);
    if (!res.ok) throw new Error(t('errFetchFailed', res.status));
  }
  return res;
}
