// Shadow DOM 内に差し込むスタイル（Moodle側のCSSから隔離するため、ここに持つ）
const DARK = `  --accent: #0a84ff;
  --accent-ink: #64a8ff;
  --accent-soft: rgba(10, 132, 255, 0.22);
  --accent-soft-hover: rgba(10, 132, 255, 0.32);
  --ok: #30d158;
  --danger: #ff453a;
  --text: #f5f5f7;
  --muted: #a1a1a6;
  --fill: rgba(235, 235, 245, 0.12);
  --fill-hover: rgba(235, 235, 245, 0.2);
  --line: rgba(255, 255, 255, 0.14);
  --glass: rgba(44, 44, 46, 0.78);
  --glass-solid: #2c2c2e;
  --shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.16), 0 12px 40px rgba(0, 0, 0, 0.5);`;

globalThis.MOODROP_CSS = `
:host {
  all: initial;
  --accent: #0a84ff;
  --accent-hover: #0071e3;
  --accent-ink: #0071e3;
  --accent-soft: rgba(10, 132, 255, 0.12);
  --accent-soft-hover: rgba(10, 132, 255, 0.2);
  --ok: #248a3d;
  --ok-soft: rgba(52, 199, 89, 0.16);
  --danger: #d70015;
  --danger-soft: rgba(255, 59, 48, 0.12);
  --text: #1d1d1f;
  --muted: #6e6e73;
  --fill: rgba(120, 120, 128, 0.12);
  --fill-hover: rgba(120, 120, 128, 0.2);
  --line: rgba(0, 0, 0, 0.1);
  --glass: rgba(246, 246, 248, 0.82);
  --glass-solid: #f5f5f7;
  --shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.18), 0 12px 40px rgba(0, 0, 0, 0.22);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", "Yu Gothic UI", "Segoe UI", sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
/* 暗い配色: 重ね合わせ（シート・通知）はOSの設定、ページ上のボタンはページ自体の明暗に合わせる */
:host([data-theme="dark"]) {
${DARK}
}
@media (prefers-color-scheme: dark) {
  :host(moodrop-layer) {
${DARK}
  }
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
svg { display: block; flex: none; }

/* ---------- 資料の行のコントロール ---------- */

/* 行の右端に置く（位置は content.js が測って --top / --right に入れる） */
:host([data-layout="row"]) {
  position: absolute;
  top: var(--top, 50%);
  right: var(--right, 12px);
  transform: translateY(-50%);
  z-index: 5;
}
/* 行の構造が分からないときは、リンクの直後に置く */
:host([data-layout="inline"]) {
  display: inline-block;
  position: relative;
  z-index: 5;
  margin-left: 6px;
  vertical-align: middle;
}
:host(moodrop-bulk) {
  display: block;
  position: relative;
  z-index: 5;
  margin: 6px 0 10px;
}
:host(moodrop-bulk[data-layout="heading"]) {
  position: absolute;
  top: 50%;
  right: var(--right, 12px);
  transform: translateY(-50%);
  margin: 0;
}
.ctl { display: inline-flex; align-items: center; gap: 2px; }

/* 普段は薄いアイコンだけ。行にポインタを乗せる（data-hot）か、ボタン自体に触れると色とラベルが出る */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.btn .lbl {
  max-width: 0;
  margin-left: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width 0.18s ease, margin 0.18s ease, opacity 0.15s;
}
:host([data-hot]) .btn:not(.busy):not(.err),
.btn:hover,
.btn:focus-visible {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
:host([data-hot]) .btn .lbl,
.btn:hover .lbl,
.btn:focus-visible .lbl {
  max-width: 80px;
  margin-left: 5px;
  opacity: 1;
}
.btn:hover { background: var(--accent-soft-hover); }
.btn:active { transform: scale(0.96); }
.btn:focus-visible, .icon-btn:focus-visible, .seg button:focus-visible, .row:focus-visible, .field:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
/* 進行中・失敗は、ポインタに関係なくラベルを出して状態を伝える */
.btn.busy, .btn.err { padding: 0 9px 0 7px; cursor: default; }
.btn.busy .lbl, .btn.err .lbl { max-width: none; margin-left: 5px; opacity: 1; }
.btn.busy { background: var(--fill); color: var(--muted); }
.btn.busy:active { transform: none; }
.btn.err { background: var(--danger-soft); color: var(--danger); cursor: pointer; }
/* セクションの一括保存（見出しの右端）。標準的なグレーのボタンに、件数のバッジ */
.bulk {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 7px 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--fill);
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.bulk > svg, .bulk > span:first-child > svg { color: var(--accent-ink); }
.bulk:hover { background: var(--fill-hover); }
.bulk:active { transform: scale(0.97); }
.bulk:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.bulk .count {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 99px;
  background: var(--accent);
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.bulk.busy {
  cursor: default;
  color: var(--accent-ink);
  padding-right: 10px;
  background: linear-gradient(90deg, var(--accent-soft-hover) var(--p, 0%), var(--fill) var(--p, 0%));
  transition: none;
}
.bulk.done { padding: 0 8px 0 6px; background: transparent; color: var(--ok); cursor: default; }
.bulk.done > svg, .bulk.done > span:first-child > svg { color: var(--ok); }

.spinner {
  width: 12px; height: 12px;
  border: 1.6px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.saved {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: var(--ok);
  cursor: default;
}
.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 26px; height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  width: 0;
  overflow: hidden;
  transition: background 0.15s, opacity 0.15s, width 0.15s;
}
:host([data-hot]) .icon-btn, .icon-btn:focus-visible { opacity: 0.8; width: 26px; }
.icon-btn:hover { background: var(--fill); opacity: 1; }

/* ---------- 重ね合わせ（シート・アラート・通知） ---------- */

:host(moodrop-layer) {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
}
.backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.22);
  pointer-events: auto;
  animation: fade 0.18s ease-out;
}
.backdrop.center { align-items: center; padding-top: 0; }
@keyframes fade { from { opacity: 0; } }
@keyframes drop { from { opacity: 0; transform: translateY(-14px) scale(0.985); } }

.window {
  width: min(440px, calc(100vw - 32px));
  max-height: 76vh;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: var(--glass);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  backdrop-filter: saturate(180%) blur(30px);
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: drop 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.head { padding: 18px 20px 12px; }
.title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.sub { margin-top: 2px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.body { padding: 2px 20px 6px; overflow: auto; flex: 1 1 auto; min-height: 0; }
.foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px 16px;
}
.foot .spacer { flex: 1; }

.pbtn, .sbtn {
  height: 28px;
  padding: 0 14px;
  border: 0;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.pbtn { background: var(--accent); color: #fff; font-weight: 500; }
.pbtn:hover { background: var(--accent-hover); }
.sbtn { background: var(--fill); }
.sbtn:hover { background: var(--fill-hover); }
.pbtn:active, .sbtn:active { transform: scale(0.97); }
.pbtn:disabled { opacity: 0.45; cursor: default; transform: none; }
.pbtn:focus-visible, .sbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* アラート */
.alert {
  width: 280px;
  padding: 20px 20px 16px;
  text-align: center;
  border-radius: 14px;
  background: var(--glass);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  backdrop-filter: saturate(180%) blur(30px);
  box-shadow: var(--shadow);
  animation: drop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.alert .app { width: 52px; height: 52px; margin: 0 auto 10px; }
.alert .t { font-size: 13px; font-weight: 600; }
.alert .m { margin: 4px 0 14px; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.alert .stack { display: grid; gap: 6px; }
.alert .stack .pbtn, .alert .stack .sbtn { width: 100%; height: 30px; }
.alert .m.hint { margin-top: -8px; font-size: 11px; opacity: 0.85; }
.check { display: flex; align-items: center; justify-content: center; gap: 6px; margin: -4px 0 12px; font-size: 12px; color: var(--muted); cursor: pointer; }
.check input { margin: 0; accent-color: var(--accent); }

/* フォルダ選択シート */
.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--fill);
  margin-bottom: 12px;
}
.seg button {
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  color: var(--muted);
}
.seg button[aria-pressed="true"] {
  background: var(--glass-solid);
  color: var(--text);
  font-weight: 500;
  box-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.2);
}
.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--muted);
}
.crumb {
  padding: 2px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.crumb:hover { background: var(--fill); color: var(--text); }
.crumb.cur { color: var(--text); font-weight: 500; cursor: default; }
.crumb.cur:hover { background: transparent; }
.list {
  height: 196px;
  overflow: auto;
  border-radius: 9px;
  background: var(--glass-solid);
  box-shadow: inset 0 0 0 0.5px var(--line);
  padding: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font-size: 13px;
  cursor: default;
}
.row:hover { background: var(--fill); }
.row[aria-selected="true"] { background: var(--accent); color: #fff; }
.row[aria-selected="true"] .go { color: #fff; }
.row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .fld { color: var(--accent); }
.row[aria-selected="true"] .fld { color: #fff; }
.row .go { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 5px; background: transparent; color: var(--muted); cursor: pointer; padding: 0; }
.row .go:hover { background: rgba(120, 120, 128, 0.25); }
.row .tag { font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--ok-soft); color: var(--ok); }
.row[aria-selected="true"] .tag { background: rgba(255,255,255,.25); color: #fff; }
.empty { display: grid; place-items: center; height: 100%; color: var(--muted); font-size: 12px; }
.field {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  margin-top: 12px;
  border: 0;
  border-radius: 7px;
  background: var(--glass-solid);
  box-shadow: inset 0 0 0 0.5px var(--line);
  color: var(--text);
  font: inherit;
}
.label { margin-top: 12px; font-size: 11px; font-weight: 600; color: var(--muted); letter-spacing: 0.02em; }

/* 通知 */
.toasts {
  position: fixed;
  top: 16px;
  right: 16px;
  display: grid;
  gap: 8px;
  width: min(340px, calc(100vw - 32px));
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 12px;
  border-radius: 12px;
  background: var(--glass);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  backdrop-filter: saturate(180%) blur(30px);
  box-shadow: var(--shadow);
  pointer-events: auto;
  animation: slide 0.28s cubic-bezier(0.2, 0.9, 0.3, 1);
  transition: opacity 0.18s, transform 0.18s;
}
.toast.out { opacity: 0; transform: translateX(16px); }
@keyframes slide { from { opacity: 0; transform: translateX(24px); } }
.toast .app { width: 30px; height: 30px; }
.toast .msg { flex: 1; min-width: 0; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.toast .act {
  height: 24px; padding: 0 10px; border: 0; border-radius: 6px;
  background: var(--accent-soft); color: var(--accent-hover);
  font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap;
}
@media (prefers-color-scheme: dark) { .toast .act { color: #64a8ff; } }
.toast .act:hover { background: var(--accent-soft-hover); }
.toast .x { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1; }
.toast .x:hover { background: var(--fill); }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
