// 録画: 本物の拡張機能のUI（content scripts）を、Moodle風のページの上で動かして画面を収める。
//   node promo/record.mjs <scene|all> <lang|all>      scene: title / one / all / folder
// 出力: promo/out/<scene>-<lang>.mp4（1920x1080・30fps）
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'promo', 'out');
const TMP = path.join(ROOT, 'promo', '.tmp');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8777, DEBUG = 9338;
const W = 1440, H = 810, DPR = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 静的サーバー ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(f));
}).listen(PORT);

/* ---------- Chrome (CDP) ---------- */
mkdirSync(OUT, { recursive: true });
rmSync(path.join(TMP, 'profile'), { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${path.join(TMP, 'profile')}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-color-profile=srgb', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} server.close(); };
process.on('exit', cleanup);

let target;
for (let i = 0; i < 100 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(100);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map(); const listeners = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method) listeners.forEach((l) => l(m));
});
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });

/* ---------- 画面の収録 ---------- */
let rec = null;
async function startRec(dir) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const r = { dir, frames: [], on: true };
  r.l = (m) => {
    if (m.method !== 'Page.screencastFrame' || !r.on) return;
    const { data, metadata, sessionId } = m.params;
    const name = `f${String(r.frames.length).padStart(5, '0')}.jpg`;
    writeFileSync(path.join(dir, name), Buffer.from(data, 'base64'));
    r.frames.push({ name, t: metadata.timestamp });
    send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  };
  listeners.push(r.l);
  rec = r;
  await send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
}
async function stopRec(outFile) {
  await send('Page.stopScreencast');
  const r = rec; r.on = false;
  listeners.splice(listeners.indexOf(r.l), 1);
  const { dir, frames } = r;
  const list = frames.map((f, i) => `file '${f.name}'\nduration ${Math.max(0.001, (frames[i + 1] ? frames[i + 1].t - f.t : 0.2)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).name}'\n`;
  writeFileSync(path.join(dir, 'list.txt'), list);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', outFile]);
  console.log('  ', path.basename(outFile), frames.length, 'frames');
}

/* ---------- マウス ---------- */
let mx = 1000, my = 700, down = false;
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);   // minimum-jerk: 出だしも終わりもなめらか
async function put(x, y) {
  mx = x; my = y;
  await Promise.all([
    send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: down ? 'left' : 'none', buttons: down ? 1 : 0 }),
    evaluate(`stage.cursor(${x}, ${y}, ${down})`),
  ]);
}
// 時間で位置を決める（処理が遅れても、動きの速さが変わらない）
async function move(x, y, ms = 800) {
  const x0 = mx, y0 = my;
  const dist = Math.hypot(x - x0, y - y0);
  const bend = Math.min(26, dist * 0.06);                       // ごく浅い弧
  const nx = -(y - y0) / (dist || 1), ny = (x - x0) / (dist || 1);
  const t0 = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms), k = smooth(t), arc = Math.sin(k * Math.PI) * bend;
    await put(x0 + (x - x0) * k + nx * arc, y0 + (y - y0) * k + ny * arc);
    if (t >= 1) break;
  }
}
async function click() {
  down = true; await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', buttons: 1, clickCount: 1 }); await evaluate(`stage.cursor(${mx},${my},true); stage.ripple(${mx},${my})`);
  await sleep(120);
  down = false; await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', buttons: 0, clickCount: 1 }); await evaluate(`stage.cursor(${mx},${my},false)`);
}
const rect = (jsExpr) => evaluate(`JSON.stringify(stage.R(${jsExpr}))`).then(JSON.parse);
const DOC = 'stage.doc()';
const ctl = (i) => `${DOC}.querySelectorAll('moodrop-ui')[${i}]`;
const rowEl = (i) => `${DOC}.querySelectorAll('.activity-item')[${i}]`;
const bulkEl = `${DOC}.querySelector('moodrop-bulk')`;
const layer = `${DOC}.querySelector('moodrop-layer').shadowRoot`;
const center = (r, fx = 0.5) => [r.x + r.w * fx, r.y + r.h / 2];
async function moveTo(expr, ms, fx) { const r = await rect(expr); const [x, y] = center(r, fx); await move(x, y, ms); }
// ボタンの少し手前（同じ行の中）に寄せて、行にポインタが乗った状態を見せてから、ボタンの上へ
async function approach(expr, lead = 90, ms = 900) { const r = await rect(expr); const [x, y] = center(r); await move(x - lead, y + 2, ms); }

/* ---------- シーン ---------- */
const CAP = {
  en: {
    one: ['Hover. Click. Saved.'],
    all: ['Save a whole section at once.'],
    folder: ['Pick a folder once.'],
    tag: 'Moodle files, one click, any folder.',
  },
  ja: {
    one: ['ポインタを乗せて、押すだけ。'],
    all: ['セクションを、まとめて保存。'],
    folder: ['保存先は、最初に選ぶだけ。'],
    tag: 'Moodleの資料を、ワンクリックで好きなフォルダへ。',
  },
};

const scenes = {
  async title(lang) {
    await evaluate(`stage.hideWindows(true)`);
    await sleep(300);
    await evaluate(`stage.title(true, ${JSON.stringify(CAP[lang].tag)})`);
    await sleep(2600);
    await evaluate(`stage.title(false)`);
    await sleep(500);
  },
  async one(lang) {
    const c = CAP[lang].one;
    await evaluate(`stage.caption(${JSON.stringify(c[0])})`);
    await sleep(800);
    await approach(ctl(1));                            // 行にポインタを乗せる → 保存アイコンが色づく
    await sleep(900);
    await moveTo(ctl(1), 380);
    await sleep(700);                                  // ボタンの上で少し止まる（ラベル「保存」が出る）
    await evaluate(`stage.showFinder(true)`); await click();
    await sleep(3400);                                 // 保存中 → 保存済み、Finder にファイルが落ちる
  },
  async all(lang) {
    const c = CAP[lang].all;
    await evaluate(`stage.caption(${JSON.stringify(c[0])})`);
    await sleep(800);
    await approach(bulkEl, 70, 1000);
    await sleep(500);
    await moveTo(bulkEl, 380);
    await sleep(800);
    await evaluate(`stage.showFinder(true)`); await click();
    await sleep(5400);                                  // 進捗バー → すべて保存済み → 通知
  },
  async folder(lang) {
    const c = CAP[lang].folder;
    await evaluate(`stage.caption(${JSON.stringify(c[0])})`);
    await evaluate(`stage.showFinder(true); stage.addFolders(window.frames[0].__T.dirs, window.frames[0].__T.dirs[0])`);
    await sleep(800);
    await approach(ctl(0));
    await sleep(700);
    await moveTo(ctl(0), 380);
    await sleep(500);
    await click();
    await sleep(1500);                                  // 保存先のシートが開く
    await moveTo(`${layer}.querySelectorAll('.row')[0]`, 900, 0.35);
    await sleep(600);
    await click();                                      // 近い名前の既存フォルダを選ぶ
    await sleep(700);
    await moveTo(`${layer}.querySelector('.pbtn')`, 800);
    await sleep(500);
    await click();
    await sleep(2400);                                  // 保存 → Finder に出る
    await approach(ctl(1), 90, 1100);
    await sleep(700);
    await moveTo(ctl(1), 380);
    await sleep(500);
    await click();                                      // 2件目は、確認なしで同じ場所へ
    await sleep(3000);
  },
};

/* ---------- スクリーンショット（拡張機能自身のページ）---------- */
const SHOTS = [
  ['settings', { p: 'options', hash: 'general' }],
  ['courses', { p: 'options', hash: 'courses' }],
  ['popup', { p: 'popup' }],
  ['welcome', { p: 'welcome', qs: '' }],
];
async function shots(lang) {
  for (const [name, o] of SHOTS) {
    console.log('shot', name, lang);
    const qs = new URLSearchParams({ lang, ...o }).toString();
    await send('Page.navigate', { url: `http://localhost:${PORT}/promo/shots.html?${qs}` });
    await sleep(600);
    await evaluate('window.__ready');
    await sleep(500);
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    const f = path.join(ROOT, 'docs', 'media', `shot-${name}-${lang}.png`);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, Buffer.from(r.data, 'base64'));
  }
}

/* ---------- 実行 ---------- */
const want = process.argv[2] || 'all', wantLang = process.argv[3] || 'all', wantVariant = process.argv[4] || 'both';
const names = want === 'all' ? Object.keys(scenes) : [want];
const shotsOnly = want === 'shots';
const langs = wantLang === 'all' ? ['en', 'ja'] : [wantLang];
for (const lang of langs) { if (shotsOnly) await shots(lang); }
for (const lang of langs) for (const name of shotsOnly ? [] : names) {
  // 字幕つき（デモ動画・サイト用）と、字幕なし（README のクリップ用）。タイトルは字幕つきだけ
  const variants = name === 'title' ? ['cap'] : wantVariant === 'both' ? ['cap', 'nocap'] : [wantVariant];
  for (const variant of variants) {
    const nocap = variant === 'nocap';
    console.log('record', name, lang, variant);
    mx = 1000; my = 700; down = false;
    await send('Page.navigate', { url: `http://localhost:${PORT}/promo/stage.html?lang=${lang}&scene=${name}${nocap ? '&nocap=1' : ''}` });
    await sleep(500);
    await evaluate('window.__ready');
    await sleep(400);
    await put(mx, my);
    await startRec(path.join(TMP, `${name}-${lang}-${variant}`));
    await scenes[name](lang);
    await stopRec(path.join(OUT, `${name}-${lang}${nocap ? '-nocap' : ''}.mp4`));
  }
}
cleanup();
process.exit(0);
