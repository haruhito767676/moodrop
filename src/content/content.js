// content.js
// Moodleページ上の資料リンクの横に「保存」ボタンを追加します。
// UI は ui.js（Shadow DOM）に隔離してあり、ここでは検出と保存の流れだけを扱う。

(() => {
if (window.__moodropLoaded) return; // 登録済みスクリプトと即時注入が重なっても二重に動かさない
window.__moodropLoaded = true;

const { t, h, icon, makeHost, request, toast, duplicateAlert, permissionAlert, folderSheet } = MoodropUI;

const PROCESSED_ATTR = 'data-moodrop-btn-added';

const FILE_EXT_RE =
  /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|rtf|od[tsp]|tex|ipynb|py|cpp?|hpp?|java|jsx?|tsx?|md|json|xml|epub|mp[34]|mov|wav|png|jpe?g|gif|svg)(\?|#|$)/i;

const ALLOWED_PLUGINFILE_COMPONENT =
  /\/pluginfile\.php\/\d+\/(mod_resource|mod_folder|mod_page|mod_book|assignsubmission_file|assignfeedback_file)\b/;

const FILE_CONTAINER_SELECTOR =
  '.activityinstance, .activity-item, .modtype_resource, .modtype_folder, ' +
  '.fileuploadsubmission, .filemanager, .foldertree, .fp-filename-icon, .resourcecontent';

function isTargetLink(a) {
  if (!a.href) return false;

  // アイコン／サムネイルだけのリンク（テキストなし）は対象外
  if (a.querySelector('img') && !a.textContent.trim()) return false;

  if (/\/mod\/resource\/view\.php/.test(a.href)) return true;

  if (/\/pluginfile\.php\//.test(a.href)) {
    if (ALLOWED_PLUGINFILE_COMPONENT.test(a.href)) return true;
    if (a.closest(FILE_CONTAINER_SELECTOR)) return true;
    return FILE_EXT_RE.test(a.href);
  }
  return false;
}

// 科目名・IDはパンくずリスト内の「コースへのリンク」からのみ取得する。
// （ページ全体を走査すると、コースインデックスや「最近のコース」ブロックの
//   別コースのリンクを拾ってしまい、誤ったフォルダに保存されうる）
function getCourseInfo() {
  let courseId = null;
  let courseName = null;

  const breadcrumb = document.querySelector('.breadcrumb, ol.breadcrumb, nav[aria-label] ol');
  if (breadcrumb) {
    const link = breadcrumb.querySelector('a[href*="/course/view.php"]');
    if (link) {
      const m = link.href.match(/[?&]id=(\d+)/);
      if (m) {
        courseId = m[1];
        courseName = link.textContent.trim();
      }
    }
  }

  if (!courseId) {
    const m = (document.body?.className || '').match(/(?:^|\s)course-(\d+)(?:\s|$)/);
    if (m) courseId = m[1];
  }
  if (!courseName) {
    const h1 = document.querySelector('.page-header-headings h1, #page-header h1, header h1, h1');
    if (h1 && h1.textContent.trim()) courseName = h1.textContent.trim();
  }
  if (!courseName) {
    const parts = document.title.split(/[:|\-–—]/).map((s) => s.trim()).filter(Boolean);
    courseName = parts[parts.length - 1] || document.title.trim() || 'course';
  }

  const courseKey = courseId ? `course-${courseId}` : `name-${courseName}`;
  return { courseId, courseName, courseKey };
}

function guessFilenameFromUrl(url) {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'file');
  } catch {
    return 'file';
  }
}


/* ---------- 保存処理 ---------- */

function shortName(anchor) {
  return (
    (anchor.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) ||
    guessFilenameFromUrl(anchor.href)
  );
}

function sendSave(anchor, extra) {
  const { courseKey, courseName } = getCourseInfo();
  const suggestedName =
    anchor.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) || guessFilenameFromUrl(anchor.href);
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'SAVE_FILE', fileUrl: anchor.href, suggestedName, courseKey, courseName, ...extra },
        (resp) => {
          // service worker が途中で止まった場合など、応答が来ないときは lastError になる
          if (chrome.runtime.lastError) resolve({ status: 'error', message: chrome.runtime.lastError.message });
          else resolve(resp);
        }
      );
    } catch (e) {
      // 拡張機能を再読み込みした後、開きっぱなしのページから送ると同期的に投げられる
      const msg = String((e && e.message) || e);
      resolve({
        status: 'error',
        message: /context invalidated/i.test(msg)
          ? t('errExtensionUpdated')
          : msg,
      });
    }
  });
}

// ユーザーが許可ダイアログなどを自分で閉じただけのケース。異常ではないので通知しない。
function isBenignCancel(message) {
  return /cancel|キャンセル/i.test(message || '');
}

// 1件保存のコア処理。UIの更新は onState に委ね、権限・保存先・重複の確認を
// 挟みながら最大数回リトライする。
// 戻り値: { ok, benign, message, file }
async function runSave(anchor, opts = {}) {
  // 例外で「保存中…」のまま固まらないよう、必ず結果オブジェクトで返す
  try {
    return await runSaveInner(anchor, opts);
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) };
  }
}

async function runSaveInner(anchor, { onState, bulkCtx } = {}) {
  const setState = onState || (() => {});
  const state = {}; // dirPath / onDuplicate を段階的に積む
  if (bulkCtx && bulkCtx.duplicateChoice) state.onDuplicate = bulkCtx.duplicateChoice;

  for (let guard = 0; guard < 6; guard++) {
    const resp = await sendSave(anchor, state);
    if (!resp) return { ok: false, message: t('errNoResponse') };

    if (resp.status === 'ok') return { ok: true, file: resp.file };

    if (resp.status === 'needs_setup') {
      toast({
        message: resp.message || t('needsSetupMsg'),
        actionLabel: t('toastOpenSettings'),
        onAction: () => request({ type: 'OPEN_OPTIONS' }),
        timeout: 12000,
      });
      return { ok: false, benign: true, message: 'Save folder is not set' };
    }

    if (resp.status === 'needs_permission') {
      setState(t('stateCheckingAccess'));
      if (!(await permissionAlert(resp.rootName))) {
        return { ok: false, benign: true, message: 'Access permission was cancelled' };
      }
      const grant = await request({ type: 'REQUEST_GRANT' });
      if (!grant || grant.status !== 'ok') {
        // 許可ウィンドウが閉じられた／拒否された。黙って消えないよう、エラーとして知らせる。
        return { ok: false, message: t('errGrantDenied') };
      }
      setState(t('stateSaving'));
      continue;
    }

    if (resp.status === 'needs_folder') {
      setState(t('stateChoosingFolder'));
      const { courseName } = getCourseInfo();
      const path = await folderSheet({ courseName, ...resp });
      if (!path) return { ok: false, benign: true, message: 'Folder selection was cancelled' };
      state.dirPath = path;
      setState(t('stateSaving'));
      continue;
    }

    if (resp.status === 'duplicate') {
      setState(t('stateConfirming'));
      const res = await duplicateAlert(resp.filename, { bulkMode: Boolean(bulkCtx) });
      if (!res || !res.choice) {
        return { ok: false, benign: true, message: 'Duplicate handling was cancelled' };
      }
      state.onDuplicate = res.choice;
      if (bulkCtx && res.applyAll) bulkCtx.duplicateChoice = res.choice;
      setState(t('stateSaving'));
      continue;
    }

    return { ok: false, benign: isBenignCancel(resp.message), message: resp.message };
  }
  return { ok: false, message: t('errIncomplete') };
}

/* ---------- コントロール（保存ボタン / 保存済み表示） ---------- */

const controls = new Map(); // anchor -> rec

function makeControl(anchor) {
  const { host, root } = makeHost('moodrop-ui');
  const ctl = h('span', { class: 'ctl' });
  root.appendChild(ctl);
  const rec = { wrap: host, saved: null, busy: false };

  const stop = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const label = (text) => h('span', { class: 'lbl' }, text);

  rec.showSave = () => {
    ctl.replaceChildren(
      h('button', { class: 'btn', type: 'button', title: t('btnSaveTitle'), 'aria-label': t('btnSaveAria'), onclick: stop(() => startSingleSave(anchor, rec)) },
        icon('download'), label(t('btnSave')))
    );
  };

  rec.showBusy = (text) => {
    ctl.replaceChildren(
      h('button', { class: 'btn busy', type: 'button', disabled: true, 'aria-live': 'polite' },
        h('span', { class: 'spinner' }), label(text))
    );
  };

  rec.showError = (text = t('stateFailed')) => {
    ctl.replaceChildren(
      h('button', { class: 'btn err', type: 'button', title: t('btnRetryTitle'), onclick: stop(() => startSingleSave(anchor, rec)) },
        icon('retry'), label(text))
    );
  };

  rec.showSaved = (info) => {
    rec.saved = info;
    ctl.replaceChildren(
      h('span', { class: 'saved', title: info.path ? t('savedTitle', info.path) : t('savedLabel'), role: 'img', 'aria-label': t('savedLabel') },
        h('span', { class: 'lbl' }, t('savedLabel')), icon('saved')),
      h('button', { class: 'icon-btn', type: 'button', title: t('resaveTitle'), 'aria-label': t('resaveTitle'), onclick: stop(() => startSingleSave(anchor, rec)) },
        icon('retry'))
    );
    refreshSectionButtons();
  };

  rec.showSave();
  return rec;
}

function startSingleSave(anchor, rec) {
  if (rec.busy) return;
  rec.busy = true;
  const wasSaved = rec.saved;
  rec.showBusy(t('stateSaving'));

  runSave(anchor, { onState: rec.showBusy }).then((r) => {
    rec.busy = false;

    if (r.ok) {
      rec.showSaved({
        name: (r.file && r.file.name) || shortName(anchor) || t('fileFallback'),
        path: (r.file && r.file.path) || (wasSaved && wasSaved.path) || '',
      });
      return;
    }

    if (r.benign) {
      if (r.message) console.debug('[Moodrop]', r.message);
      if (wasSaved) rec.showSaved(wasSaved);
      else rec.showSave();
      return;
    }

    console.warn('[Moodrop]', r.message);
    rec.showError();
    toast({
      message: t('toastFailed', shortName(anchor), r.message || t('toastUnknownError')),
      actionLabel: t('toastRetry'),
      onAction: () => startSingleSave(anchor, rec),
    });
  });
}

/* ---------- セクション一括保存 ---------- */

const SECTION_SELECTOR =
  'li.section, li.course-section, .course-section, [data-region="section"]';
const SECTION_HEADING_SELECTOR =
  '.course-section-header, h3.sectionname, .sectionname, [data-for="section_title"], .section-title, .sectionhead';

const bulks = new WeakMap(); // section -> { host, btn, busy, label }

function sectionAnchors(section) {
  const out = [];
  controls.forEach((rec, a) => {
    if (a.isConnected && a.closest(SECTION_SELECTOR) === section) out.push(a);
  });
  return out;
}

function pendingOf(anchors) {
  return anchors.filter((a) => {
    const rec = controls.get(a);
    return rec && !rec.saved && !rec.busy;
  });
}

// state: { kind: 'idle' | 'busy' | 'done', count, done, total }
function setBulk(bulk, state) {
  const key = JSON.stringify(state);
  if (bulk.key === key) return;
  bulk.key = key;
  const { btn } = bulk;

  if (state.kind === 'done') {
    btn.className = 'bulk done';
    btn.disabled = true;
    btn.replaceChildren(icon('check'), h('span', {}, t('bulkAllSaved')));
  } else if (state.kind === 'busy') {
    btn.className = 'bulk busy';
    btn.disabled = true;
    btn.style.setProperty('--p', `${Math.round((state.done / state.total) * 100)}%`);
    btn.replaceChildren(h('span', { class: 'spinner' }), h('span', {}, t('bulkProgress', state.done, state.total)));
  } else {
    btn.className = 'bulk';
    btn.disabled = false;
    btn.style.removeProperty('--p');
    btn.replaceChildren(icon('download'), h('span', {}, t('bulkSaveAll')), h('span', { class: 'count' }, String(state.count)));
  }
}

function updateBulk(bulk, anchors) {
  if (bulk.busy) return;
  const pending = pendingOf(anchors).length;
  setBulk(bulk, pending ? { kind: 'idle', count: pending } : { kind: 'done' });
}

// セクション見出しの右端に置く（Moodle自身の操作ボタンは避ける）
const headingLayouts = new Map(); // heading -> Set<host>
const headingObserver = new ResizeObserver((entries) => entries.forEach((e) => layoutHeading(e.target)));

function layoutHeading(heading) {
  const hosts = headingLayouts.get(heading);
  const rect = heading.getBoundingClientRect();
  if (!hosts || !rect.width) return;
  let right = 12;
  const actions = heading.querySelector(ACTIONS_SELECTOR);
  if (actions) {
    const r = actions.getBoundingClientRect();
    if (r.width && r.left > rect.left + rect.width / 2) right = Math.max(12, rect.right - r.left + 8);
  }
  hosts.forEach((host) => host.style.setProperty('--right', `${right}px`));
}

function placeBulk(section, host) {
  const heading = section.querySelector(SECTION_HEADING_SELECTOR);
  if (!heading) {
    host.dataset.layout = 'block';
    section.insertAdjacentElement('afterbegin', host);
    return;
  }
  host.dataset.layout = 'heading';
  if (getComputedStyle(heading).position === 'static') heading.style.position = 'relative';
  heading.appendChild(host);
  if (!headingLayouts.has(heading)) {
    headingLayouts.set(heading, new Set());
    headingObserver.observe(heading);
  }
  headingLayouts.get(heading).add(host);
  layoutHeading(heading);
}

function injectSectionButtons() {
  // アンカーを「最も近いセクション」でグルーピングする（入れ子セクションでも
  // 各資料は1回だけ数えられる）。
  const groups = new Map();
  controls.forEach((rec, a) => {
    if (!a.isConnected) return;
    const section = a.closest(SECTION_SELECTOR);
    if (!section) return;
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(a);
  });

  groups.forEach((anchors, section) => {
    let bulk = bulks.get(section);
    if (bulk && bulk.host.isConnected) {
      updateBulk(bulk, anchors);
      return;
    }
    if (anchors.length < 2) return;

    const { host, root } = makeHost('moodrop-bulk');
    const btn = h('button', { class: 'bulk', type: 'button' });
    root.appendChild(btn);
    bulk = { host, btn, busy: false };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runBulkSave(section, bulk);
    });
    bulks.set(section, bulk);
    updateBulk(bulk, anchors);

    placeBulk(section, host);
  });
}

function refreshSectionButtons() {
  try {
    injectSectionButtons();
  } catch (e) {
    console.warn('[Moodrop]', e);
  }
}

// 連続保存の共通ループ。戻り値: { done, failed: anchor[], cancelled }
async function saveSequence(list, bulk) {
  const bulkCtx = { duplicateChoice: null };
  const failed = [];
  let done = 0;
  let cancelled = false;

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const rec = controls.get(a);
    if (!rec || rec.saved || rec.busy || !a.isConnected) continue;

    rec.busy = true;
    rec.showBusy(t('stateSaving'));
    setBulk(bulk, { kind: 'busy', done: i, total: list.length });

    const r = await runSave(a, { onState: rec.showBusy, bulkCtx });
    rec.busy = false;

    if (r.ok) {
      rec.showSaved({
        name: (r.file && r.file.name) || shortName(a) || t('fileFallback'),
        path: (r.file && r.file.path) || '',
      });
      done++;
    } else if (r.benign) {
      rec.showSave();
      cancelled = true;
      break;
    } else {
      rec.showError();
      failed.push(a);
    }
  }
  return { done, failed, cancelled };
}

async function runBulk(section, bulk, list, { retry = false } = {}) {
  if (bulk.busy) return;
  bulk.busy = true;
  const { done, failed, cancelled } = await saveSequence(list, bulk);
  bulk.busy = false;
  updateBulk(bulk, sectionAnchors(section));

  if (cancelled) {
    toast({ message: t(retry ? 'toastRetryInterrupted' : 'toastBulkInterrupted', done) });
  } else if (failed.length) {
    toast({
      message: t('toastBulkResult', done, failed.length),
      actionLabel: t('toastRetryFailedOnes'),
      onAction: () => runBulk(section, bulk, failed, { retry: true }),
    });
  } else {
    toast({ message: t('toastBulkDone', done) });
  }
}

function runBulkSave(section, bulk) {
  const pending = pendingOf(sectionAnchors(section));
  if (pending.length) runBulk(section, bulk, pending);
}

/* ---------- ボタン注入 ---------- */

const ROW_SELECTOR = '.activity-item, li.activity, li.modtype_resource';
const ACTIONS_SELECTOR =
  '.activity-actions, [data-region="activity-actions"], .section-actions, .actions, .actionmenu, .action-menu, .completion-info';

// 行ごとに、コントロールの縦位置（リンクの中心）と右端の余白（Moodle自身の操作ボタンを避ける）を測り直す
const rowLayouts = new Map(); // row -> Map<anchor, host>
const rowObserver = new ResizeObserver((entries) => {
  entries.forEach((e) => layoutRow(e.target));
});

function layoutRow(row) {
  const items = rowLayouts.get(row);
  if (!items) return;
  const rowRect = row.getBoundingClientRect();
  if (!rowRect.width) return;

  let right = 12;
  const actions = row.querySelector(ACTIONS_SELECTOR);
  if (actions) {
    const r = actions.getBoundingClientRect();
    if (r.width && r.left > rowRect.left + rowRect.width / 2) right = Math.max(12, rowRect.right - r.left + 8);
  }
  items.forEach((host, anchor) => {
    const r = anchor.getBoundingClientRect();
    host.style.setProperty('--right', `${right}px`);
    if (r.height) host.style.setProperty('--top', `${r.top + r.height / 2 - rowRect.top - row.clientTop}px`);
    else host.style.removeProperty('--top');
  });
}

function placeControl(anchor, rec) {
  const row = anchor.closest(ROW_SELECTOR);
  if (!row) {
    // 行の構造が分からないページでは、リンクの直後に置く
    rec.wrap.dataset.layout = 'inline';
    (anchor.closest('.activityname') || anchor).insertAdjacentElement('afterend', rec.wrap);
    return;
  }

  rec.wrap.dataset.layout = 'row';
  row.classList.add('moodrop-host');
  if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
  row.appendChild(rec.wrap);

  if (!rowLayouts.has(row)) {
    rowLayouts.set(row, new Map());
    rowObserver.observe(row);
    // 行にポインタを乗せたとき（またはキーボードで触れたとき）だけ、アイコンを強調する
    const hot = (on) => rowLayouts.get(row).forEach((host) => host.toggleAttribute('data-hot', on));
    row.addEventListener('pointerenter', () => hot(true));
    row.addEventListener('pointerleave', () => hot(false));
    row.addEventListener('focusin', () => hot(true));
    row.addEventListener('focusout', () => hot(false));
  }
  rowLayouts.get(row).set(anchor, rec.wrap);
  layoutRow(row);
}

function injectButtons() {
  // Moodle が行を描き直すときに、こちらが足したボタンだけが消えることがある。
  // リンクが残っていてボタンが外れていれば、付け直す。
  controls.forEach((rec, a) => {
    if (!a.isConnected) {
      controls.delete(a);
    } else if (!rec.wrap.isConnected) {
      try {
        placeControl(a, rec);
      } catch (e) {
        console.warn('[Moodrop]', e);
      }
    }
  });
  rowLayouts.forEach((_, row) => {
    if (!row.isConnected) {
      rowObserver.unobserve(row);
      rowLayouts.delete(row);
    }
  });

  const anchors = document.querySelectorAll(`a:not([${PROCESSED_ATTR}])`);
  const fresh = [];

  anchors.forEach((a) => {
    // 1件の失敗で、残りの資料にボタンが付かなくならないようにする
    try {
      if (!isTargetLink(a)) return;
      a.setAttribute(PROCESSED_ATTR, '1');
      const rec = makeControl(a);
      controls.set(a, rec);
      placeControl(a, rec);
      fresh.push(a);
    } catch (e) {
      console.warn('[Moodrop]', e);
    }
  });

  if (fresh.length) querySavedState(fresh);
  refreshSectionButtons();
}

// 既に保存済みの資料は、ページを開いた時点で「保存済み」表示にする。
function querySavedState(anchors) {
  const urls = anchors.map((a) => a.href);
  request({ type: 'CHECK_SAVED', urls }).then((resp) => {
    if (!resp || resp.status !== 'ok') return;
    anchors.forEach((a) => {
      const info = resp.saved[a.href];
      const rec = controls.get(a);
      if (info && rec && !rec.busy && !rec.saved) rec.showSaved(info);
    });
  });
}

// Moodleのフォルダ表示などはJSで後から中身が展開されることがあるため監視する。
// 変更のたびに走らせると重いのでデバウンスする。
let scanTimer = null;
function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    try {
      injectButtons();
    } catch (e) {
      console.warn('[Moodrop]', e);
    }
  }, 300);
}

function startObserver() {
  // Moodle が領域ごと差し替えることがあるので、特定の領域ではなくページ全体を見る（走査はデバウンス済み）
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}

// 拡張機能の更新前に動いていたスクリプトの残骸（付け直せないボタンや目印）を片づけてから始める
document.querySelectorAll('moodrop-ui, moodrop-bulk, moodrop-layer').forEach((n) => n.remove());
document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((n) => n.removeAttribute(PROCESSED_ATTR));

injectButtons();
startObserver();
})();
