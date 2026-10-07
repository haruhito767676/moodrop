import { getRootHandle, setRootHandle, permissionOf } from '../lib/store.js';
import { getSites, enableSite, disableSite, originOf } from '../lib/sites.js';

const $ = (id) => document.getElementById(id);

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

/* ---------- Moodleサイト ---------- */

async function renderSites() {
  const sites = await getSites();
  const box = $('sites');
  box.textContent = '';
  if (!sites.length) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span class="muted">まだ登録されていません</span>';
    box.appendChild(row);
    return;
  }
  for (const origin of sites) {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('div');
    name.className = 'grow title';
    name.textContent = origin.replace(/^https?:\/\//, '');
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'danger';
    rm.textContent = '解除';
    rm.addEventListener('click', async () => {
      await disableSite(origin);
      renderSites();
    });
    row.append(name, rm);
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

renderRoot();
renderSites();
