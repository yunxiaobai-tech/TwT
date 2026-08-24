/* TwT 作品缓存 addon（重写版）
 * 行为：
 *  - 打开新标签页（新窗口）时，若本地有正在制作、尚未保存的缓存作品，
 *    不再从空白作品开始，而是自动恢复（单个）或在打开前让你选择（多个）。
 *  - 正在编辑的作品按标签页（sessionStorage）持续缓存进 IndexedDB，
 *    每个标签页对应一个作品，可同时制作多个项目。
 *
 * 关键设计：只有「真正发生过编辑」的作品才会写入缓存（dirty 标记 + 启动宽限期），
 * 因此不会出现「删除全部后瞬间又冒出空白占位条目」的问题，缓存随时可被彻底清空。
 */
export default async function ({ addon, console }) {
  const redux = addon.tab.redux;
  if (!redux || !redux.state) {
    return console.warn('[TwT 作品缓存] Redux 不可用');
  }
  redux.initialize();

  const SID_KEY = 'twt_cache_sid';
  const DB_NAME = 'twt_project_cache';
  const STORE = 'projects';
  const TITLE_ACTION = 'projectTitle/SET_PROJECT_TITLE';
  const GRACE_MS = 1500; // 启动/恢复后忽略初始化噪声 statechange 的宽限期

  // ---------- scratchClass shorthand ----------
  const sc = (...args) => addon.tab.scratchClass(...args);

  // ---------- IndexedDB ----------
  const promisify = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  let _db = null;
  const openDB = () => {
    if (_db) return _db;
    _db = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _db;
  };
  const withStore = (mode) => openDB().then((db) =>
    db.transaction(STORE, mode).objectStore(STORE));
  const putEntry = (rec) => withStore('readwrite').then((s) => promisify(s.put(rec)));
  const allEntries = () => withStore('readonly')
    .then((s) => promisify(s.getAll()))
    .then((r) => r || []);
  const deleteEntry = (id) => withStore('readwrite').then((s) => promisify(s.delete(id)));

  // ---------- helpers ----------
  const getVM = () => {
    const s = redux.state.scratchGui;
    return s && s.vm;
  };
  const isEditor = () => {
    const m = redux.state.scratchGui && redux.state.scratchGui.mode;
    return !!(m && !m.isPlayerOnly && !m.isEmbedded);
  };
  const urlHasProject = () => {
    const q = (location.search || '').toLowerCase();
    return q.includes('project_url') || q.includes('project_id') ||
      q.includes('project=') || q.includes('sb3') || q.includes('edit');
  };
  const newId = () => (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 't' + Date.now() + Math.random().toString(16).slice(2);

  let sessionId = sessionStorage.getItem(SID_KEY) || null;
  let decided = false;
  let initStarted = false;
  let dirty = false;        // 当前作品是否被真正编辑过（脏标记）
  let readyAt = 0;          // 宽限期截止时间戳
  let timer = null;
  let interval = null;

  const saveCurrent = async () => {
    if (!isEditor()) return;
    const vm = getVM();
    if (!vm) return;
    let sb3;
    try {
      sb3 = await vm.saveProjectSb3('uint8array');
    } catch (e) {
      return console.warn('[TwT 作品缓存] 保存失败', e);
    }
    if (!sb3) return;
    const title = (redux.state.scratchGui.projectTitle || '未命名作品').toString();
    try {
      await putEntry({
        id: sessionId,
        name: title,
        updatedAt: Date.now(),
        size: sb3.length,
        project: sb3
      });
      dirty = false;
    } catch (e) {
      console.warn('[TwT 作品缓存] 写入失败', e);
    }
  };

  const loadIntoVm = async (buf, name) => {
    const vm = getVM();
    if (!vm) return;
    try {
      await vm.loadProject(buf);
      if (name) redux.dispatch({ type: TITLE_ACTION, title: name });
    } catch (e) {
      console.warn('[TwT 作品缓存] 加载失败', e);
    }
  };

  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { saveCurrent(); }, 4000);
  };

  // 标记脏 + 防抖保存（宽限期内忽略初始化噪声，避免把空白默认作品存进去）
  const markDirty = () => {
    if (Date.now() < readyAt) return;
    dirty = true;
    scheduleSave();
  };

  const decide = () => {
    if (decided) return;
    decided = true;
    readyAt = Date.now() + GRACE_MS;
    // 每个标签页都分配独立的缓存槽位（不复用恢复条目的 id），
    // 这样同时编辑多个作品时它们会并存、互不覆盖，选择弹窗才能列出全部。
    sessionId = newId();
    sessionStorage.setItem(SID_KEY, sessionId);
    // 只有脏了才落盘：周期性 + 关页前
    if (interval) clearInterval(interval);
    interval = setInterval(() => { if (dirty) saveCurrent(); }, 30000);
    window.addEventListener('beforeunload', () => { if (dirty) saveCurrent(); });
  };

  // ---------- picker UI — 使用 TwT 原生模态框 ----------
  const showPicker = (entries, { onPick, onNew }) => {
    // 内容完全相同的作品去重：只保留每个「副本组」中最近的一条，其余从缓存删除，
    // 避免选择弹窗里出现多个一模一样的选项。
    const sameProject = (a, b) => {
      if (!a || !b || a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    };
    const unique = [];
    for (const e of entries) {
      const dup = unique.find((u) => sameProject(u.project, e.project));
      if (dup) {
        if (e.updatedAt > dup.updatedAt) {
          deleteEntry(dup.id);              // 删除较旧的重复
          unique[unique.indexOf(dup)] = e; // 换成较新的
        } else {
          deleteEntry(e.id);               // 删除当前这条重复
        }
      } else {
        unique.push(e);
      }
    }
    entries = unique;

    // 主题检测：据此切换亮色模式下的浅灰底色；选项悬停仅加深灰，垃圾桶保持原样
    const cs = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-scheme').trim();
    const light = cs === 'light' ||
      (cs !== 'dark' && redux.state.scratchGui &&
        redux.state.scratchGui.theme &&
        redux.state.scratchGui.theme.theme &&
        redux.state.scratchGui.theme.theme.isDark &&
        redux.state.scratchGui.theme.theme.isDark() === false);
    const THEME_COLOR = 'var(--looks-secondary)';
    // 亮色模式：选项底色用浅灰（略暗），悬停时仅「加深灰色」，不直接改为主题色
    const optBaseBg = light ? 'rgba(0,0,0,0.10)' : 'var(--ui-primary, rgba(255,255,255,0.06))';
    const optHoverBg = light ? 'rgba(0,0,0,0.16)' : 'var(--ui-tertiary, rgba(255,255,255,0.10))';
    // 删除（垃圾桶）图标：亮色模式初始为深灰，悬停变主题色；暗色用 text-secondary
    const trashBaseColor = light ? '#555555' : 'var(--text-secondary, #bbb)';

    entries.sort((a, b) => b.updatedAt - a.updatedAt);

    const m = addon.tab.createModal('恢复缓存中的作品', { isOpen: true });

    // 正方形窗口：同时锁 width + height（.modal-content 默认无 width，会被内容撑开）
    // 圆角对齐「个性化」窗口：border-radius = $form-radius = calc($space/2) = 0.25rem
    const c = m.container;
    c.style.cssText += ';width:420px!important;height:420px!important;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;border-radius:0.25rem!important;';
    const mc = m.content;
    mc.style.cssText += ';flex:1 1 auto;display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:1.25rem 1.5rem;';

    // 副标题
    const sub = document.createElement('div');
    sub.className = sc('prompt_label');
    sub.style.marginBottom = '1rem';
    sub.style.textAlign = 'center';
    sub.style.fontSize = '.85rem';
    sub.style.fontWeight = 'normal';
    sub.style.opacity = '0.75';
    sub.textContent = '检测到你正在制作的未保存作品，打开前先选一个';
    mc.appendChild(sub);

    // 列表容器（flex 填满中间，超出内部滚动）
    const list = document.createElement('div');
    Object.assign(list.style, {
      flex: '1 1 auto',
      minHeight: '0',
      overflowY: 'auto',
      marginBottom: '0.75rem'
    });
    mc.appendChild(list);

    const refreshAfterDelete = async (id, item) => {
      await deleteEntry(id);
      item.remove();
      if (list.children.length === 0) {
        m.remove();
        onNew();
      }
    };

    entries.forEach((e, i) => {
      const item = document.createElement('div');
      item.className = 'twt-cache-item';
      Object.assign(item.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.7rem 0.9rem',
        marginBottom: '0.4rem',
        borderRadius: '0.25rem',
        background: optBaseBg,
        border: '1px solid var(--ui-border-transparent, rgba(0,0,0,0.12))',
        cursor: 'pointer',
        transition: 'background 0.15s ease'
      });
      item.addEventListener('mouseenter', () => {
        item.style.background = optHoverBg;
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = optBaseBg;
      });

      // 左侧：名称 + 元信息
      const info = document.createElement('div');
      info.style.flex = '1';
      info.style.minWidth = '0';
      info.style.paddingRight = '0.5rem';
      const nameEl = document.createElement('div');
      nameEl.style.fontWeight = '500';
      nameEl.style.fontSize = '0.9rem';
      nameEl.style.whiteSpace = 'nowrap';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.textContent = e.name || '未命名作品';
      info.appendChild(nameEl);

      const when = new Date(e.updatedAt).toLocaleString();
      const size = e.size ? (e.size / 1024).toFixed(0) + ' KB' : '';
      const meta = [when, size, i === 0 ? '最近编辑' : ''].filter(Boolean).join(' · ');
      const metaEl = document.createElement('div');
      metaEl.style.fontSize = '0.78rem';
      metaEl.style.opacity = '0.55';
      metaEl.style.marginTop = '2px';
      metaEl.style.whiteSpace = 'nowrap';
      metaEl.style.overflow = 'hidden';
      metaEl.style.textOverflow = 'ellipsis';
      metaEl.textContent = meta;
      info.appendChild(metaEl);
      item.appendChild(info);

      // 右侧：操作按钮组
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '0.4rem';
      actions.style.flexShrink = '0';

      const openBtn = document.createElement('button');
      openBtn.className = i === 0 ? sc('prompt_ok-button') : sc('prompt_cancel-button');
      openBtn.textContent = i === 0 ? '继续制作' : '打开';
      openBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        m.remove();
        onPick(e);
      });
      actions.appendChild(openBtn);

      // 每个条目都可删除（含"最近编辑"那条），否则缓存永远清不空。
      // 删除按钮改为垃圾桶图标：亮色模式下为浅灰，悬停变为当前主题色。
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.setAttribute('aria-label', '删除');
      delBtn.title = '删除';
      delBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="3 6 5 6 21 6"></polyline>' +
        '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
        '<line x1="10" y1="11" x2="10" y2="17"></line>' +
        '<line x1="14" y1="11" x2="14" y2="17"></line>' +
        '</svg>';
      Object.assign(delBtn.style, {
        background: 'transparent',
        color: trashBaseColor,
        border: 'none',
        padding: '0.3rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'color 0.15s ease'
      });
      delBtn.addEventListener('mouseenter', () => { delBtn.style.color = THEME_COLOR; });
      delBtn.addEventListener('mouseleave', () => { delBtn.style.color = trashBaseColor; });
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        refreshAfterDelete(e.id, item);
      });
      actions.appendChild(delBtn);

      item.appendChild(actions);
      list.appendChild(item);
    });

    // 底部：新建空白作品
    const btnRow = document.createElement('div');
    btnRow.className = sc('prompt_button-row');
    const nb = document.createElement('button');
    nb.className = sc('prompt_ok-button'); // 跟随主题色（--looks-secondary）
    nb.textContent = '新建空白作品';
    nb.addEventListener('click', () => { m.remove(); onNew(); });
    btnRow.appendChild(nb);
    mc.appendChild(btnRow);

    // 点遮罩 / ✕ → 走新建
    m.backdrop.addEventListener('click', () => { m.remove(); onNew(); });
    m.closeButton.addEventListener('click', () => { m.remove(); onNew(); });
  };

  // ---------- init ----------
  const init = async () => {
    if (initStarted || decided) return;
    if (!isEditor()) return;
    const vm = getVM();
    if (!vm) return;
    initStarted = true;

    // 明确打开了某个作品（分享链接/导入文件）：不干预，也不写缓存
    if (urlHasProject()) return;

    let entries = [];
    try {
      entries = await allEntries();
    } catch (e) {
      console.warn('[TwT 作品缓存] 读取失败', e);
    }

    if (entries.length === 0) {
      // 无任何缓存 → 干净空白起步，启动自动缓存
      decide();
      return;
    }

    // 只要有缓存作品（1 个或多个）→ 一律弹出选择框，
    // 避免「只有 1 个时静默自动恢复」导致选择弹窗看起来「消失」。
    showPicker(entries, {
      onPick: async (entry) => {
        // 恢复作品时不再占用原条目 id，而是让本标签拿到独立新槽位，
        // 原缓存条目保留 → 多个作品并存、选择弹窗能列出全部。
        await loadIntoVm(entry.project, entry.name);
        decide();
      },
      onNew: () => { decide(); } // 不立刻落盘，缓存保持干净直到真正编辑
    });
  };

  redux.addEventListener('statechanged', () => {
    if (!decided) { init(); return; }
    markDirty();
  });
  init();
}
