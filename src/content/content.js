// content.js
// Moodleページ上の資料リンクの横に「保存」ボタンを追加します。
// UI は ui.js（Shadow DOM）に隔離してあり、ここでは検出と保存の流れだけを扱う。

(() => {
if (window.__moodropLoaded) return; // 登録済みスクリプトと即時注入が重なっても二重に動かさない
window.__moodropLoaded = true;

const { h, icon, makeHost, request, toast, duplicateAlert, permissionAlert, folderSheet } = MoodropUI;

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
          ? '拡張機能が更新されました。このページを再読み込みしてください'
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
    if (!resp) return { ok: false, message: '応答がありませんでした' };

    if (resp.status === 'ok') return { ok: true, file: resp.file };

    if (resp.status === 'needs_setup') {
      toast({
        message: resp.message || '保存先フォルダがまだ選ばれていません',
        actionLabel: '設定を開く',
        onAction: () => request({ type: 'OPEN_OPTIONS' }),
        timeout: 12000,
      });
      return { ok: false, benign: true, message: '保存先フォルダが未設定です' };
    }

    if (resp.status === 'needs_permission') {
      setState('許可を確認…');
      if (!(await permissionAlert(resp.rootName))) {
        return { ok: false, benign: true, message: '保存先フォルダへのアクセスの許可をキャンセルしました' };
      }
      const grant = await request({ type: 'REQUEST_GRANT' });
      if (!grant || grant.status !== 'ok') {
        // 許可ウィンドウが閉じられた／拒否された。黙って消えないよう、エラーとして知らせる。
        return { ok: false, message: '保存先フォルダへのアクセスが許可されませんでした。もう一度お試しください' };
      }
      setState('保存中…');
      continue;
    }

    if (resp.status === 'needs_folder') {
      setState('保存先を選択…');
      const { courseName } = getCourseInfo();
      const path = await folderSheet({ courseName, ...resp });
      if (!path) return { ok: false, benign: true, message: '保存先の選択をキャンセルしました' };
      state.dirPath = path;
      setState('保存中…');
      continue;
    }

    if (resp.status === 'duplicate') {
      setState('確認…');
      const res = await duplicateAlert(resp.filename, { bulkMode: Boolean(bulkCtx) });
      if (!res || !res.choice) {
        return { ok: false, benign: true, message: '重複時の操作をキャンセルしました' };
      }
      state.onDuplicate = res.choice;
      if (bulkCtx && res.applyAll) bulkCtx.duplicateChoice = res.choice;
      setState('保存中…');
      continue;
    }

    return { ok: false, benign: isBenignCancel(resp.message), message: resp.message };
  }
  return { ok: false, message: '処理を完了できませんでした' };
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

  rec.showSave = () => {
    ctl.replaceChildren(
      h('button', { class: 'btn', type: 'button', title: 'この資料を科目フォルダに保存', onclick: stop(() => startSingleSave(anchor, rec)) },
        icon('download'), '保存')
    );
  };

  rec.showBusy = (text) => {
    ctl.replaceChildren(
      h('button', { class: 'btn busy', type: 'button', disabled: true, 'aria-live': 'polite' },
        h('span', { class: 'spinner' }), text)
    );
  };

  rec.showError = (text = '保存失敗') => {
    ctl.replaceChildren(
      h('button', { class: 'btn err', type: 'button', title: 'クリックで再試行', onclick: stop(() => startSingleSave(anchor, rec)) }, text)
    );
  };

  rec.showMessage = (text) => {
    ctl.replaceChildren(h('button', { class: 'btn busy', type: 'button', disabled: true }, text));
  };

  rec.showSaved = (info) => {
    rec.saved = info;
    ctl.replaceChildren(
      h('span', { class: 'saved', title: info.path ? `保存先: ${info.path}` : info.name || '' }, icon('check'), '保存済み'),
      h('button', { class: 'icon-btn', type: 'button', title: 'もう一度保存する', 'aria-label': 'もう一度保存する', onclick: stop(() => startSingleSave(anchor, rec)) },
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
  rec.showBusy('保存中…');

  runSave(anchor, { onState: rec.showBusy }).then((r) => {
    rec.busy = false;

    if (r.ok) {
      rec.showSaved({
        name: (r.file && r.file.name) || shortName(anchor) || '資料',
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
      message: `「${shortName(anchor)}」の保存に失敗しました: ${r.message || '不明なエラー'}`,
      actionLabel: '再試行',
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

function setBulk(bulk, text, { disabled = false, busy = false } = {}) {
  if (bulk.label === text && bulk.disabled === disabled && bulk.isBusy === busy) return;
  Object.assign(bulk, { label: text, disabled, isBusy: busy });
  bulk.btn.disabled = disabled;
  bulk.btn.className = busy ? 'btn big busy' : 'btn big';
  bulk.btn.replaceChildren(busy ? h('span', { class: 'spinner' }) : icon(disabled ? 'check' : 'download'), text);
}

function updateBulk(bulk, anchors) {
  if (bulk.busy) return;
  const pending = pendingOf(anchors).length;
  setBulk(bulk, pending ? `このセクションをまとめて保存 (${pending})` : 'このセクションは保存済み', {
    disabled: pending === 0,
  });
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
    const btn = h('button', { class: 'btn big', type: 'button' });
    root.appendChild(btn);
    bulk = { host, btn, busy: false };
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runBulkSave(section, bulk);
    });
    bulks.set(section, bulk);
    updateBulk(bulk, anchors);

    const heading = section.querySelector(SECTION_HEADING_SELECTOR);
    if (heading) heading.insertAdjacentElement('afterend', host);
    else section.insertAdjacentElement('afterbegin', host);
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
async function saveSequence(list, bulk, label) {
  const bulkCtx = { duplicateChoice: null };
  const failed = [];
  let done = 0;
  let cancelled = false;

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const rec = controls.get(a);
    if (!rec || rec.saved || rec.busy || !a.isConnected) continue;

    rec.busy = true;
    rec.showBusy('保存中…');
    setBulk(bulk, `${label} ${i + 1}/${list.length}…`, { disabled: true, busy: true });

    const r = await runSave(a, { onState: rec.showBusy, bulkCtx });
    rec.busy = false;

    if (r.ok) {
      rec.showSaved({
        name: (r.file && r.file.name) || shortName(a) || '資料',
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

async function runBulk(section, bulk, list, label) {
  if (bulk.busy) return;
  bulk.busy = true;
  const { done, failed, cancelled } = await saveSequence(list, bulk, label);
  bulk.busy = false;
  updateBulk(bulk, sectionAnchors(section));

  if (cancelled) {
    toast({ message: `${label === '保存中' ? '一括保存' : '再試行'}を中断しました（${done} 件保存）` });
  } else if (failed.length) {
    toast({
      message: `${done} 件成功 / ${failed.length} 件失敗`,
      actionLabel: '失敗分を再試行',
      onAction: () => runBulk(section, bulk, failed, '再試行'),
    });
  } else {
    toast({ message: `${done} 件の資料を保存しました` });
  }
}

function runBulkSave(section, bulk) {
  const pending = pendingOf(sectionAnchors(section));
  if (pending.length) runBulk(section, bulk, pending, '保存中');
}

/* ---------- ボタン注入 ---------- */

function injectButtons() {
  const anchors = document.querySelectorAll(`a:not([${PROCESSED_ATTR}])`);
  const fresh = [];

  anchors.forEach((a) => {
    if (!isTargetLink(a)) return;

    a.setAttribute(PROCESSED_ATTR, '1');

    // Moodle Boost は行全体をクリック可能にする透明オーバーレイ
    // （a.stretched-link::after）を敷く。これがボタンを覆って押せなくなるので、
    // ボタンを置いた行にマークを付けて CSS 側でそのオーバーレイを無効化する。
    const host = a.closest('.activity-item, .activityinstance, li.activity, .course-content li');
    if (host) host.classList.add('moodrop-host');

    const rec = makeControl(a);
    controls.set(a, rec);

    // stretched-link の内側（<a>直後）ではなく、その外側に置く
    const insertAfter = a.closest('.activityname') || a;
    insertAfter.insertAdjacentElement('afterend', rec.wrap);
    fresh.push(a);
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
// 変更のたびに走らせると重いのでデバウンスし、監視範囲もメイン領域に絞る。
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
  const target =
    document.querySelector('#region-main, #page-content, [role="main"], .course-content') ||
    document.body;
  if (!target) return;
  const observer = new MutationObserver(scheduleScan);
  observer.observe(target, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}

injectButtons();
startObserver();
})();
