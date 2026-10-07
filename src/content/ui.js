// Moodrop のページ上UI（Shadow DOM）。Moodle側のCSSの影響を受けないよう、すべて隔離して描く。
globalThis.MoodropUI = (() => {
  const SVG = (inner, { w = 14, fill = 'none', vb = '0 0 16 16', sw = 1.7 } = {}) =>
    `<svg width="${w}" height="${w}" viewBox="${vb}" fill="${fill}" stroke="${fill === 'none' ? 'currentColor' : 'none'}" ` +
    `stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    download: SVG('<path d="M8 2.5v7.5M4.8 7.2 8 10.4l3.2-3.2M3 13.2h10"/>', { w: 13 }),
    check: SVG('<path d="m3.5 8.5 3 3 6-7"/>', { w: 13 }),
    retry: SVG('<path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3"/>', { w: 13 }),
    chevron: SVG('<path d="m6 3.5 4.5 4.5L6 12.5"/>', { w: 12, sw: 1.8 }),
    folder: SVG(
      '<path d="M1.5 4.2a2 2 0 0 1 2-2h3c.5 0 1 .2 1.3.6l.8 1h6a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/>',
      { w: 16, fill: 'currentColor', vb: '0 0 16 16' }
    ),
  };

  // アプリアイコン（アラートや通知に出す小さなもの）
  const APP_ICON =
    '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#6e7bff"/><stop offset="1" stop-color="#0a84ff"/></linearGradient></defs>' +
    '<rect x="3" y="3" width="58" height="58" rx="14" fill="url(#g)"/>' +
    '<rect x="13" y="29" width="38" height="21" rx="5" fill="#fff" fill-opacity=".45"/>' +
    '<path d="M32 12c0 0-8.5 10-8.5 16a8.5 8.5 0 0 0 17 0C40.5 22 32 12 32 12Z" fill="#fff"/>' +
    '<rect x="13" y="35" width="38" height="15" rx="5" fill="#fff"/></svg>';

  /* ---------- 小道具 ---------- */

  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return n;
  }
  const icon = (name) => h('span', { html: ICONS[name], style: 'display:inline-flex' });
  const appIcon = () => h('div', { class: 'app', html: APP_ICON });

  // ページ自体が暗い配色かどうか（OSの設定ではなく、Moodleの背景色で決める）
  function pageIsDark() {
    for (let n = document.body; n; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || Number(m[3]) > 0.5)) {
        const [r, g, b] = m.map(Number);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
      }
    }
    return false;
  }

  function makeHost(tag) {
    const host = document.createElement(tag);
    if (tag !== 'moodrop-layer' && pageIsDark()) host.dataset.theme = 'dark';
    const root = host.attachShadow({ mode: 'closed' });
    root.appendChild(h('style', {}, globalThis.MOODROP_CSS));
    return { host, root };
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

  /* ---------- 重ね合わせレイヤー ---------- */

  let layer = null;
  function getLayer() {
    if (layer && layer.host.isConnected) return layer;
    const { host, root } = makeHost('moodrop-layer');
    const toasts = h('div', { class: 'toasts' });
    root.appendChild(toasts);
    (document.body || document.documentElement).appendChild(host);
    layer = { host, root, toasts };
    return layer;
  }

  // モーダルを開く。Esc / 背景クリックで onDismiss を呼ぶ。
  function openModal(content, { center = false, onDismiss } = {}) {
    const { root } = getLayer();
    const backdrop = h('div', { class: center ? 'backdrop center' : 'backdrop' }, content);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
    };
    const dismiss = () => {
      close();
      if (onDismiss) onDismiss();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      }
    };
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) dismiss();
    });
    document.addEventListener('keydown', onKey, true);
    root.appendChild(backdrop);
    return { close, dismiss };
  }

  /* ---------- 通知 ---------- */

  function toast({ message, actionLabel, onAction, timeout = 8000 }) {
    const { toasts } = getLayer();
    let timer = null;
    const el = h('div', { class: 'toast', role: 'status' });
    const remove = () => {
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
    };
    el.append(appIcon(), h('div', { class: 'msg' }, message));
    if (actionLabel && onAction) {
      el.append(
        h('button', { class: 'act', type: 'button', onclick: () => { remove(); onAction(); } }, actionLabel)
      );
    }
    el.append(h('button', { class: 'x', type: 'button', 'aria-label': '閉じる', onclick: remove }, '×'));
    toasts.appendChild(el);
    timer = setTimeout(remove, timeout);
  }

  /* ---------- 重複アラート ---------- */

  // 戻り値: { choice: 'overwrite' | 'rename', applyAll } または null
  function duplicateAlert(filename, { bulkMode = false } = {}) {
    return new Promise((resolve) => {
      let applyAll = null;
      let modal = null;
      const done = (choice) => {
        const all = Boolean(applyAll && applyAll.checked);
        modal.close();
        resolve(choice ? { choice, applyAll: all } : null);
      };
      const rename = h('button', { class: 'pbtn', type: 'button', onclick: () => done('rename') }, '別名で保存');
      const box = h(
        'div',
        { class: 'alert', role: 'alertdialog', 'aria-label': '同じ名前のファイルがあります' },
        appIcon(),
        h('div', { class: 't' }, '同じ名前のファイルがあります'),
        h('div', { class: 'm' }, `「${filename}」はこのフォルダにすでにあります。`)
      );
      if (bulkMode) {
        applyAll = h('input', { type: 'checkbox' });
        box.append(h('label', { class: 'check' }, applyAll, '以降の重複にも同じ操作を適用'));
      }
      box.append(
        h(
          'div',
          { class: 'stack' },
          rename,
          h('button', { class: 'sbtn', type: 'button', onclick: () => done('overwrite') }, '上書き'),
          h('button', { class: 'sbtn', type: 'button', onclick: () => done(null) }, 'キャンセル')
        )
      );
      modal = openModal(box, { center: true, onDismiss: () => resolve(null) });
      rename.focus();
    });
  }

  /* ---------- 保存先フォルダのシート ---------- */

  // 戻り値: 保存先のパス（ルートからのフォルダ名の配列）または null
  function folderSheet({ courseName, suggested, matches = [], rootName = '保存先' }) {
    return new Promise((resolve) => {
      let mode = matches.length ? 'existing' : 'new';
      let path = [];
      let dirs = [];
      let selected = null;
      let loading = false;

      let modal = null;
      const finish = (value) => {
        modal.close();
        resolve(value);
      };

      const seg = h('div', { class: 'seg', role: 'group' });
      const crumbs = h('div', { class: 'crumbs' });
      const list = h('div', { class: 'list', role: 'listbox' });
      const nameField = h('input', { class: 'field', type: 'text', value: suggested, 'aria-label': 'フォルダ名' });
      const nameLabel = h('div', { class: 'label' }, '新しいフォルダの名前');
      const placeLabel = h('div', { class: 'label', style: 'margin:0 0 6px 6px' }, '作成する場所（フォルダをクリックで移動）');
      const primary = h('button', { class: 'pbtn', type: 'button' });
      const cancel = h('button', { class: 'sbtn', type: 'button', onclick: () => finish(null) }, 'キャンセル');

      const load = async () => {
        loading = true;
        selected = null;
        render();
        const resp = await request({ type: 'LIST_DIRS', path });
        dirs = resp && resp.status === 'ok' ? resp.dirs : [];
        loading = false;
        render();
      };
      const enter = (name) => {
        path = [...path, name];
        load();
      };
      const goTo = (depth) => {
        path = path.slice(0, depth);
        load();
      };

      const renderSeg = () => {
        seg.replaceChildren(
          ...[['existing', '既存のフォルダ'], ['new', '新しく作る']].map(([m, label]) =>
            h(
              'button',
              { type: 'button', 'aria-pressed': String(mode === m), onclick: () => { mode = m; selected = null; render(); } },
              label
            )
          )
        );
      };

      const renderCrumbs = () => {
        const parts = [rootName, ...path];
        crumbs.replaceChildren(
          ...parts.flatMap((p, i) => {
            const cur = i === parts.length - 1;
            const btn = h('button', { class: cur ? 'crumb cur' : 'crumb', type: 'button', onclick: cur ? null : () => goTo(i) }, p);
            return i ? [h('span', {}, '›'), btn] : [btn];
          })
        );
      };

      const row = (name, { tag } = {}) =>
        h(
          'div',
          {
            class: 'row',
            role: 'option',
            tabindex: '0',
            'aria-selected': String(selected === name),
            onclick: () => {
              if (mode === 'new') return enter(name);
              selected = selected === name ? null : name;
              render();
            },
            ondblclick: () => enter(name),
            onkeydown: (e) => {
              if (e.key === 'Enter') { e.preventDefault(); enter(name); }
              if (e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
            },
          },
          h('span', { class: 'fld' }, icon('folder')),
          h('span', { class: 'name' }, name),
          tag ? h('span', { class: 'tag' }, tag) : null,
          h('button', { class: 'go', type: 'button', 'aria-label': `${name} を開く`, onclick: (e) => { e.stopPropagation(); enter(name); } }, icon('chevron'))
        );

      const renderList = () => {
        if (loading) return list.replaceChildren(h('div', { class: 'empty' }, '読み込み中…'));
        const rows = [];
        // ルート直下では、科目名に近い既存フォルダを先頭に出す
        const rec = path.length === 0 && mode === 'existing' ? matches.filter((m) => dirs.includes(m)) : [];
        rec.forEach((m) => rows.push(row(m, { tag: '近い名前' })));
        dirs.filter((d) => !rec.includes(d)).forEach((d) => rows.push(row(d)));
        list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, 'フォルダはありません')]));
      };

      const render = () => {
        renderSeg();
        renderCrumbs();
        renderList();
        nameField.style.display = nameLabel.style.display = mode === 'new' ? '' : 'none';
        placeLabel.style.display = mode === 'new' ? '' : 'none';
        if (mode === 'new') {
          const n = nameField.value.trim();
          primary.textContent = '作成して保存';
          primary.disabled = !n;
          primary.onclick = () => finish([...path, n]);
        } else {
          primary.textContent = selected ? `「${selected}」に保存` : path.length ? 'このフォルダに保存' : `${rootName} に直接保存`;
          primary.disabled = false;
          primary.onclick = () => finish(selected ? [...path, selected] : [...path]);
        }
      };

      nameField.addEventListener('input', render);
      nameField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !primary.disabled) { e.preventDefault(); primary.click(); }
      });

      const win = h(
        'div',
        { class: 'window', role: 'dialog', 'aria-label': '保存先を選ぶ' },
        h('div', { class: 'head' }, h('div', { class: 'title' }, 'この科目の保存先'), h('div', { class: 'sub' }, courseName)),
        h('div', { class: 'body' }, seg, placeLabel, crumbs, list, nameLabel, nameField),
        h('div', { class: 'foot' }, h('span', { class: 'spacer' }), cancel, primary)
      );
      modal = openModal(win, { onDismiss: () => resolve(null) });
      load();
      if (mode === 'new') nameField.focus();
    });
  }

  return { h, icon, makeHost, request, toast, duplicateAlert, folderSheet };
})();
