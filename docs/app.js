// ヒーローのデモ（実際の拡張機能の動きを、ページ上で再現する）
(() => {
  const demo = document.querySelector('[data-demo]');
  if (!demo) return;
  const L = demo.dataset;
  const ICON = {
    dl: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5v7.5M4.8 7.2 8 10.4l3.2-3.2M3 13.2h10"/></svg>',
    ok: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5" fill="currentColor"/><path d="m4.6 8.3 2.3 2.3 4.5-5" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chk: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  };
  const rows = [...demo.querySelectorAll('.row')].map((row) => ({ row, ctl: row.querySelector('.ctl'), state: 'idle' }));
  const bulk = demo.querySelector('.bulk');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function render(r) {
    if (r.state === 'idle') {
      r.ctl.innerHTML = `<button class="mbtn" type="button" aria-label="${L.save}">${ICON.dl}<span class="lbl">${L.save}</span></button>`;
      r.ctl.firstChild.addEventListener('click', () => saveOne(r));
    } else if (r.state === 'busy') {
      r.ctl.innerHTML = `<button class="mbtn busy" type="button" disabled><span class="spin"></span><span class="lbl">${L.saving}</span></button>`;
    } else {
      r.ctl.innerHTML = `<span class="saved" role="img" aria-label="${L.saved}"><span class="lbl">${L.saved}</span>${ICON.ok}</span>`;
    }
    renderBulk();
  }

  let bulkBusy = null;
  function renderBulk() {
    const pending = rows.filter((r) => r.state !== 'done').length;
    if (bulkBusy) {
      bulk.className = 'bulk busy';
      bulk.style.setProperty('--p', `${Math.round((bulkBusy.done / bulkBusy.total) * 100)}%`);
      bulk.innerHTML = `<span class="spin"></span><span>${L.progress.replace('{a}', bulkBusy.done).replace('{b}', bulkBusy.total)}</span>`;
      bulk.disabled = true;
    } else if (pending) {
      bulk.className = 'bulk';
      bulk.disabled = false;
      bulk.innerHTML = `${ICON.dl}<span>${L.all}</span><span class="count">${pending}</span>`;
    } else {
      bulk.className = 'bulk done';
      bulk.disabled = true;
      bulk.innerHTML = `${ICON.chk}<span>${L.allSaved}</span>`;
    }
  }

  async function saveOne(r) {
    if (r.state !== 'idle') return;
    r.state = 'busy'; render(r);
    await wait(900 + Math.random() * 500);
    r.state = 'done'; render(r);
    maybeReset();
  }

  async function saveAll() {
    const todo = rows.filter((r) => r.state === 'idle');
    if (!todo.length || bulkBusy) return;
    bulkBusy = { done: 0, total: todo.length }; renderBulk();
    for (const r of todo) {
      r.state = 'busy'; render(r);
      await wait(800);
      r.state = 'done'; render(r);
      bulkBusy.done++; renderBulk();
    }
    bulkBusy = null; renderBulk();
    maybeReset();
  }

  // 全部保存済みになったら、少し置いてから最初の状態に戻す（もう一度試せるように）
  let resetTimer = null;
  function maybeReset() {
    if (bulkBusy || rows.some((r) => r.state !== 'done')) return;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      rows.forEach((r, i) => { r.state = i === rows.length - 1 ? 'done' : 'idle'; render(r); });
    }, 3500);
  }

  bulk.addEventListener('click', saveAll);
  rows.forEach((r, i) => { r.state = i === rows.length - 1 ? 'done' : 'idle'; render(r); });
})();
