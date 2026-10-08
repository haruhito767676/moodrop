import { getRootHandle } from '../lib/store.js';
import { getSites, enableSite, originOf, looksLikeMoodle } from '../lib/sites.js';
import { t, applyI18n } from '../lib/i18n.js';

applyI18n();

const $ = (id) => document.getElementById(id);
const openOptions = () => chrome.runtime.openOptionsPage();

$('opts').addEventListener('click', openOptions);
$('root-set').addEventListener('click', openOptions);

async function renderSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const origin = tab && tab.url && originOf(tab.url);
  if (!origin) return;

  const host = origin.replace(/^https?:\/\//, '');
  const enabled = (await getSites()).includes(origin);
  $('site-card').hidden = false;
  $('site-title').textContent = host;

  if (enabled) {
    $('site-on').hidden = false;
    $('site-sub').textContent = t('siteOnSub');
    return;
  }

  const isMoodle = await looksLikeMoodle(tab.id);
  $('site-sub').textContent = isMoodle
    ? t('siteDetected')
    : t('siteNotMoodle');
  const btn = $('site-enable');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    if (await enableSite(origin, tab.id)) {
      btn.hidden = true;
      $('site-on').hidden = false;
      $('site-sub').textContent = t('siteOnSub');
    } else {
      btn.disabled = false;
    }
  });
}

async function renderRoot() {
  const root = await getRootHandle();
  if (root) {
    $('root-name').textContent = root.name;
    $('root-set').textContent = t('btnChange');
    return;
  }
  // 保存先が未設定なら、案内の「保存先」のステップから続けられるようにする
  $('setup-card').hidden = false;
  $('setup-go').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/welcome.html?step=1') });
    window.close();
  });
}

async function renderRecent() {
  const box = $('recent');
  const resp = await chrome.runtime.sendMessage({ type: 'GET_RECENT' });
  const items = (resp && resp.recent) || [];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('recentEmpty');
    box.appendChild(empty);
    return;
  }
  for (const it of items) {
    const row = document.createElement('div');
    row.className = 'row';
    const body = document.createElement('div');
    body.className = 'grow';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = it.name || t('unnamed');
    const sub = document.createElement('div');
    sub.className = 'path';
    sub.textContent = [it.courseName, it.at ? new Date(it.at).toLocaleString() : '']
      .filter(Boolean)
      .join(' · ');
    body.append(title, sub);
    row.appendChild(body);
    box.appendChild(row);
  }
}

renderSite();
renderRoot();
renderRecent();
