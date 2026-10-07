import { getRootHandle, setRootHandle, resetForNewRoot, hasRootBoundData } from '../lib/store.js';
import { getSites, enableSite, originOf } from '../lib/sites.js';

const $ = (id) => document.getElementById(id);
const steps = [...document.querySelectorAll('.step')];
const next = $('next');
const back = $('back');
const skip = $('skip');

// 見るステップの順番。すべて設定済みなら、保存先・Moodle登録は飛ばして「ようこそ → 使い方」だけにする
let order = [0, 1, 2, 3];
let pos = 0;
let current = 0; // いま表示しているステップ（steps の番号）
const state = { root: null, site: null, guide: false };

// 拡張機能のページは、window.close() が効かないことがあるので、タブとして閉じる
async function closeSelf() {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab) return await chrome.tabs.remove(tab.id);
  } catch { /* 下で閉じる */ }
  window.close();
}

/* ---------- 各ステップの主ボタン ---------- */

// 主ボタンは、そのステップでやることが済むまでは「実行」、済んだら「続ける」に変わる
function primary() {
  switch (current) {
    case 0:
      return { label: state.guide ? '使い方を見る' : 'はじめる', run: () => go(state.guide ? 3 : 1) };
    case 1:
      return state.root
        ? { label: '続ける', run: () => go(2) }
        : { label: 'フォルダを選ぶ…', run: pickFolder };
    case 2:
      return state.site
        ? { label: '続ける', run: () => go(3) }
        : { label: '有効にする', run: addSite, disabled: !originOf($('site-url').value.trim()) };
    default:
      return state.site
        ? { label: 'Moodle を開く', run: () => { location.href = state.site; } }
        : { label: '閉じる', run: closeSelf };
  }
}

function render() {
  current = order[pos];
  steps.forEach((s, i) => { s.hidden = i !== current; });
  $('dots').replaceChildren(
    ...order.map((_, i) => Object.assign(document.createElement('i'), { className: i === pos ? 'on' : '' }))
  );
  // 設定済みのときに開いた場合は、最後の画面を「使い方」として見せる
  const last = steps[3];
  last.querySelector('h1').textContent = state.guide ? '使い方' : '準備ができました';
  back.hidden = pos === 0 || current === 3;
  skip.hidden = current !== 1 && current !== 2;
  skip.textContent = 'あとで';

  const p = primary();
  next.textContent = p.label;
  next.disabled = Boolean(p.disabled);

  $('root-card').hidden = !state.root;
  if (state.root) $('root-name').textContent = state.root;
  $('site-card').hidden = !state.site;
  if (state.site) $('site-name').textContent = state.site.replace(/^https?:\/\//, '');
  $('site-url').hidden = Boolean(state.site);
  $('site-msg').hidden = Boolean(state.site);
  $('root-change').hidden = !state.root;
}

// n はステップの番号。表示順（order）の中の位置に直して移る
function go(n) {
  const i = order.indexOf(n);
  pos = i >= 0 ? i : Math.min(order.length - 1, pos + 1);
  render();
  if (current === 2 && !state.site) $('site-url').focus();
}

/* ---------- 保存先フォルダ ---------- */

async function pickFolder() {
  $('pick-msg').textContent = '';
  try {
    const handle = await showDirectoryPicker({ id: 'moodrop-root', mode: 'readwrite', startIn: 'documents' });
    const old = await getRootHandle();
    if (old && !(await old.isSameEntry(handle).catch(() => false)) && (await hasRootBoundData())) {
      await resetForNewRoot();
    }
    await setRootHandle(handle);
    state.root = handle.name;
    render();
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('pick-msg').textContent = `フォルダを選べませんでした（${e.message}）。別のフォルダを選んでください。`;
  }
}

/* ---------- Moodle サイト ---------- */

async function addSite() {
  const msg = $('site-msg');
  msg.classList.remove('err');
  const origin = originOf($('site-url').value.trim());
  if (!origin) return;
  next.disabled = true;
  if (await enableSite(origin)) {
    state.site = origin;
    render();
  } else {
    msg.textContent = 'アクセスが許可されませんでした。もう一度お試しください。';
    msg.classList.add('err');
    render();
  }
}

/* ---------- 操作 ---------- */

next.addEventListener('click', () => primary().run());
back.addEventListener('click', () => { pos = Math.max(0, pos - 1); render(); });
skip.addEventListener('click', () => { pos = Math.min(order.length - 1, pos + 1); render(); });
$('root-change').addEventListener('click', pickFolder);
$('site-url').addEventListener('input', render);
$('site-url').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !next.disabled) next.click();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && !next.disabled) next.click();
});

// すでに設定済みの項目（再インストールや、やり直しで開いた場合）を反映する
const root = await getRootHandle();
if (root) state.root = root.name;
const sites = await getSites();
if (sites.length) state.site = sites[0];

if (state.root && state.site) {
  state.guide = true;
  order = [0, 3];
} else {
  // ポップアップなどから、途中のステップを指定して開く（?step=1）
  const want = Number(new URLSearchParams(location.search).get('step'));
  if (order.includes(want)) pos = order.indexOf(want);
}
render();
