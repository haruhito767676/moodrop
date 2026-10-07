import { getRootHandle, setRootHandle, resetForNewRoot, hasRootBoundData } from '../lib/store.js';
import { getSites, enableSite, originOf } from '../lib/sites.js';

const $ = (id) => document.getElementById(id);
const steps = [...document.querySelectorAll('.step')];
const dots = [...$('dots').children];
const next = $('next');
const back = $('back');
const skip = $('skip');

let current = 0;
const state = { root: null, site: null };

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
      return { label: 'はじめる', run: () => go(1) };
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
  steps.forEach((s, i) => { s.hidden = i !== current; });
  dots.forEach((d, i) => d.classList.toggle('on', i === current));
  back.hidden = current === 0 || current === 3;
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

function go(n) {
  current = n;
  render();
  if (n === 2 && !state.site) $('site-url').focus();
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
back.addEventListener('click', () => go(Math.max(0, current - 1)));
skip.addEventListener('click', () => go(current + 1));
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
render();
