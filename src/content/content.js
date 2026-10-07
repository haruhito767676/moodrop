// content.js
// Moodleページ上の資料リンクの横に「保存」ボタンを追加します。

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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// 戻り値: { choice: 'overwrite' | 'rename', applyAll: boolean } または null（キャンセル）
function openDuplicateDialog(filename, { bulkMode = false } = {}) {
  return new Promise((resolve) => {
    const overlay = el('div', 'moodrop-modal-overlay');
    const modal = el('div', 'moodrop-modal moodrop-modal--small');
    overlay.appendChild(modal);

    modal.appendChild(el('div', 'moodrop-modal-title', '同じ名前のファイルがすでにあります'));
    modal.appendChild(
      el(
        'div',
        'moodrop-modal-section-body',
        `「${filename}」はこのフォルダに存在します。どうしますか？`
      )
    );

    let applyAll = null;
    if (bulkMode) {
      const lbl = el('label', 'moodrop-modal-remember');
      applyAll = document.createElement('input');
      applyAll.type = 'checkbox';
      lbl.appendChild(applyAll);
      lbl.appendChild(document.createTextNode(' 以降の重複にも同じ操作を適用する'));
      modal.appendChild(lbl);
    }

    const footer = el('div', 'moodrop-modal-footer');
    const mk = (label, value, className) => {
      const b = el('button', className, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        overlay.remove();
        resolve(
          value ? { choice: value, applyAll: Boolean(applyAll && applyAll.checked) } : null
        );
      });
      return b;
    };
    footer.appendChild(mk('キャンセル', null, 'moodrop-modal-cancel'));
    footer.appendChild(mk('別名で保存', 'rename', 'moodrop-modal-secondary'));
    footer.appendChild(mk('上書き', 'overwrite', 'moodrop-modal-ok'));
    modal.appendChild(footer);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });
    (document.body || document.documentElement).appendChild(overlay);
  });
}

/* ---------- トースト通知 ---------- */

let toastHost = null;
function showToast({ message, actionLabel, onAction, timeout = 8000 }) {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = el('div', 'moodrop-toast-host');
    (document.body || document.documentElement).appendChild(toastHost);
  }
  const toast = el('div', 'moodrop-toast');
  toast.appendChild(el('span', 'moodrop-toast-msg', message));

  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    toast.classList.add('moodrop-toast--out');
    setTimeout(() => toast.remove(), 180);
  };

  if (actionLabel && onAction) {
    const act = el('button', 'moodrop-toast-action', actionLabel);
    act.type = 'button';
    act.addEventListener('click', () => {
      remove();
      onAction();
    });
    toast.appendChild(act);
  }
  const close = el('button', 'moodrop-toast-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '閉じる');
  close.addEventListener('click', remove);
  toast.appendChild(close);

  toastHost.appendChild(toast);
  timer = setTimeout(remove, timeout);
}

/* ---------- 保存処理 ---------- */

function shortName(anchor) {
  return (
    (anchor.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) ||
    guessFilenameFromUrl(anchor.href)
  );
}

function sendSave(anchor, extra) {
  return new Promise((resolve) => {
    const { courseKey, courseName } = getCourseInfo();
    const suggestedName =
      anchor.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) ||
      guessFilenameFromUrl(anchor.href);
    try {
      chrome.runtime.sendMessage(
        { type: 'SAVE_FILE', fileUrl: anchor.href, suggestedName, courseKey, courseName, ...extra },
        (resp) => {
          // service worker が途中で止まった場合など、応答が来ないときは lastError になる
          if (chrome.runtime.lastError) {
            resolve({ status: 'error', message: chrome.runtime.lastError.message });
          } else {
            resolve(resp);
          }
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

// ユーザーが許可ダイアログなどを自分で閉じただけのケース。
// これは異常ではないので、エラー欄に載せず通知も出さない。
function isBenignCancel(message) {
  return /cancel|キャンセル/i.test(message || '');
}

function request(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        resolve(chrome.runtime.lastError ? null : resp);
      });
    } catch {
      resolve(null);
    }
  });
}

// 1件保存のコア処理。UIの更新は onState に委ね、権限確認・重複確認を
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
  const state = {}; // onDuplicate を段階的に積む
  if (bulkCtx && bulkCtx.duplicateChoice) state.onDuplicate = bulkCtx.duplicateChoice;

  for (let guard = 0; guard < 6; guard++) {
    const resp = await sendSave(anchor, state);
    if (!resp) return { ok: false, message: '応答がありませんでした' };

    if (resp.status === 'ok') return { ok: true, file: resp.file };

    if (resp.status === 'needs_setup') {
      showToast({
        message: resp.message || '保存先フォルダがまだ選ばれていません',
        actionLabel: '設定を開く',
        onAction: () => request({ type: 'OPEN_OPTIONS' }),
        timeout: 12000,
      });
      return { ok: false, benign: true, message: '保存先フォルダが未設定です' };
    }

    if (resp.status === 'needs_permission') {
      setState('許可を確認…', 'moodrop-loading');
      const grant = await request({ type: 'REQUEST_GRANT' });
      if (!grant || grant.status !== 'ok') {
        return { ok: false, benign: true, message: '保存先フォルダへのアクセス許可がキャンセルされました' };
      }
      setState('保存中…', 'moodrop-loading');
      continue;
    }

    if (resp.status === 'duplicate') {
      setState('確認…', 'moodrop-loading');
      const res = await openDuplicateDialog(resp.filename, { bulkMode: Boolean(bulkCtx) });
      if (!res || !res.choice) {
        return { ok: false, benign: true, message: '重複時の操作をキャンセルしました' };
      }
      state.onDuplicate = res.choice;
      if (bulkCtx && res.applyAll) bulkCtx.duplicateChoice = res.choice;
      setState('保存中…', 'moodrop-loading');
      continue;
    }

    return { ok: false, benign: isBenignCancel(resp.message), message: resp.message };
  }
  return { ok: false, message: '処理を完了できませんでした' };
}

const BTN_STATES = ['moodrop-loading', 'moodrop-done', 'moodrop-error'];

/* ---------- コントロール（保存ボタン / 保存済み表示） ---------- */

const controls = new Map(); // anchor -> rec

function makeControl(anchor) {
  const wrap = el('span', 'moodrop-ctl');
  const rec = { wrap, saved: null, busy: false };

  rec.renderSaveButton = () => {
    wrap.textContent = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'moodrop-save-btn';
    btn.textContent = '保存';
    btn.title = 'この資料を科目フォルダに保存';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startSingleSave(anchor, rec);
    });
    wrap.appendChild(btn);
  };

  rec.renderSaved = (info) => {
    rec.saved = info;
    wrap.textContent = '';

    const label = document.createElement('span');
    label.className = 'moodrop-saved-link';
    label.textContent = '保存済み';
    label.title = info.path ? `保存先: ${info.path}` : info.name || '';
    wrap.appendChild(label);

    const re = document.createElement('button');
    re.type = 'button';
    re.className = 'moodrop-resave-btn';
    re.textContent = '↻';
    re.title = 'もう一度保存する';
    re.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startSingleSave(anchor, rec);
    });
    wrap.appendChild(re);

    refreshSectionButtons();
  };

  rec.renderSaveButton();
  return rec;
}

function startSingleSave(anchor, rec) {
  if (rec.busy) return;
  rec.busy = true;
  const wasSaved = rec.saved;

  rec.renderSaveButton();
  const btn = rec.wrap.querySelector('.moodrop-save-btn');
  const set = (text, cls) => {
    if (!btn) return;
    btn.textContent = text;
    btn.classList.remove(...BTN_STATES);
    if (cls) btn.classList.add(cls);
  };
  btn.disabled = true;
  set('保存中…', 'moodrop-loading');

  runSave(anchor, { onState: set }).then((r) => {
    rec.busy = false;

    if (r.ok) {
      rec.renderSaved({
        name: (r.file && r.file.name) || shortName(anchor) || '資料',
        path: (r.file && r.file.path) || (wasSaved && wasSaved.path) || '',
      });
      return;
    }

    if (r.benign) {
      if (r.message) console.debug('[Moodrop]', r.message);
      if (wasSaved) rec.renderSaved(wasSaved);
      else {
        set('キャンセル');
        setTimeout(() => rec.renderSaveButton(), 1500);
      }
      return;
    }

    console.warn('[Moodrop]', r.message);
    set('保存失敗', 'moodrop-error');
    showToast({
      message: `「${shortName(anchor)}」の保存に失敗しました: ${r.message || '不明なエラー'}`,
      actionLabel: '再試行',
      onAction: () => startSingleSave(anchor, rec),
    });
    setTimeout(() => {
      if (rec.busy) return;
      if (wasSaved) rec.renderSaved(wasSaved);
      else rec.renderSaveButton();
    }, 4000);
  });
}

/* ---------- セクション一括保存 ---------- */

const SECTION_SELECTOR =
  'li.section, li.course-section, .course-section, [data-region="section"]';
const SECTION_HEADING_SELECTOR =
  '.course-section-header, h3.sectionname, .sectionname, [data-for="section_title"], .section-title, .sectionhead';

function sectionAnchors(section) {
  const out = [];
  controls.forEach((rec, a) => {
    if (a.isConnected && a.closest(SECTION_SELECTOR) === section) out.push(a);
  });
  return out;
}

function updateBulkCount(btn, anchors) {
  if (btn.dataset.busy) return;
  const pending = anchors.filter((a) => {
    const rec = controls.get(a);
    return rec && !rec.saved;
  }).length;

  // MutationObserver がこのボタンの変更でまた走るため、
  // 実際に変化したときだけ DOM を書き換える（無限ループ防止）。
  if (btn.dataset.pending === String(pending)) return;
  btn.dataset.pending = String(pending);
  btn.textContent = pending
    ? `このセクションをまとめて保存 (${pending})`
    : 'このセクションは保存済み';
  btn.disabled = pending === 0;
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
    let btn = section.querySelector('.moodrop-bulk-btn');
    if (btn && btn.closest(SECTION_SELECTOR) !== section) btn = null; // 深いセクションのボタン
    if (btn) {
      updateBulkCount(btn, anchors);
      return;
    }
    if (anchors.length < 2) return;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'moodrop-bulk-btn';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runBulkSave(section, btn);
    });
    updateBulkCount(btn, anchors);

    const heading = section.querySelector(SECTION_HEADING_SELECTOR);
    if (heading) heading.insertAdjacentElement('afterend', btn);
    else section.insertAdjacentElement('afterbegin', btn);
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
async function saveSequence(list, bulkBtn, label) {
  const bulkCtx = { duplicateChoice: null };
  const failed = [];
  let done = 0;
  let cancelled = false;

  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const rec = controls.get(a);
    if (!rec || rec.saved || rec.busy || !a.isConnected) continue;

    rec.busy = true;
    rec.renderSaveButton();
    const b = rec.wrap.querySelector('.moodrop-save-btn');
    const set = (t, c) => {
      if (!b) return;
      b.textContent = t;
      b.classList.remove(...BTN_STATES);
      if (c) b.classList.add(c);
    };
    if (b) b.disabled = true;
    set('保存中…', 'moodrop-loading');
    if (bulkBtn) bulkBtn.textContent = `${label} ${i + 1}/${list.length}…`;

    const r = await runSave(a, { onState: set, bulkCtx });
    rec.busy = false;

    if (r.ok) {
      rec.renderSaved({
        name: (r.file && r.file.name) || shortName(a) || '資料',
        path: (r.file && r.file.path) || '',
      });
      done++;
    } else if (r.benign) {
      rec.renderSaveButton();
      cancelled = true;
      break;
    } else {
      rec.renderSaveButton();
      set('保存失敗', 'moodrop-error');
      failed.push(a);
    }
  }
  return { done, failed, cancelled };
}

async function runBulkSave(section, btn) {
  if (btn.dataset.busy) return;
  btn.dataset.busy = '1';
  btn.disabled = true;

  const anchors = sectionAnchors(section);
  const pending = anchors.filter((a) => {
    const rec = controls.get(a);
    return rec && !rec.saved && !rec.busy;
  });

  if (pending.length) {
    const { done, failed, cancelled } = await saveSequence(pending, btn, '保存中');
    if (cancelled) {
      showToast({ message: `一括保存を中断しました（${done} 件保存）` });
    } else if (failed.length) {
      showToast({
        message: `一括保存: ${done} 件成功 / ${failed.length} 件失敗`,
        actionLabel: '失敗分を再試行',
        onAction: () => retrySequence(failed, section, btn),
      });
    } else {
      showToast({ message: `このセクションの資料 ${done} 件を保存しました` });
    }
  }

  delete btn.dataset.busy;
  updateBulkCount(btn, sectionAnchors(section));
}

async function retrySequence(list, section, btn) {
  if (btn.dataset.busy) return;
  btn.dataset.busy = '1';
  btn.disabled = true;

  const { done, failed, cancelled } = await saveSequence(list, btn, '再試行');

  delete btn.dataset.busy;
  updateBulkCount(btn, sectionAnchors(section));

  if (cancelled) {
    showToast({ message: `再試行を中断しました（${done} 件保存）` });
  } else if (failed.length) {
    showToast({
      message: `再試行: ${done} 件成功 / ${failed.length} 件失敗`,
      actionLabel: 'もう一度',
      onAction: () => retrySequence(failed, section, btn),
    });
  } else {
    showToast({ message: `再試行で ${done} 件を保存しました` });
  }
}

/* ---------- ボタン注入 ---------- */

function injectButtons() {
  const anchors = document.querySelectorAll(`a:not([${PROCESSED_ATTR}])`);
  const fresh = [];

  anchors.forEach((a) => {
    if (a.closest('.moodrop-modal-overlay')) return;
    if (a.closest('.moodrop-toast-host')) return;
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
  chrome.runtime.sendMessage({ type: 'CHECK_SAVED', urls }, (resp) => {
    if (chrome.runtime.lastError || !resp || resp.status !== 'ok') return;
    anchors.forEach((a) => {
      const info = resp.saved[a.href];
      const rec = controls.get(a);
      if (info && rec && !rec.busy && !rec.saved) rec.renderSaved(info);
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
