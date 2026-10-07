// Moodle からのファイル取得まわり

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

export async function fetchMoodleFile(fileUrl) {
  let res = await fetch(fileUrl, { credentials: 'include', redirect: 'follow' });
  if (!res.ok) throw new Error(`Moodleからのファイル取得に失敗しました (${res.status})`);

  const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    const html = await res.text();
    const real = extractRealFileLink(html, res.url || fileUrl);
    if (!real || real === fileUrl) {
      throw new Error('資料の実ファイルURLを特定できませんでした（Moodleのテーマ差の可能性があります）');
    }
    res = await fetch(real, { credentials: 'include', redirect: 'follow' });
    if (!res.ok) throw new Error(`Moodleからのファイル取得に失敗しました (${res.status})`);
  }
  return res;
}
