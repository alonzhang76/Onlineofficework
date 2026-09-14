/* ===== CloudBase 云存储文件中心（共享版 cfb.js）=====
 * 被 orderschedule / wicketorders / wage 三个应用共用，功能一致：
 *   1) 分区域上传：图片 / PDF / Excel / Word / PPT / 其他
 *   2) 文件管理器：左树右列表、新建/重命名/删除/移动(拖拽)/预览/下载/
 *      全局搜索（云端全部文件）/排序/视图切换、整页拖放上传
 *   3) 跨应用实时同步：任一应用增删改后，另外两个应用的云存储标签页
 *      自动刷新（BroadcastChannel + localStorage storage 事件双通道）
 *
 * ★ 存储共享：三个应用共用同一个云端根目录（CB_ROOT，沿用 'orderschedule'
 *   前缀以保持历史文件可见），在任一应用上传/删除的文件对三个应用同时可见。
 *
 * 宿主接入方式：
 *   <link rel="stylesheet" href="../cloudbase/cfb.css">
 *   <script>window.CFB_CONFIG = { app: 'wage', toast: fn };</script>
 *   <script src="../cloudbase/cfb.js"></script>
 *   页面中放置容器：<div id="cloudfiles" data-cfb-host></div>
 *   界面由本脚本自动注入；切换到该容器可见时自动初始化/刷新。
 */
(function () {
  'use strict';

  // ===== 配置 =====
  var CFG = window.CFB_CONFIG || {};
  // 三应用共享的云端根目录（加在所有云端路径前，实现"一处修改、三处可见"）
  var CB_ROOT = CFG.root || 'orderschedule';
  // 本应用标识（同步消息里用于忽略自己发出的通知）
  var APP_ID = CFG.app || 'app';

  // ===== 分区定义 =====
  var ZONES = [
    { key:'image', icon:'🖼️', name:'图片',   folder:'图片文件',  accept:'image/jpeg,image/png,image/gif,image/webp,image/bmp,image/svg+xml', exts:['jpg','jpeg','png','gif','webp','bmp','svg'], cls:'zimg',   extText:'jpg / png / gif / webp / bmp / svg' },
    { key:'pdf',   icon:'📄', name:'PDF',    folder:'PDF 文件',  accept:'application/pdf,.pdf',          exts:['pdf'],                 cls:'zpdf',   extText:'pdf' },
    { key:'excel', icon:'📊', name:'Excel',  folder:'Excel 表格', accept:'.xlsx,.xls,.xlsm,.csv',        exts:['xlsx','xls','xlsm','csv'], cls:'zexcel', extText:'xlsx / xls / csv' },
    { key:'word',  icon:'📝', name:'Word',   folder:'Word 文档', accept:'.doc,.docx',                    exts:['doc','docx'],          cls:'zword',  extText:'doc / docx' },
    { key:'ppt',   icon:'📽️', name:'PPT',    folder:'PPT 演示',  accept:'.ppt,.pptx',                    exts:['ppt','pptx'],          cls:'zppt',   extText:'ppt / pptx' },
    { key:'other', icon:'📎', name:'其他',   folder:'其他文件',  accept:'',                              exts:null,                    cls:'zother', extText:'任意格式' },
  ];
  var IMAGE_EXTS = ['jpg','jpeg','png','gif','webp','bmp','svg'];
  var FOLDER_ICON = { '图片文件':'🖼️', 'PDF 文件':'📄', 'Excel 表格':'📊', 'Word 文档':'📝', 'PPT 演示':'📽️', '其他文件':'📎', '上传文件夹':'📁' };

  // ===== 轻量 UI 适配层（兼容三种宿主应用）=====
  function escHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }
  function stripHtml(html) {
    var div = document.createElement('div');
    div.innerHTML = String(html || '');
    return div.textContent || '';
  }

  // 内置兜底 toast（宿主未提供 toast 时使用）
  function fallbackToast(msg, type, dur) {
    try {
      var host = document.getElementById('cloudfiles') || document.body;
      var el = document.createElement('div');
      el.className = 'cfb-toast';
      var colors = { success:'#16a34a', error:'#dc2626', warning:'#d97706', info:'#2563eb' };
      el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:10000;'
        + 'background:' + (colors[type] || colors.success) + ';color:#fff;padding:10px 18px;border-radius:8px;'
        + 'font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.2);max-width:86vw;word-break:break-all;';
      el.textContent = String(msg || '');
      host.appendChild(el);
      setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, dur || 2600);
    } catch (_e) { try { alert(msg); } catch (_e2) {} }
  }

  var App = {
    toast: function(msg, type, dur) {
      var f = (CFG && typeof CFG.toast === 'function') ? CFG.toast
        : (typeof window.showToast === 'function' ? window.showToast : null);
      if (f) { try { f(msg, type, dur); return; } catch (_e) {} }
      fallbackToast(msg, type, dur);
    },
    confirm: function(msgHtml, cb) { if (window.confirm(stripHtml(msgHtml))) cb(); },
    confirmAsync: function(msgHtml) { return Promise.resolve(window.confirm(stripHtml(msgHtml))); },
    utils: { escapeHtml: escHtml },
    // 自包含模态（不依赖宿主样式；挂到 #cloudfiles 内以复用 scoped .btn/.form-input）
    modal: (function () {
      var cur = null;
      function close() { if (cur) { cur.remove(); cur = null; } }
      function open(opts) {
        close();
        var ov = document.createElement('div');
        ov.className = 'cfb-modal-overlay';
        ov.innerHTML = '<div class="cfb-modal-box">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
          + '<h2>' + escHtml(opts.title || '') + '</h2>'
          + '<button class="pv-x" style="position:static;" title="关闭">×</button></div>'
          + '<div>' + (opts.body || '') + '</div>'
          + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">' + (opts.footer || '') + '</div></div>';
        var host = document.getElementById('cloudfiles') || document.body;
        host.appendChild(ov);
        cur = ov;
        ov.querySelector('.pv-x').addEventListener('click', close);
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
        return ov;
      }
      return { open: open, close: close };
    })(),
  };

  // ===== 界面模板（注入宿主容器）=====
  var TEMPLATE =
    '<!-- 分区域上传 -->'
    + '<div class="card" id="uploadCard" style="margin-bottom:12px;">'
    +   '<div class="card-header"><span class="card-title">📤 分区域上传</span></div>'
    +   '<div class="cfb-zones" id="cfbZones"></div>'
    +   '<input type="file" id="cfbPicker" multiple style="display:none;">'
    +   '<input type="file" id="cfbFolderPicker" webkitdirectory directory multiple style="display:none;">'
    + '</div>'
    + '<!-- 文件管理器 -->'
    + '<div class="card">'
    +   '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
    +     '<span class="card-title">🗂️ 云端文件管理</span>'
    +     '<span style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'
    +       '<span id="writeBtns" style="display:none;">'
    +         '<button class="btn btn-sm" onclick="CFB.mkDir()" title="在当前目录新建文件夹">📂新建文件夹</button>'
    +         '<button class="btn btn-sm" onclick="CFB.pickUpload()" title="上传一个或多个文件到当前目录">📄上传文件</button>'
    +         '<button class="btn btn-sm" onclick="CFB.pickFolderUpload()" title="上传整个文件夹（保留目录结构）">📁上传文件夹</button>'
    +         '<button class="btn btn-sm" onclick="CFB.refresh()" title="重新加载当前目录">🔄刷新</button>'
    +       '</span>'
    +       '<span id="viewOnlyBtns" style="display:none;">'
    +         '<button class="btn btn-sm" onclick="CFB.refresh()" title="重新加载当前目录">🔄刷新</button>'
    +       '</span>'
    +       '<span id="viewSwitch">'
    +         '<button class="btn btn-sm" data-view="details" onclick="CFB.setViewMode(\'details\')" title="详细信息">☰</button>'
    +         '<button class="btn btn-sm" data-view="grid" onclick="CFB.setViewMode(\'grid\')" title="大图标">🔲</button>'
    +       '</span>'
    +       '<input type="text" id="cfbSearch" placeholder="搜索云端全部文件…" oninput="CFB.onSearchInput(this.value)"'
    +         ' style="width:190px;padding:4px 8px;border:1px solid var(--cfb-border);border-radius:6px;font-size:12px;">'
    +     '</span>'
    +   '</div>'
    +   '<div style="padding:0 14px 14px;">'
    +     '<div class="cfb-progress" id="cfbProgress"><div id="cfbProgressBar"></div></div>'
    +     '<div class="cfb-topbar">'
    +       '<span class="cfb-status"><span id="connStatus"><span class="status-dot"></span>正在初始化…</span></span>'
    +     '</div>'
    +     '<div class="cfb-chips" id="cfbChips"></div>'
    +     '<div class="cfb-breadcrumb" id="breadcrumb"></div>'
    +     '<div class="cfb-explorer">'
    +       '<div class="cfb-tree" id="treeHost"></div>'
    +       '<div class="cfb-content" id="dropZone">'
    +         '<div class="cfb-inner" id="fileListArea"><div class="cfb-loading">正在加载…</div></div>'
    +       '</div>'
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<!-- 拖放遮罩 -->'
    + '<div class="cfb-dropmask" id="cfbDropMask">'
    +   '<div class="inner">'
    +     '<div style="font-size:44px;margin-bottom:6px;">⬆️</div>'
    +     '<div>释放以上传文件到：<b id="cfbDropTarget">当前目录</b></div>'
    +     '<div class="sub">支持多文件与整个文件夹（保留目录结构）</div>'
    +   '</div>'
    + '</div>'
    + '<!-- 预览模态 -->'
    + '<div class="cfb-preview" id="cfbPreview" onclick="if(event.target===this)CFB.closePreview()">'
    +   '<div class="pv-box">'
    +     '<button class="pv-x" onclick="CFB.closePreview()">×</button>'
    +     '<div id="pvBody"></div>'
    +     '<div class="pv-cap" id="pvCap"></div>'
    +   '</div>'
    + '</div>';

  // 注入界面（幂等）
  function ensureDom() {
    var host = document.querySelector('[data-cfb-host]') || document.getElementById('cloudfiles');
    if (!host) return null;
    if (host.getAttribute('data-cfb-ready') !== '1') {
      host.innerHTML = TEMPLATE;
      host.setAttribute('data-cfb-ready', '1');
    }
    return host;
  }

  var CFB = {
    // ===== 内部状态 =====
    currentPath: '/',
    entries: [],
    loading: false,
    canWrite: false,
    sortBy: 'name',        // name | size | date
    sortAsc: true,
    viewMode: 'details',
    searchQ: '',
    // 树缓存：logicPath -> { open, loaded, folders:[{name, path}] }
    treeCache: {},
    // signed URL 缓存
    urlCache: {},
    // 内部拖拽（移动文件/文件夹）
    _dragging: null,
    // 正在上传数（用于分区卡片忙碌态）
    _zoneBusy: {},
    // 全局搜索索引 { ts, files:[], folders:[], truncated }
    _index: null,
    _indexPromise: null,
    _indexStale: false,
    _indexRun: 0,

    // ===== 初始化 =====
    init: async function () {
      var self = this;
      // 三应用均以共享账号/邮箱登录（authenticated），具备读写权限
      self.canWrite = (typeof CFG.canWrite === 'boolean') ? CFG.canWrite : true;

      var wb = document.getElementById('writeBtns');
      var vb = document.getElementById('viewOnlyBtns');
      if (wb) wb.style.display = self.canWrite ? 'inline-flex' : 'none';
      if (vb) vb.style.display = self.canWrite ? 'none' : 'inline-flex';

      self._renderZones();
      self._bindGlobalDnD();
      self._bindRowActions();
      self._restoreView();

      // 等待 CloudBase 兼容层（cloudbase-sync.js / cloudbase.js 模块异步加载）
      var ready = await self._waitSb(12000);
      if (!ready) {
        self.setStatus('err', 'CloudBase 存储未就绪，请检查网络后刷新重试');
        document.getElementById('fileListArea').innerHTML =
          '<div class="cfb-empty"><div class="eico">📡</div><div>CloudBase 存储连接失败</div>'
          + '<div style="font-size:12px;">请确认网络可访问 static.cloudbase.net，然后刷新页面</div></div>';
        return;
      }
      self._sbReady = true;
      self.setStatus('ok', 'CloudBase 云存储已连接');
      self.refresh();
      self.renderTree();
      self._startSync();
    },

    _waitSb: function (timeoutMs) {
      timeoutMs = timeoutMs || 10000;
      return new Promise(function (resolve) {
        var finished = false;
        function finish(v) { if (finished) return; finished = true; resolve(v); }
        var t0 = Date.now();
        // 1) 等 window.supabase（兼容层模块异步加载）
        var tm = setInterval(function () {
          var sb = window.supabase;
          if (sb && sb.storage && typeof sb.storage.from === 'function') {
            clearInterval(tm);
            // 2) 再等登录引导结束（无 token 时列目录必失败）
            var when = window.CloudbaseWhenReady;
            if (typeof when !== 'function') return finish(true);
            var watchdog = setTimeout(function () { finish(true); }, timeoutMs);
            when().then(
              function () { clearTimeout(watchdog); finish(true); },
              function () { clearTimeout(watchdog); finish(true); }
            );
          } else if (Date.now() - t0 > timeoutMs) {
            clearInterval(tm);
            finish(false);
          }
        }, 100);
      });
    },

    // ===== 存储层（★ 所有云端路径自动加 CB_ROOT 前缀 → 三应用共享同一目录）=====
    _st: function () {
      var bucket = window.STORAGE_BUCKET || 'app-photos';
      var ref = window.supabase.storage.from(bucket);
      function key(p) {
        p = String(p == null ? '' : p).replace(/^\/+/, '');
        return (p === CB_ROOT || p.indexOf(CB_ROOT + '/') === 0) ? p : (CB_ROOT + '/' + p);
      }
      function keys(a) { return (Array.isArray(a) ? a : [a]).map(key); }
      return {
        upload: function (p, f, o) { return ref.upload(key(p), f, o || {}); },
        list: function (prefix, opts) { return ref.list(key(prefix), opts || {}); },
        createSignedUrl: function (p, e) { return ref.createSignedUrl(key(p), e); },
        createSignedUrls: function (ps, e) { return ref.createSignedUrls(keys(ps), e); },
        remove: function (ps) { return ref.remove(keys(ps)); },
        download: function (p) { return ref.download(key(p)); },
        getPublicUrl: function (p) { return ref.getPublicUrl(key(p)); },
      };
    },

    setStatus: function (kind, text) {
      var el = document.getElementById('connStatus');
      if (!el) return;
      var cls = kind === 'ok' ? 'ok' : (kind === 'err' ? 'err' : 'warn');
      el.innerHTML = '<span class="status-dot ' + cls + '"></span>' + App.utils.escapeHtml(text);
    },

    // ===== 路径工具 =====
    _escJs: function (s) {
      return App.utils.escapeHtml(String(s == null ? '' : s)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'"))
        .replace(/"/g, '&quot;');
    },
    _norm: function (p) {
      p = String(p || '/').replace(/\\/g, '/').replace(/\/+/g, '/');
      if (p.charAt(0) !== '/') p = '/' + p;
      if (p.length > 1) p = p.replace(/\/+$/, '');
      return p || '/';
    },
    join: function (dir, name) {
      dir = this._norm(dir);
      name = String(name || '').replace(/^\/+|\/+$/g, '');
      if (dir === '/') return '/' + name;
      return dir + '/' + name;
    },
    nameOf: function (p) {
      p = this._norm(p);
      if (p === '/') return '/';
      return p.slice(p.lastIndexOf('/') + 1) || p;
    },
    parentOf: function (p) {
      p = this._norm(p);
      if (p === '/') return '/';
      var i = p.lastIndexOf('/');
      return i <= 0 ? '/' : p.slice(0, i);
    },
    _prefix: function (dir) {
      dir = this._norm(dir);
      return dir === '/' ? '' : dir.slice(1) + '/';
    },

    // ===== 列目录 =====
    listDir: async function (dir) {
      var prefix = this._prefix(dir);
      var r = await this._st().list(prefix, { limit: 1000 });
      if (r && r.error && prefix && r.error.code !== 'TCB_FUNCTION_NOT_FOUND') {
        var r2 = await this._st().list(prefix.replace(/\/+$/, ''), { limit: 1000 });
        if (r2 && !r2.error) r = r2;
      }
      // 登录态偶发失效 → 强制重登后重试一次（避免整页"列目录失败"直到手动刷新）
      if (r && r.error && window.CloudbaseForceReauth) {
        try {
          await window.CloudbaseForceReauth();
          var r3 = await this._st().list(prefix, { limit: 1000 });
          if (r3 && !r3.error) r = r3;
        } catch (_e) {}
      }
      if (r && r.error) return { list: [], error: r.error };
      var out = [];
      var arr = (r && r.data) || [];
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i] || {};
        var name = String(it.name || '').replace(/\/+$/, '');
        if (!name || name === '.keep') continue;
        var isFolder = it.type === 'folder';
        var size = 0, lm = '';
        try {
          var raw = it.raw || {};
          size = Number((it.metadata && it.metadata.size) || raw.size || raw.Size || 0) || 0;
          lm = raw.lastModified || raw.LastModified || raw.last_modified || '';
        } catch (_e) {}
        out.push({
          name: name,
          type: isFolder ? 'folder' : 'file',
          path: this.join(dir, name),
          size: size,
          lastModified: lm,
        });
      }
      var self = this, key = self.sortBy, asc = self.sortAsc;
      out.sort(function (a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        var c = 0;
        if (key === 'size') c = (a.size || 0) - (b.size || 0);
        else if (key === 'date') c = String(a.lastModified || '').localeCompare(String(b.lastModified || ''));
        else c = a.name.localeCompare(b.name, 'zh-CN');
        if (c === 0) c = a.name.localeCompare(b.name, 'zh-CN');
        return asc ? c : -c;
      });
      return { list: out, error: null };
    },

    refresh: async function () {
      if (this.loading) return;
      this.loading = true;
      var area = document.getElementById('fileListArea');
      area.innerHTML = '<div class="cfb-loading">正在加载目录…</div>';
      var r = await this.listDir(this.currentPath);
      this.loading = false;
      if (r.error) {
        var errMsg = r.error.message || String(r.error);
        this.setStatus('err', '列目录失败：' + errMsg);
        var icon = (r.error.code === 'TCB_FUNCTION_NOT_FOUND') ? '📦' : '⚠️';
        var tip = '';
        if (r.error.code === 'TCB_FUNCTION_NOT_FOUND') {
          tip = '<div style="font-size:12px;line-height:1.7;max-width:600px;">'
            + 'PG 模式云存储需要先创建 <b>Bucket</b> 并配置 RLS 策略，当前环境尚未就绪。<br>'
            + '请在 <b>云开发控制台 → 数据库 → SQL 编辑器</b> 执行部署包中 '
            + '<code>cloudbase-pg-setup.sql</code> 的 <b>第 7 节</b>（创建桶 app-photos 及读写策略）。<br>'
            + '执行成功后回到本页点「重试」即可；上传、下载、列表、删除全部走官方 Storage API，无需部署云函数。'
            + '</div>';
        } else {
          tip = '<div style="font-size:12px;">' + App.utils.escapeHtml(errMsg) + '</div>';
        }
        area.innerHTML = '<div class="cfb-empty"><div class="eico">' + icon + '</div><div>列目录失败</div>'
          + tip + '<button class="btn btn-sm" onclick="CFB.refresh()">🔄 重试</button></div>';
        return;
      }
      this.entries = r.list;
      var tc = this.treeCache[this.currentPath];
      if (tc) { tc.loaded = true; }
      this.renderBreadcrumb();
      // 搜索态下由全局搜索渲染结果（refresh 可能由写操作/同步触发，索引已失效）
      if (this.searchQ) { this._runSearch(); return; }
      this.renderList();
    },

    // ===== 面包屑 =====
    renderBreadcrumb: function () {
      var host = document.getElementById('breadcrumb');
      var path = this.currentPath;
      var html = '<a onclick="CFB.openDir(\'/\')">☁️ 根目录</a>';
      if (path !== '/') {
        var parts = path.slice(1).split('/');
        var acc = '';
        for (var i = 0; i < parts.length; i++) {
          acc += '/' + parts[i];
          var isLast = (i === parts.length - 1);
          if (isLast) html += '<span class="sep">›</span><span class="cur">' + App.utils.escapeHtml(parts[i]) + '</span>';
          else html += '<span class="sep">›</span><a onclick="CFB.openDir(\'' + this._escJs(acc) + '\')">' + App.utils.escapeHtml(parts[i]) + '</a>';
        }
      }
      var cnt = this.entries.length;
      html += '<span style="margin-left:auto;font-size:11.5px;color:#94a3b8;">' + cnt + ' 项</span>';
      host.innerHTML = html;
      var chips = '';
      for (var z = 0; z < ZONES.length; z++) {
        var fz = ZONES[z].folder;
        chips += '<span class="cfb-chip" onclick="CFB.openDir(\'' + this._escJs('/' + fz) + '\')">' + ZONES[z].icon + ' ' + fz + '</span>';
      }
      document.getElementById('cfbChips').innerHTML = chips;
    },

    openDir: function (p) {
      this.currentPath = this._norm(p);
      this.searchQ = '';
      var s = document.getElementById('cfbSearch'); if (s) s.value = '';
      this.refresh();
      this.renderTree();
    },

    // ===== 目录树 =====
    _loadTreeNode: async function (path) {
      var tc = this.treeCache[path];
      if (!tc) { tc = this.treeCache[path] = { open: false, loaded: false, folders: [] }; }
      if (tc.loaded) return tc;
      var r = await this.listDir(path);
      if (!r.error) {
        tc.folders = r.list.filter(function (x) { return x.type === 'folder'; })
          .map(function (x) { return { name: x.name, path: x.path }; });
        tc.loaded = true;
      }
      return tc;
    },
    toggleTreeNode: async function (path) {
      var tc = this.treeCache[path];
      if (!tc) tc = this.treeCache[path] = { open: false, loaded: false, folders: [] };
      if (!tc.loaded) await this._loadTreeNode(path);
      tc.open = !tc.open;
      this.renderTree();
    },
    renderTree: async function () {
      var self = this;
      await this._loadTreeNode('/');
      var html = '';
      function node(path, label, icon, depth) {
        var tc = self.treeCache[path] || { open: false, loaded: false, folders: [] };
        var active = self.currentPath === path ? ' active' : '';
        var tw = tc.open ? '▾' : '▸';
        var pEsc = self._escJs(path);
        return '<div class="cfb-tree-item' + active + '" data-treepath="' + App.utils.escapeHtml(path) + '" draggable="true" style="padding-left:' + (8 + depth * 14) + 'px;" onclick="CFB.openDir(\'' + pEsc + '\')">'
          + '<span class="tw" onclick="event.stopPropagation();CFB.toggleTreeNode(\'' + pEsc + '\')">' + tw + '</span>'
          + '<span>' + icon + '</span><span class="tn">' + App.utils.escapeHtml(label) + '</span></div>'
          + (tc.open ? '<div class="cfb-tree-children">' + (tc.folders || []).map(function (f) {
            return node(f.path, f.name, '📁', depth + 1);
          }).join('') + '</div>' : '');
      }
      html += node('/', '全部文件', '☁️', 0);
      for (var z = 0; z < ZONES.length; z++) {
        var zp = '/' + ZONES[z].folder;
        html += node(zp, ZONES[z].folder, ZONES[z].icon, 1);
      }
      document.getElementById('treeHost').innerHTML = html;
      self._bindTreeDnD();
    },

    // ===== 列表渲染 =====
    setViewMode: function (m) {
      this.viewMode = m;
      try { localStorage.setItem('cfb__viewMode', m); } catch (_e) {}
      this._highlightViewBtns();
      this.renderList();
    },
    _restoreView: function () {
      try { this.viewMode = localStorage.getItem('cfb__viewMode') || 'details'; } catch (_e) {}
      this._highlightViewBtns();
    },
    _highlightViewBtns: function () {
      var btns = document.querySelectorAll('#viewSwitch [data-view]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].style.background = btns[i].getAttribute('data-view') === this.viewMode ? 'var(--primary)' : '';
        btns[i].style.color = btns[i].getAttribute('data-view') === this.viewMode ? '#fff' : '';
      }
    },

    // ===== 全局搜索（云端全部文件）=====
    onSearchInput: function (v) {
      var self = this;
      this._searchRaw = v || '';
      if (this._searchTimer) clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(function () {
        self.searchQ = String(self._searchRaw || '');
        self._runSearch();
      }, 300);
    },

    // 递归扫描整个云端根目录建立索引（并发 4，上限 5000 项）
    _ensureIndex: function () {
      var self = this;
      if (this._indexPromise && !this._indexStale) return this._indexPromise;
      this._indexStale = false;
      this._indexRun++;
      var myRun = this._indexRun;
      this._indexPromise = (async function () {
        var files = [], folders = [];
        var queue = ['/'];
        var MAX_ITEMS = 5000, truncated = false;
        var area = document.getElementById('fileListArea');
        function note() {
          if (area) area.innerHTML = '<div class="cfb-loading">🔍 正在扫描云端文件索引…<br>'
            + '<span style="font-size:11px;">已发现 ' + (files.length + folders.length) + ' 项</span></div>';
        }
        while (queue.length) {
          if (myRun !== self._indexRun) return self._index || { files: files, folders: folders, truncated: truncated };
          var batch = queue.splice(0, 4);
          var results = await Promise.all(batch.map(function (d) { return self.listDir(d); }));
          for (var i = 0; i < results.length; i++) {
            var r = results[i];
            if (r.error) continue; // 单个目录失败不阻塞整体
            for (var j = 0; j < r.list.length; j++) {
              var it = r.list[j];
              if (it.type === 'folder') {
                folders.push({ name: it.name, path: it.path, dir: self.parentOf(it.path), type: 'folder', size: 0, lastModified: it.lastModified });
                queue.push(it.path);
              } else {
                files.push({ name: it.name, path: it.path, dir: self.parentOf(it.path), type: 'file', size: it.size, lastModified: it.lastModified });
              }
            }
          }
          if (files.length + folders.length >= MAX_ITEMS) { truncated = true; break; }
          note();
        }
        var index = { ts: Date.now(), files: files, folders: folders, truncated: truncated };
        self._index = index;
        return index;
      })();
      return this._indexPromise;
    },

    _invalidateIndex: function () {
      this._index = null;
      this._indexStale = true;
    },

    _runSearch: async function () {
      var q = this.searchQ.trim().toLowerCase();
      if (!q) { this.renderList(); return; }
      var index;
      try {
        index = await this._ensureIndex();
      } catch (e) {
        App.toast('全局搜索失败：' + ((e && e.message) || e), 'error');
        return;
      }
      // 扫描期间搜索词已变化 → 交给最新一次处理
      if (q !== this.searchQ.trim().toLowerCase()) return;

      var ql = q;
      var match = function (x) { return x.name.toLowerCase().indexOf(ql) >= 0; };
      var folders = index.folders.filter(match);
      var files = index.files.filter(match);
      folders.sort(function (a, b) { return a.path.localeCompare(b.path, 'zh-CN'); });
      files.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-CN'); });
      this._renderSearchResults(folders.concat(files), q, index);
    },

    _renderSearchResults: function (list, q, index) {
      var self = this;
      var area = document.getElementById('fileListArea');
      var MAX_SHOW = 200;
      var shown = list.slice(0, MAX_SHOW);
      if (!list.length) {
        area.innerHTML = '<div class="cfb-empty"><div class="eico">🗂️</div>'
          + '<div>云端全部文件中没有匹配「' + App.utils.escapeHtml(q) + '」的文件</div>'
          + '<div style="font-size:12px;">已扫描 ' + (index.files.length + index.folders.length) + ' 项'
          + (index.truncated ? '（已达扫描上限）' : '') + '</div></div>';
        return;
      }
      var rows = '';
      for (var i = 0; i < shown.length; i++) {
        var it = shown[i];
        var isFolder = it.type === 'folder';
        var icon = isFolder ? (FOLDER_ICON[it.name] || '📁') : self._iconOf(it.name);
        var pEsc = self._escJs(it.path);
        var nameCell;
        if (isFolder) {
          nameCell = '<span class="cfb-fico">' + icon + '</span>'
            + '<span class="cfb-name-txt" onclick="CFB.openDir(\'' + pEsc + '\')" title="打开文件夹">' + App.utils.escapeHtml(it.name) + '</span>';
        } else if (self._isImage(it.name)) {
          nameCell = '<img class="cfb-thumb" data-cfbthumb="' + App.utils.escapeHtml(it.path) + '" alt="">'
            + '<span class="cfb-name-txt" onclick="CFB.previewByPath(\'' + pEsc + '\')" title="点击预览">' + App.utils.escapeHtml(it.name) + '</span>';
        } else {
          nameCell = '<span class="cfb-fico">' + icon + '</span>'
            + '<span class="cfb-name-txt" onclick="CFB.previewByPath(\'' + pEsc + '\')">' + App.utils.escapeHtml(it.name) + '</span>';
        }
        rows += '<tr class="rowf" data-path="' + App.utils.escapeHtml(it.path) + '" data-type="' + it.type + '">'
          + '<td><div class="cfb-row-name">' + nameCell + '</div></td>'
          + '<td><span class="cfb-fpath" title="打开所在目录" onclick="CFB.openDir(\'' + self._escJs(it.dir) + '\')">' + App.utils.escapeHtml(it.dir) + '</span></td>'
          + '<td class="cfb-fmeta">' + (isFolder ? '文件夹' : self._fmtSize(it.size)) + '</td>'
          + '<td class="cfb-fmeta">' + (it.lastModified ? self._fmtTime(it.lastModified) : '—') + '</td>'
          + '<td><div class="cfb-ops">' + self._opsHtml(it) + '</div></td></tr>';
      }
      var more = list.length > MAX_SHOW
        ? '<div class="cfb-search-info">仅显示前 ' + MAX_SHOW + ' 条结果，请细化关键词</div>' : '';
      area.innerHTML = '<div class="cfb-search-info">🔍 全局搜索「<b>' + App.utils.escapeHtml(q) + '</b>」：共 <b>'
        + list.length + '</b> 个匹配（范围：云端全部文件，含子目录）</div>' + more
        + '<table class="cfb-table cfb-search-table"><thead><tr>'
        + '<th>名称</th><th>所在位置</th><th>大小</th><th>修改时间</th><th style="text-align:right;">操作</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table>';
      this._hydrateThumbs();
    },

    renderList: function () {
      var area = document.getElementById('fileListArea');
      var list = this.entries;
      if (!list.length) {
        area.innerHTML = '<div class="cfb-empty"><div class="eico">🗂️</div>'
          + '<div>此目录为空</div>'
          + (this.canWrite ? '<div style="font-size:12px;">可从上方分区域上传，或拖拽文件到页面任意位置</div>' : '') + '</div>';
        return;
      }
      if (this.viewMode === 'grid') area.innerHTML = this._renderGrid(list);
      else area.innerHTML = this._renderTable(list);
      this._hydrateThumbs();
    },

    _renderTable: function (list) {
      var self = this;
      function sortArrow(k) {
        if (self.sortBy !== k) return '';
        return self.sortAsc ? ' ↑' : ' ↓';
      }
      var rows = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var isFolder = it.type === 'folder';
        var icon = isFolder ? (FOLDER_ICON[it.name] || '📁') : self._iconOf(it.name);
        var pEsc = self._escJs(it.path);
        var nameCell;
        if (isFolder) {
          nameCell = '<span class="cfb-fico">' + icon + '</span>'
            + '<span class="cfb-name-txt" onclick="CFB.openDir(\'' + pEsc + '\')" title="打开文件夹">' + App.utils.escapeHtml(it.name) + '</span>';
        } else if (self._isImage(it.name)) {
          nameCell = '<img class="cfb-thumb" data-cfbthumb="' + App.utils.escapeHtml(it.path) + '" alt="">'
            + '<span class="cfb-name-txt" onclick="CFB.previewByPath(\'' + pEsc + '\')" title="点击预览">' + App.utils.escapeHtml(it.name) + '</span>';
        } else {
          nameCell = '<span class="cfb-fico">' + icon + '</span>'
            + '<span class="cfb-name-txt" onclick="CFB.previewByPath(\'' + pEsc + '\')">' + App.utils.escapeHtml(it.name) + '</span>';
        }
        var ops = self._opsHtml(it);
        rows += '<tr class="rowf" draggable="' + (self.canWrite ? 'true' : 'false') + '" data-path="' + App.utils.escapeHtml(it.path) + '" data-type="' + it.type + '">'
          + '<td><div class="cfb-row-name">' + nameCell + '</div></td>'
          + '<td class="cfb-fmeta">' + (isFolder ? '文件夹' : self._typeName(it.name)) + '</td>'
          + '<td class="cfb-fmeta">' + (isFolder ? '—' : self._fmtSize(it.size)) + '</td>'
          + '<td class="cfb-fmeta">' + (it.lastModified ? self._fmtTime(it.lastModified) : '—') + '</td>'
          + '<td><div class="cfb-ops">' + ops + '</div></td></tr>';
      }
      return '<table class="cfb-table"><thead><tr>'
        + '<th class="sortable" data-sort="name" onclick="CFB.sortByCol(\'name\')">名称' + sortArrow('name') + '</th>'
        + '<th>类型</th>'
        + '<th class="sortable" data-sort="size" onclick="CFB.sortByCol(\'size\')">大小' + sortArrow('size') + '</th>'
        + '<th class="sortable" data-sort="date" onclick="CFB.sortByCol(\'date\')">修改时间' + sortArrow('date') + '</th>'
        + '<th style="text-align:right;">操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
    },

    _renderGrid: function (list) {
      var self = this;
      var cards = '';
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        var isFolder = it.type === 'folder';
        var icon = isFolder ? (FOLDER_ICON[it.name] || '📁') : self._iconOf(it.name);
        var pEsc = self._escJs(it.path);
        var openAct = isFolder
          ? ' onclick="CFB.openDir(\'' + pEsc + '\')"'
          : ' onclick="CFB.previewByPath(\'' + pEsc + '\')"';
        var visual = isFolder
          ? '<div class="ci">' + icon + '</div>'
          : (self._isImage(it.name)
            ? '<img class="cv" data-cfbthumb="' + App.utils.escapeHtml(it.path) + '" alt="">'
            : '<div class="ci">' + icon + '</div>');
        cards += '<div class="cfb-card"' + openAct + ' draggable="' + (self.canWrite ? 'true' : 'false') + '" data-path="' + App.utils.escapeHtml(it.path) + '" data-type="' + it.type + '">'
          + '<span class="cops">' + self._opsHtml(it) + '</span>' + visual
          + '<div class="cn" title="' + App.utils.escapeHtml(it.name) + '">' + App.utils.escapeHtml(it.name) + '</div>'
          + '<div class="cs">' + (isFolder ? '文件夹' : self._fmtSize(it.size)) + '</div></div>';
      }
      return '<div class="cfb-grid">' + cards + '</div>';
    },

    _opsHtml: function (it) {
      var self = this;
      var isFolder = it.type === 'folder';
      var pEsc = self._escJs(it.path);
      var h = '';
      if (isFolder) {
        h += '<button class="btn btn-xs" title="打开" onclick="event.stopPropagation();CFB.openDir(\'' + pEsc + '\')">📂</button>';
      } else {
        h += '<button class="btn btn-xs" title="预览" onclick="event.stopPropagation();CFB.previewByPath(\'' + pEsc + '\')">👁</button>';
        h += '<button class="btn btn-xs" title="下载" onclick="event.stopPropagation();CFB.download(\'' + pEsc + '\')">⬇</button>';
      }
      if (self.canWrite) {
        h += '<button class="btn btn-xs" title="重命名（可跨目录移动，如 docs/a.pdf → /GW27-003/a.pdf）" onclick="event.stopPropagation();CFB.renameDlg(\'' + pEsc + '\',\'' + (isFolder ? 'folder' : 'file') + '\')">✏️</button>';
        h += '<button class="btn btn-xs" title="删除" onclick="event.stopPropagation();CFB.deleteDlg(\'' + pEsc + '\',\'' + (isFolder ? 'folder' : 'file') + '\')" style="color:#ef4444;border-color:#fecaca;">🗑</button>';
      }
      return h;
    },

    _hydrateThumbs: async function () {
      var imgs = document.querySelectorAll('img[data-cfbthumb]');
      for (var i = 0; i < imgs.length; i++) {
        var el = imgs[i];
        var p = el.getAttribute('data-cfbthumb');
        var url = await this._signed(p, 1800);
        if (url) { el.src = url; el.classList.add('show'); }
      }
    },

    sortByCol: function (k) {
      if (this.sortBy === k) this.sortAsc = !this.sortAsc;
      else { this.sortBy = k; this.sortAsc = true; }
      var key = k, asc = this.sortAsc;
      this.entries.sort(function (a, b) {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        var c = 0;
        if (key === 'size') c = (a.size || 0) - (b.size || 0);
        else if (key === 'date') c = String(a.lastModified || '').localeCompare(String(b.lastModified || ''));
        else c = a.name.localeCompare(b.name, 'zh-CN');
        if (c === 0) c = a.name.localeCompare(b.name, 'zh-CN');
        return asc ? c : -c;
      });
      this.renderList();
    },

    // ===== 增删改（CloudBase 无原生目录 API：mkdir 用 .keep 占位；移动/重命名 = 下载→重传→删除）=====
    mkDir: async function () {
      if (!this.canWrite) return App.toast('只读模式不可新建文件夹', 'warning');
      var self = this;
      this._nameDialog('新建文件夹', '', function (name) {
        name = String(name || '').trim().replace(/[\\:*?"<>|]/g, '_').replace(/^\/+|\/+$/g, '');
        if (!name) return;
        (async function () {
          var target = self.join(self.currentPath, name);
          try {
            var res = await self._st().upload(self.join(target, '.keep'), new Blob(['']), { contentType: 'text/plain', upsert: true });
            if (res && res.error) throw res.error;
            App.toast('✅ 文件夹已创建：' + name, 'success');
            self._afterWrite('mkdir');
          } catch (e) {
            console.error('[CFB] mkdir 失败:', e);
            App.toast('新建文件夹失败：' + ((e && e.message) || e), 'error');
          }
        })();
      });
    },

    renameDlg: function (p) {
      if (!this.canWrite) return App.toast('只读模式不可重命名', 'warning');
      var self = this;
      var oldName = this.nameOf(p);
      this._nameDialog('重命名 / 移动（可输入相对路径）', oldName, function (v) {
        var name = String(v || '').trim();
        if (!name || name === oldName) return;
        (async function () {
          var targetDir, newName;
          if (name.charAt(0) === '/') {
            var i2 = name.lastIndexOf('/');
            targetDir = i2 === 0 ? '/' : name.slice(0, i2);
            newName = name.slice(i2 + 1);
          } else {
            var i3 = name.lastIndexOf('/');
            if (i3 >= 0) { targetDir = self.join(self.currentPath, name.slice(0, i3)); newName = name.slice(i3 + 1); }
            else { targetDir = self.currentPath; newName = name; }
          }
          try {
            self.setProgress(50);
            await self._move(p, targetDir, newName);
            self.setProgress(null);
            App.toast('✅ 已重命名/移动', 'success');
            self._afterWrite('rename');
          } catch (e) {
            self.setProgress(null);
            console.error('[CFB] 重命名失败:', e);
            App.toast('重命名失败：' + ((e && e.message) || e), 'error');
          }
        })();
      });
    },

    deleteDlg: function (p, type) {
      if (!this.canWrite) return App.toast('只读模式不可删除', 'warning');
      var self = this;
      var msg = type === 'folder'
        ? '确定删除文件夹「' + App.utils.escapeHtml(this.nameOf(p)) + '」及其全部内容吗？此操作不可恢复！'
        : '确定删除文件「' + App.utils.escapeHtml(this.nameOf(p)) + '」吗？';
      App.confirm(msg, function () {
        (async function () {
          try {
            self.setProgress(30);
            if (type === 'folder') await self._deleteFolder(p);
            else {
              var r = await self._st().remove([p.slice(1)]);
              if (r && r.error) throw r.error;
            }
            self.setProgress(null);
            App.toast('🗑 已删除', 'success');
            self._afterWrite('delete');
          } catch (e) {
            self.setProgress(null);
            console.error('[CFB] 删除失败:', e);
            App.toast('删除失败：' + ((e && e.message) || e), 'error');
          }
        })();
      });
    },

    // 递归列出一个目录下所有文件（含子目录与 .keep）
    _walkAll: async function (dir) {
      var out = [];
      var self = this;
      var r = await this.listDir(dir);
      if (r.error) throw r.error;
      for (var i = 0; i < r.list.length; i++) {
        var it = r.list[i];
        if (it.type === 'folder') {
          var sub = await self._walkAll(it.path);
          out = out.concat(sub);
        } else {
          out.push(it.path);
        }
      }
      out.push(this.join(dir, '.keep'));
      return out;
    },

    _removeBestEffort: async function (paths) {
      for (var j = 0; j < paths.length; j += 40) {
        var batch = paths.slice(j, j + 40);
        var r = await this._st().remove(batch);
        if (r && r.error) {
          console.warn('[CFB] 批量删除报错，降级为逐个删除:', r.error.message || r.error);
          for (var k = 0; k < batch.length; k++) {
            try {
              var r1 = await this._st().remove([batch[k]]);
              if (r1 && r1.error) console.warn('[CFB] 单个删除失败(忽略):', batch[k], r1.error.message || r1.error);
            } catch (_e1) {}
          }
        }
        this.setProgress(Math.min(95, Math.round((j + batch.length) / paths.length * 100)));
      }
    },

    _deleteFolder: async function (dir) {
      var paths = await this._walkAll(dir);
      var seen = {}, uniq = [];
      for (var i = 0; i < paths.length; i++) {
        var p = paths[i].slice(1);
        if (!seen[p]) { seen[p] = 1; uniq.push(p); }
      }
      await this._removeBestEffort(uniq);
    },

    _move: async function (oldPath, targetDir, newName) {
      var self = this;
      oldPath = this._norm(oldPath);
      var newPath = this.join(targetDir, newName);
      if (oldPath === newPath) return;
      if (newPath.indexOf(oldPath + '/') === 0) throw new Error('不能把文件夹移动到其自身内部');

      var r = await this.listDir(this.parentOf(oldPath));
      if (r.error) throw r.error;
      var entry = r.list.find(function (x) { return x.name === self.nameOf(oldPath); });
      if (!entry) throw new Error('源不存在或已被删除');

      if (entry.type === 'file') {
        var blob = await this._fetchBlob(oldPath);
        var up = await this._st().upload(newPath.slice(1), blob, { contentType: this._guessMime(newName), upsert: true });
        if (up && up.error) throw up.error;
        var del = await this._st().remove([oldPath.slice(1)]);
        if (del && del.error) throw del.error;
      } else {
        var files = [];
        var rr = await this.listDir(oldPath);
        if (rr.error) throw rr.error;
        for (var i = 0; i < rr.list.length; i++) {
          var it = rr.list[i];
          if (it.type === 'folder') {
            await this._move(it.path, newPath, it.name);
          } else {
            files.push(it);
          }
        }
        for (var k = 0; k < files.length; k++) {
          var f = files[k];
          var npath = this.join(newPath, f.name);
          var blob2 = await this._fetchBlob(f.path);
          var up2 = await this._st().upload(npath.slice(1), blob2, { contentType: this._guessMime(f.name), upsert: true });
          if (up2 && up2.error) throw up2.error;
          var del2 = await this._st().remove([f.path.slice(1)]);
          if (del2 && del2.error) throw del2.error;
          this.setProgress(Math.min(95, Math.round((k + 1) / files.length * 100)));
        }
        try { await this._st().remove([oldPath.slice(1) + '/.keep']); } catch (_e) {}
      }
    },

    // ===== 下载 / 预览 =====
    _signed: async function (path, ttl) {
      var c = this.urlCache[path];
      var now = Date.now();
      if (c && c.exp > now) return c.url;
      var r = await this._st().createSignedUrl(path.slice(1), ttl || 7200);
      if (r && !r.error && r.data && r.data.signedUrl) {
        this.urlCache[path] = { url: r.data.signedUrl, exp: now + (ttl || 7200) * 1000 - 600000 };
        return r.data.signedUrl;
      }
      return null;
    },

    _fetchBlob: async function (path) {
      var url = await this._signed(path, 3600);
      if (url) {
        var resp = await fetch(url);
        if (resp.ok) return await resp.blob();
        throw new Error('下载失败 HTTP ' + resp.status);
      }
      var dr = await this._st().download(path.slice(1));
      if (dr && !dr.error && dr.data) {
        if (dr.data instanceof Blob) return dr.data;
        if (dr.data.fileContent instanceof Blob) return dr.data.fileContent;
      }
      throw new Error('无法获取文件下载地址');
    },

    download: async function (path) {
      try {
        this.setStatus('warn', '正在下载 ' + this.nameOf(path) + ' …');
        var blob = await this._fetchBlob(path);
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = this.nameOf(path);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        this.setStatus('ok', 'CloudBase 云存储已连接');
      } catch (e) {
        console.error('[CFB] 下载失败:', e);
        var u = await this._signed(path, 3600);
        if (u) window.open(u, '_blank');
        else App.toast('下载失败：' + ((e && e.message) || e), 'error');
        this.setStatus('ok', 'CloudBase 云存储已连接');
      }
    },

    previewByPath: async function (path) {
      var name = this.nameOf(path);
      var ext = this._extOf(name);
      if (IMAGE_EXTS.indexOf(ext) >= 0) {
        var url = await this._signed(path, 7200);
        if (!url) return App.toast('获取预览地址失败', 'error');
        document.getElementById('pvBody').innerHTML = '<img src="' + url + '" alt="">';
        document.getElementById('pvCap').textContent = name;
        document.getElementById('cfbPreview').classList.add('show');
        return;
      }
      if (ext === 'pdf') {
        var url2 = await this._signed(path, 7200);
        if (!url2) return App.toast('获取预览地址失败', 'error');
        document.getElementById('pvBody').innerHTML = '<iframe src="' + url2 + '#toolbar=1" title="PDF 预览"></iframe>';
        document.getElementById('pvCap').textContent = name;
        document.getElementById('cfbPreview').classList.add('show');
        return;
      }
      App.confirm('该类型（' + App.utils.escapeHtml(ext || '未知') + '）暂不支持在线预览，是否下载查看？', function () {
        CFB.download(path);
      });
    },

    closePreview: function () {
      var pv = document.getElementById('cfbPreview');
      pv.classList.remove('show');
      document.getElementById('pvBody').innerHTML = '';
    },

    // ===== 名称输入对话框 =====
    _nameDialog: function (title, value, onOk) {
      var overlay = App.modal.open({
        title: title,
        body: '<input type="text" id="cfbNameInput" class="form-input" style="width:100%;" value="' + App.utils.escapeHtml(value || '') + '" placeholder="请输入名称">',
        footer: '<button class="btn" id="cfbNameCancel">取消</button><button class="btn btn-primary" id="cfbNameOk">确定</button>',
      });
      var input = overlay.querySelector('#cfbNameInput');
      setTimeout(function () { input.focus(); input.select(); }, 60);
      function submit() {
        var v = input.value;
        App.modal.close();
        onOk(v);
      }
      overlay.querySelector('#cfbNameCancel').addEventListener('click', function () { App.modal.close(); });
      overlay.querySelector('#cfbNameOk').onclick = submit;
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    },

    // ===== 分区域上传 =====
    _renderZones: function () {
      var host = document.getElementById('cfbZones');
      var self = this;
      var html = '';
      for (var i = 0; i < ZONES.length; i++) {
        var z = ZONES[i];
        html += '<div class="cfb-zone ' + z.cls + '" data-zone="' + z.key + '" id="zone_' + z.key + '">'
          + '<div class="cfb-zone-ico">' + z.icon + '</div>'
          + '<div class="cfb-zone-name">' + z.name + '上传</div>'
          + '<div class="cfb-zone-ext">' + z.extText + '</div>'
          + '<div class="cfb-zone-busy" id="zoneBusy_' + z.key + '">上传中…</div></div>';
      }
      host.innerHTML = html;
      var zones = host.querySelectorAll('.cfb-zone');
      zones.forEach(function (el) {
        var key = el.getAttribute('data-zone');
        el.addEventListener('click', function () {
          if (!self.canWrite) return App.toast('只读模式不可上传', 'warning');
          self._pickForZone(key);
        });
        el.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.add('dragover'); });
        el.addEventListener('dragleave', function () { el.classList.remove('dragover'); });
        el.addEventListener('drop', function (e) {
          e.preventDefault(); e.stopPropagation(); el.classList.remove('dragover');
          if (!self.canWrite) return App.toast('只读模式不可上传', 'warning');
          self._handleZoneDrop(e, key);
        });
      });
      var picker = document.getElementById('cfbPicker');
      picker.addEventListener('change', function (e) {
        var files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) { self._pendingZone = null; return; }
        if (self._pendingZone === 'direct') self.uploadDirect(files);
        else if (self._pendingZone) self.uploadFiles(files, null, self._pendingZone);
        self._pendingZone = null;
      });
      var fpicker = document.getElementById('cfbFolderPicker');
      fpicker.addEventListener('change', function (e) {
        var files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length) self._uploadWithRelativePaths(files);
      });
    },

    _pendingZone: null,
    _pickForZone: function (key) {
      var z = ZONES.find(function (x) { return x.key === key; });
      if (!z) return;
      this._pendingZone = key;
      var picker = document.getElementById('cfbPicker');
      picker.setAttribute('accept', z.accept || '');
      picker.click();
    },

    pickUpload: function () {
      if (!this.canWrite) return App.toast('只读模式不可上传', 'warning');
      this._pendingZone = 'direct';
      document.getElementById('cfbPicker').removeAttribute('accept');
      document.getElementById('cfbPicker').click();
    },
    pickFolderUpload: function () {
      if (!this.canWrite) return App.toast('只读模式不可上传', 'warning');
      document.getElementById('cfbFolderPicker').click();
    },

    _handleZoneDrop: async function (e, zoneKey) {
      var self = this;
      var items = e.dataTransfer && e.dataTransfer.items;
      var got = await this._collectDropped(items);
      if (got && got.length) {
        var z = ZONES.find(function (x) { return x.key === zoneKey; });
        var okFiles = [], wrong = 0;
        for (var i = 0; i < got.length; i++) {
          var f = got[i].file;
          if (!z.exts || z.key === 'other' || self._extIn(f.name, z.exts)) okFiles.push(f);
          else wrong++;
        }
        if (wrong) App.toast('⚠️ 有 ' + wrong + ' 个文件不属于「' + z.name + '」区域，已跳过', 'warning');
        if (okFiles.length) this.uploadFiles(okFiles, null, zoneKey);
        return;
      }
      var files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) this.uploadFiles(files, null, zoneKey);
    },

    // ===== 统一上传入口 =====
    uploadFiles: async function (files, targetDir, zoneKey) {
      var self = this;
      if (!this.canWrite) return App.toast('只读模式不可上传', 'warning');
      var z = ZONES.find(function (x) { return x.key === zoneKey; }) || null;

      var UNI_STYLE_DIR = '/图片文件/款式图';

      if (z && z.exts && z.key !== 'other') {
        var bad = files.filter(function (f) { return !self._extIn(f.name, z.exts); });
        if (bad.length) {
          App.toast('「' + z.name + '」区域仅支持：' + z.extText + '（' + bad.length + ' 个文件被跳过）', 'error', 3500);
          files = files.filter(function (f) { return self._extIn(f.name, z.exts); });
        }
      }
      if (!files.length) return;

      var MAX = (window.MAX_FILE_SIZE || (10 * 1024 * 1024));
      var oversize = files.filter(function (f) { return f.size > MAX; });
      if (oversize.length) {
        App.toast('单文件不能超过 10MB，已跳过 ' + oversize.length + ' 个', 'error', 3500);
        files = files.filter(function (f) { return f.size <= MAX; });
      }
      if (!files.length) return;

      var plans = files.map(function (f) {
        var isImageZone = z && z.key === 'image';
        var fileDir;
        if (!targetDir) {
          fileDir = isImageZone ? UNI_STYLE_DIR : ('/' + (z ? z.folder : '其他文件'));
        } else {
          fileDir = (targetDir === '/') ? ('/' + self._zoneFolderOfName(f.name)) : targetDir;
        }
        var name = self._safeName(f.name);
        return {
          f: f, fileDir: fileDir, name: name,
          path: self.join(fileDir, name),
          overwrite: false, skip: false
        };
      });

      // 同名检查：按目标目录分组，每个目录 list 一次
      var dirMap = {};
      plans.forEach(function (p) { (dirMap[p.fileDir] = dirMap[p.fileDir] || []).push(p); });
      var dirKeys = Object.keys(dirMap);
      for (var di = 0; di < dirKeys.length; di++) {
        var dk = dirKeys[di];
        var dPlans = dirMap[dk];
        var lr = await self.listDir(dk);
        var existNames = {};
        (lr.list || []).forEach(function (it) { if (it.type === 'file') existNames[it.name] = true; });
        var dups = dPlans.filter(function (p) { return existNames[p.name]; });
        if (dups.length) {
          var showNames = dups.slice(0, 5).map(function (p) { return App.utils.escapeHtml(p.name); }).join('、')
            + (dups.length > 5 ? ' 等 ' + dups.length + ' 个' : '');
          var msg = '目标文件夹已存在同名文件：' + showNames + '。是否覆盖？点「取消」则跳过这些文件。';
          var ow = await App.confirmAsync(msg);
          dups.forEach(function (p) { if (ow) p.overwrite = true; else p.skip = true; });
        }
      }
      var willUpload = plans.filter(function (p) { return !p.skip; });
      if (!willUpload.length) {
        App.toast('已取消：所有同名文件均未覆盖', 'info', 3000);
        return;
      }

      this.setStatus('warn', '正在上传 ' + willUpload.length + ' 个文件…');
      this._zoneBusy[zoneKey] = true;
      this._setZoneBusy(zoneKey, true);
      this.setProgress(3);

      var okCount = 0, failCount = 0, skipCount = plans.length - willUpload.length;
      var failNames = [];
      for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
        if (p.skip) continue;
        var f = p.f;
        var path = p.path;
        try {
          var res = await this._st().upload(path.slice(1), f, { contentType: f.type || this._guessMime(f.name), upsert: p.overwrite });
          if (res && res.error) throw res.error;
          okCount++;
        } catch (err) {
          failCount++;
          failNames.push(f.name);
          console.error('[CFB] 上传失败:', path, err);
        }
        this.setProgress(Math.round((i + 1) / plans.length * 100));
      }

      this._zoneBusy[zoneKey] = false;
      this._setZoneBusy(zoneKey, false);
      this.setProgress(null);
      this.setStatus('ok', 'CloudBase 云存储已连接');

      var skipHint = skipCount ? ('，跳过 ' + skipCount + ' 个同名文件') : '';
      if (okCount && !failCount) App.toast('✅ 成功上传 ' + okCount + ' 个文件' + skipHint, 'success', 3000);
      else if (okCount && failCount) App.toast('⚠️ ' + okCount + ' 个成功' + skipHint + '，' + failCount + ' 个失败：' + failNames.slice(0, 3).join('、') + (failNames.length > 3 ? '…' : ''), 'warning', 4500);
      else if (failCount) App.toast('❌ 上传失败：' + failNames.slice(0, 3).join('、') + (failNames.length > 3 ? '…' : ''), 'error', 4500);

      if (okCount) this._afterWrite('upload');
      else { this.refresh(); this.renderTree(); }
    },

    uploadDirect: function (files) {
      this.uploadFiles(files, this.currentPath, this._zoneOfFiles(files));
    },
    _zoneOfFiles: function (files) {
      for (var i = 0; i < files.length; i++) {
        var ext = this._extOf(files[i].name);
        for (var j = 0; j < ZONES.length; j++) {
          var zz = ZONES[j];
          if (zz.key === 'other') continue;
          if (zz.exts.indexOf(ext) >= 0) return zz.key;
        }
      }
      return 'other';
    },
    _zoneFolderOfName: function (name) {
      var ext = this._extOf(name);
      for (var j = 0; j < ZONES.length; j++) {
        var zz = ZONES[j];
        if (zz.key !== 'other' && zz.exts.indexOf(ext) >= 0) return zz.folder;
      }
      return '其他文件';
    },
    _uploadWithRelativePaths: function (files) {
      var self = this;
      if (!files.length) return;
      var base = this.currentPath === '/' ? '/上传文件夹' : this.currentPath;
      (async function () {
        self.setStatus('warn', '正在上传文件夹（' + files.length + ' 个文件）…');
        self.setProgress(3);
        var ok = 0, fail = 0;
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var rel = String(f.webkitRelativePath || f.name).replace(/\\/g, '/');
          if (rel.charAt(0) === '/') rel = rel.slice(1);
          var path = self.join(base, rel).replace(/\/+/g, '/');
          try {
            var res = await self._st().upload(path.slice(1), f, { contentType: f.type || self._guessMime(f.name), upsert: true });
            if (res && res.error) throw res.error;
            ok++;
          } catch (e) { fail++; console.error('[CFB] 文件夹上传失败:', path, e); }
          self.setProgress(Math.round((i + 1) / files.length * 100));
        }
        self.setProgress(null);
        self.setStatus('ok', 'CloudBase 云存储已连接');
        if (ok) App.toast('✅ 文件夹上传完成：' + ok + ' 个成功' + (fail ? ('，' + fail + ' 个失败') : ''), fail ? 'warning' : 'success', 3500);
        else App.toast('文件夹上传失败', 'error');
        if (ok) self._afterWrite('uploadFolder');
        else { self.refresh(); self.renderTree(); }
      })();
    },

    _setZoneBusy: function (key, busy) {
      var el = document.getElementById('zone_' + key);
      if (el) el.classList.toggle('busy', !!busy);
    },

    setProgress: function (pct) {
      var bar = document.getElementById('cfbProgress');
      var fill = document.getElementById('cfbProgressBar');
      if (!bar || !fill) return;
      if (pct === null || pct === undefined) { bar.classList.remove('show'); fill.style.width = '0'; return; }
      bar.classList.add('show');
      fill.style.width = Math.max(2, Math.min(100, pct)) + '%';
    },

    // ===== 写操作收尾：刷新视图 + 失效索引 + 通知其他应用/标签页 =====
    _afterWrite: function (op) {
      this._invalidateIndex();
      this.refresh();
      this.renderTree();
      this._notifyChange(op);
    },

    // ===== 整页拖放（上传）+ 行拖拽（移动）=====
    // 仅在云存储容器可见时生效，不影响宿主应用其他标签页
    _isActive: function () {
      var host = document.querySelector('[data-cfb-host]') || document.getElementById('cloudfiles');
      if (!host) return false;
      return !!(host.offsetParent || host.getClientRects().length);
    },
    _bindGlobalDnD: function () {
      var self = this;
      var mask = document.getElementById('cfbDropMask');
      var depth = 0;
      window.addEventListener('dragenter', function (e) {
        if (!self._isActive()) return;
        if (self._dragging) return;
        if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
        depth++;
        mask.classList.add('show');
        document.getElementById('cfbDropTarget').textContent = (self.currentPath === '/' ? '根目录（按文件类型自动归档）' : self.currentPath);
      });
      window.addEventListener('dragleave', function () {
        if (!self._isActive()) return;
        depth = Math.max(0, depth - 1);
        if (depth === 0) mask.classList.remove('show');
      });
      window.addEventListener('dragover', function (e) {
        if (!self._isActive()) return;
        e.preventDefault();
      });
      window.addEventListener('drop', function (e) {
        if (!self._isActive()) return;
        e.preventDefault();
        depth = 0; mask.classList.remove('show');
        if (self._dragging) return;
        if (!self.canWrite) return App.toast('只读模式不可上传', 'warning');
        var files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        if (files.length) {
          self.uploadDirect(files);
          return;
        }
        self._collectDropped(e.dataTransfer && e.dataTransfer.items).then(function (list) {
          if (list && list.length) self._uploadWithRelativePaths(list.map(function (x) { return x.file; }));
        });
      });
    },

    _collectDropped: function (items) {
      return new Promise(function (resolve) {
        var out = [];
        if (!items || !items.length || !items[0] || typeof items[0].webkitGetAsEntry !== 'function') {
          resolve(out); return;
        }
        var entries = [];
        for (var i = 0; i < items.length; i++) {
          var en = null;
          try { en = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry(); } catch (_e) {}
          if (en) entries.push(en);
        }
        if (!entries.length) { resolve(out); return; }

        function walkEntry(entry, base) {
          return new Promise(function (res2) {
            if (entry.isFile) {
              entry.file(function (f) {
                out.push({ file: f, rel: base + f.name });
                res2();
              }, function () { res2(); });
            } else if (entry.isDirectory) {
              var reader = entry.createReader();
              var all = [];
              function readBatch() {
                reader.readEntries(function (batch) {
                  if (!batch.length) {
                    Promise.all(all.map(function (e2) { return walkEntry(e2, base + entry.name + '/'); }))
                      .then(function () { res2(); }, function () { res2(); });
                    return;
                  }
                  all = all.concat(Array.prototype.slice.call(batch));
                  readBatch();
                }, function () { res2(); });
              }
              readBatch();
            } else res2();
          });
        }
        Promise.all(entries.map(function (e3) { return walkEntry(e3, ''); }))
          .then(function () { resolve(out); }, function () { resolve(out); });
      });
    },

    _bindRowActions: function () {
      var self = this;
      var area = document.getElementById('fileListArea');
      area.addEventListener('dragstart', function (e) {
        var row = e.target.closest && e.target.closest('[data-path]');
        if (!row || !self.canWrite) { e.preventDefault(); return; }
        self._dragging = { path: row.getAttribute('data-path'), type: row.getAttribute('data-type') };
        try { e.dataTransfer.setData('text/plain', 'cfb-move'); e.dataTransfer.effectAllowed = 'move'; } catch (_e) {}
      });
      area.addEventListener('dragend', function () { self._dragging = null; self._clearDropover(); });
      area.addEventListener('dragover', function (e) {
        var row = e.target.closest && e.target.closest('[data-path][data-type="folder"]');
        self._clearDropover();
        if (row && self._dragging && self._dragging.path !== row.getAttribute('data-path')) {
          e.preventDefault(); e.stopPropagation();
          row.classList.add('dropover');
        }
      });
      area.addEventListener('drop', function (e) {
        var row = e.target.closest && e.target.closest('[data-path][data-type="folder"]');
        if (!row || !self._dragging) return;
        e.preventDefault(); e.stopPropagation();
        var target = row.getAttribute('data-path');
        var payload = self._dragging; self._dragging = null;
        self._doMove(payload, target);
        self._clearDropover();
      });
    },

    _bindTreeDnD: function () {
      var self = this;
      var host = document.getElementById('treeHost');
      var items = host.querySelectorAll('.cfb-tree-item');
      items.forEach(function (el) {
        el.addEventListener('dragover', function (e) {
          if (!self._dragging) return;
          e.preventDefault(); e.stopPropagation();
          el.classList.add('dropover');
        });
        el.addEventListener('dragleave', function () { el.classList.remove('dropover'); });
        el.addEventListener('drop', function (e) {
          if (!self._dragging) return;
          e.preventDefault(); e.stopPropagation();
          var target = el.getAttribute('data-treepath');
          var payload = self._dragging; self._dragging = null;
          el.classList.remove('dropover');
          self._doMove(payload, target);
        });
      });
    },
    _clearDropover: function () {
      document.querySelectorAll('.dropover').forEach(function (el) { el.classList.remove('dropover'); });
    },
    _doMove: function (payload, targetDir) {
      var self = this;
      if (!payload) return;
      if (this.parentOf(payload.path) === targetDir) return App.toast('已在目标目录中', 'info');
      App.confirm('移动「' + App.utils.escapeHtml(this.nameOf(payload.path)) + '」到「' + App.utils.escapeHtml(this.nameOf(targetDir)) + '」？', function () {
        (async function () {
          try {
            self.setProgress(20);
            await self._move(payload.path, targetDir, self.nameOf(payload.path));
            self.setProgress(null);
            App.toast('✅ 已移动', 'success');
            self._afterWrite('move');
          } catch (e) {
            self.setProgress(null);
            console.error('[CFB] 移动失败:', e);
            App.toast('移动失败：' + ((e && e.message) || e), 'error');
          }
        })();
      });
    },

    // ===== 跨应用/跨标签页同步 =====
    // 任一应用发生写操作 → BroadcastChannel + localStorage 双通道广播 →
    // 其他应用/标签页的 CFB 自动失效索引并刷新当前视图
    _startSync: function () {
      var self = this;
      this._lastSyncTs = 0;
      try { this._bc = new BroadcastChannel('cfb_sync'); } catch (_e) { this._bc = null; }
      var handler = function (msg) {
        try {
          if (!msg || msg.app === APP_ID) return;
          if (msg.ts && msg.ts <= self._lastSyncTs) return;
          self._lastSyncTs = msg.ts || Date.now();
          self._onRemoteChange();
        } catch (_e) {}
      };
      if (this._bc) this._bc.onmessage = function (ev) { handler(ev.data); };
      window.addEventListener('storage', function (e) {
        if (e.key !== 'cfb__last_change' || !e.newValue) return;
        try { handler(JSON.parse(e.newValue)); } catch (_e) {}
      });
    },
    _notifyChange: function (op) {
      var msg = { app: APP_ID, op: op || 'write', ts: Date.now() };
      this._lastSyncTs = msg.ts;
      try { if (this._bc) this._bc.postMessage(msg); } catch (_e) {}
      try { localStorage.setItem('cfb__last_change', JSON.stringify(msg)); } catch (_e) {}
    },
    _onRemoteChange: function () {
      if (!this._sbReady) return;
      this._invalidateIndex();
      this.treeCache = {};
      this.refresh();
      this.renderTree();
    },

    // ===== 宿主激活（标签页切到云存储时）=====
    // 首次 → init；之后每次 → 刷新当前目录与目录树（看到其他应用的最新改动）
    onShow: function () {
      if (!this._inited) {
        this._inited = true;
        this.init();
        return;
      }
      if (this._sbReady) {
        this.treeCache = {};
        this.refresh();
        this.renderTree();
      }
    },
    _startWatcher: function () {
      var self = this;
      var visible = false;
      this._watchTimer = setInterval(function () {
        var v = false;
        try { v = self._isActive(); } catch (_e) {}
        if (v === visible) return;
        visible = v;
        if (v) self.onShow();
      }, 800);
    },

    // ===== 工具 =====
    _extOf: function (name) {
      var m = String(name || '').match(/\.([^.]+)$/);
      return m ? m[1].toLowerCase() : '';
    },
    _isImage: function (name) { return IMAGE_EXTS.indexOf(this._extOf(name)) >= 0; },
    _extIn: function (name, exts) { return exts.indexOf(this._extOf(name)) >= 0; },
    _iconOf: function (name) {
      var e = this._extOf(name);
      if (e === 'pdf') return '📄';
      if (['xlsx','xls','xlsm','csv'].indexOf(e) >= 0) return '📊';
      if (['doc','docx'].indexOf(e) >= 0) return '📝';
      if (['ppt','pptx'].indexOf(e) >= 0) return '📽️';
      if (IMAGE_EXTS.indexOf(e) >= 0) return '🖼️';
      if (['zip','rar','7z'].indexOf(e) >= 0) return '🗜️';
      if (['mp3','wav'].indexOf(e) >= 0) return '🎵';
      if (['mp4','mov','avi'].indexOf(e) >= 0) return '🎬';
      if (['txt','md'].indexOf(e) >= 0) return '📃';
      return '📎';
    },
    _typeName: function (name) {
      var e = this._extOf(name);
      var map = { pdf:'PDF 文档', xlsx:'Excel 表格', xls:'Excel 表格', xlsm:'Excel 表格', csv:'CSV 表格',
        doc:'Word 文档', docx:'Word 文档', ppt:'PPT 演示', pptx:'PPT 演示', txt:'文本', zip:'压缩包', rar:'压缩包', '7z':'压缩包' };
      return map[e] || (e ? e.toUpperCase() + ' 文件' : '文件');
    },
    _safeName: function (name) {
      return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_');
    },
    _guessMime: function (name) {
      var e = this._extOf(name);
      var map = { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
        webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp', csv:'text/csv', txt:'text/plain',
        xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls:'application/vnd.ms-excel',
        doc:'application/msword',
        docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ppt:'application/vnd.ms-powerpoint',
        pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
      return map[e] || 'application/octet-stream';
    },
    _fmtSize: function (n) {
      n = Number(n) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
      return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    },
    _fmtTime: function (v) {
      try {
        var d = (typeof v === 'number') ? new Date(v) : new Date(String(v));
        if (isNaN(d.getTime())) return String(v);
        var p = function (x) { return (x < 10 ? '0' : '') + x; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
      } catch (_e) { return String(v); }
    },
  };

  // ===== 启动 =====
  window.CFB = CFB;
  // orderschedule 的 showSection 调用此钩子（兼容旧接入）
  window.CFB_onShow = function () { CFB.onShow(); };

  function boot() {
    var host = ensureDom();
    if (!host) {
      // 容器可能晚于脚本渲染，稍后重试几次
      var tries = 0;
      var tm = setInterval(function () {
        tries++;
        if (ensureDom() || tries > 50) clearInterval(tm);
      }, 200);
      return;
    }
    CFB._startWatcher();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
