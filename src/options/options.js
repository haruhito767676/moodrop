import {
  getRootHandle, setRootHandle, permissionOf, getSettings, setSettings, getCourseDirs, forgetCourseDir,
  resetForNewRoot, hasRootBoundData,
} from '../lib/store.js';
import { getSites, enableSite, disableSite, originOf } from '../lib/sites.js';
import { t, applyI18n } from '../lib/i18n.js';

applyI18n();

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
    $('root-name').textContent = t('rootNone');
    $('pick').textContent = t('btnChoose');
    return;
  }

  $('root-name').textContent = root.name;
  $('pick').textContent = t('btnChange');
  badge.hidden = false;
  if ((await permissionOf(root)) === 'granted') {
    badge.textContent = t('badgeReady');
    badge.className = 'badge ok';
  } else {
    badge.textContent = t('badgeReauth');
    badge.className = 'badge warn';
    regrant.hidden = false;
  }
}

$('pick').addEventListener('click', async () => {
  $('pick-msg').textContent = '';
  try {
    const handle = await showDirectoryPicker({ id: 'moodrop-root', mode: 'readwrite', startIn: 'documents' });

    // 別のフォルダに変える場合は、前のフォルダを前提にした記録をリセットする（確認してから）
    const old = await getRootHandle();
    const changed = old && !(await old.isSameEntry(handle).catch(() => false));
    if (changed && (await hasRootBoundData())) {
      const ok = confirm(t('confirmRoot', handle.name));
      if (!ok) return;
      await resetForNewRoot();
    }

    await setRootHandle(handle);
    await renderRoot();
    await renderCourses();
  } catch (e) {
    if (e.name === 'AbortError') return;
    $('pick-msg').textContent = t('pickError', e.message);
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
    box.appendChild(el('div', 'empty-row', t('coursesEmpty')));
    return;
  }
  for (const [key, val] of entries) {
    const row = el('div', 'row');
    const body = el('div', 'grow');
    body.append(el('div', 'title', val.courseName || val.path[val.path.length - 1]), el('div', 'path', val.path.join(' / ')));
    const btn = el('button', null, t('btnChooseAgain'));
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
    box.appendChild(el('div', 'empty-row', t('sitesEmpty')));
    return;
  }
  for (const origin of sites) {
    const row = el('div', 'row');
    const rm = el('button', 'danger', t('btnRemove'));
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
    msg.textContent = t('siteUrlInvalid');
    return;
  }
  if (await enableSite(origin)) {
    $('site-url').value = '';
    renderSites();
  } else {
    msg.textContent = t('siteDenied');
  }
});

showPane();
renderRoot();
renderAuto();
renderCourses();
renderSites();
