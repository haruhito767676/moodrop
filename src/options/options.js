import { getRootHandle, setRootHandle, permissionOf, getSettings, setSettings, getCourseDirs, forgetCourseDir } from '../lib/store.js';
import { getSites, enableSite, disableSite, originOf } from '../lib/sites.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* ---------- ペイン切り替え ---------- */

function showPane() {
  const id = ['general', 'courses', 'sites'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'general';
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.id !== id; });
  document.querySelectorAll('.sidebar a').forEach((a) => {
    if (a.dataset.pane === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange', showPane);

/* ---------- 保存先フォルダ ---------- */

async function renderRoot() {
  const root = await getRootHandle();
  const badge = $('root-badge');
  const regrant = $('regrant');
  badge.hidden = true;
  regrant.hidden = true;

  if (!root) {
    $('root-name').textContent = '未設定';
    $('pick').textContent = '選ぶ…';
    return;
  }

  $('root-name').textContent = root.name;
  $('pick').textContent = '変更…';
  badge.hidden = false;
  if ((await permissionOf(root)) === 'granted') {
    badge.textContent = '使用可能';
    badge.className = 'badge ok';
  } else {
    badge.textContent = '再許可が必要';
    badge.className = 'badge warn';
    regrant.hidden = false;
  }
}

$('pick').addEventListener('click', async () => {
  $('pick-msg').textContent = '';
  try {
    const handle = await showDirectoryPicker({ id: 'moodrop-root', mode: 'readwrite', startIn: 'documents' });
    await setRootHandle(handle);
    await renderRoot();
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('pick-msg').textContent = `フォルダを選べませんでした（${e.message}）。別のフォルダを選んでください。`;
  }
});

$('regrant').addEventListener('click', async () => {
  const root = await getRootHandle();
  if (root) await root.requestPermission({ mode: 'readwrite' });
  await renderRoot();
});

/* ---------- 科目フォルダ ---------- */

async function renderAuto() {
  $('auto').checked = (await getSettings()).autoCreate;
}
$('auto').addEventListener('change', (e) => setSettings({ autoCreate: e.target.checked }));

async function renderCourses() {
  const box = $('course-list');
  box.replaceChildren();
  const entries = Object.entries(await getCourseDirs()).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  if (!entries.length) {
    box.appendChild(el('div', 'empty-row', 'まだ保存した科目はありません'));
    return;
  }
  for (const [key, val] of entries) {
    const row = el('div', 'row');
    const body = el('div', 'grow');
    body.append(el('div', 'title', val.courseName || val.path[val.path.length - 1]), el('div', 'path', val.path.join(' / ')));
    const btn = el('button', null, '選び直す');
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      await forgetCourseDir(key);
      renderCourses();
    });
    row.append(body, btn);
    box.appendChild(row);
  }
}

/* ---------- Moodleサイト ---------- */

async function renderSites() {
  const sites = await getSites();
  const box = $('site-list');
  box.replaceChildren();
  if (!sites.length) {
    box.appendChild(el('div', 'empty-row', 'まだ登録されていません'));
    return;
  }
  for (const origin of sites) {
    const row = el('div', 'row');
    const rm = el('button', 'danger', '解除');
    rm.type = 'button';
    rm.addEventListener('click', async () => {
      await disableSite(origin);
      renderSites();
    });
    row.append(el('div', 'grow title', origin.replace(/^https?:\/\//, '')), rm);
    box.appendChild(row);
  }
}

$('site-add').addEventListener('click', async () => {
  const msg = $('site-msg');
  msg.textContent = '';
  const origin = originOf($('site-url').value.trim());
  if (!origin) {
    msg.textContent = 'URL（https://…）を入力してください。';
    return;
  }
  if (await enableSite(origin)) {
    $('site-url').value = '';
    renderSites();
  } else {
    msg.textContent = 'アクセスが許可されませんでした。';
  }
});

showPane();
renderRoot();
renderAuto();
renderCourses();
renderSites();
