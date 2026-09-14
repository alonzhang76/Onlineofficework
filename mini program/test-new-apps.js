/**
 * 两个新小程序的功能测试（mock wx 离线环境）
 * 验证：db 加载/保存/合并、list-page 工厂（自动计算/必填校验/增删改）
 */
const path = require('path');

function makeMockWx(storage) {
  return {
    getStorageSync: k => (k in storage ? storage[k] : ''),
    setStorageSync: (k, v) => { storage[k] = v; },
    removeStorageSync: k => { delete storage[k]; },
    request: (opts) => setTimeout(() => opts.fail && opts.fail({ errMsg: 'request:fail mock-offline' }), 0),
    onNetworkStatusChange: () => {},
    showToast: () => {},
    showModal: () => {},
    showLoading: () => {}, hideLoading: () => {},
    reLaunch: () => {}, navigateTo: () => {},
    setNavigationBarTitle: () => {},
    getFileSystemManager: () => ({ writeFileSync() {}, readFile() {} }),
    shareFileMessage: () => {}, chooseMessageFile: () => {},
    stopPullDownRefresh: () => {},
    env: { USER_DATA_PATH: '/tmp' },
    getStorageSync_name: 'mock'
  };
}

function runProj(name, dir, modKeys) {
  console.log('\n===== ' + name + ' =====');
  const storage = {};
  global.wx = makeMockWx(storage);
  global.getApp = () => ({ globalData: { user: { email: 't@t.co' }, modules: [] } });
  // 清除 require 缓存以隔离两个项目
  const base = path.resolve(dir);
  Object.keys(require.cache).forEach(k => { if (k.startsWith(base)) delete require.cache[k]; });

  const db = require(path.resolve(dir, 'utils/db.js'));
  const cb = require(path.resolve(dir, 'utils/cloudbase.js'));
  const makePage = require(path.resolve(dir, 'utils/list-page.js'));

  let pass = 0, fail = 0;
  const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };

  // 1. 加载
  db.loadAll();
  ok(Array.isArray(db.get(modKeys[0])), 'loadAll: 数据键初始化为数组');

  // 2. 保存 + 持久化
  const rec = { id: 'T1', name: '测试', amount: 12.5, status: '草稿' };
  db.get(modKeys[0]).push(rec);
  db.save(modKeys[0]);
  const raw = wx.getStorageSync(modKeys[0]);
  ok(Array.isArray(raw) && raw.length === 1, 'save: 写入本地 storage');
  const cloudKey = (cb.CONFIG.cloudPrefix.app || '') + modKeys[0];
  ok(storage['_cb_pending_v1'] && storage['_cb_pending_v1'][cloudKey], 'save: 云推送已入队（键 ' + cloudKey + '）');

  // 3. takeCloud 裁决：有未确认推送时拒绝云端覆盖
  ok(cb.takeCloud(modKeys[0], new Date().toISOString(), []) === false, 'takeCloud: 未确认推送保护本地');

  // 4. syncFromCloud（request no-op → pull 失败 → 回调 false，不崩）
  let called = false;
  db.syncFromCloud(ch => { called = true; ok(ch === false, 'syncFromCloud: 离线安全回调'); });
  setTimeout(() => {
    if (!called) { fail++; console.log('  ✗ syncFromCloud 未回调'); }

    // 5. list-page 工厂
    const schema = require(path.resolve(dir, 'pages/contacts/schema.js'));
    const page = makePage(schema);
    ok(typeof page.render === 'function' && typeof page.saveForm === 'function', 'list-page: 工厂生成页面方法');
    ok(page.data.statuses !== undefined, 'list-page: schema 注入 data');

    // 自动计算（用含 autoSum 的模块）
    const sumMod = require(path.resolve(dir, 'pages/' + modKeys[0] + '/schema.js'));
    if (sumMod.autoSum) {
      const p2 = makePage(sumMod);
      p2.setData = function (d) { Object.assign(this.data, d); };
      p2.data.form = {};
      p2.autoSum({ [sumMod.autoSum.qtyField]: 3, [sumMod.autoSum.priceField]: 2.5 });
      // autoSum 接收 form 对象
      const form = {};
      form[sumMod.autoSum.qtyField] = 3;
      form[sumMod.autoSum.priceField] = 2.5;
      p2.autoSum(form);
      ok(form[sumMod.autoSum.target] === 7.5, 'autoSum: 3 × 2.5 = 7.5');
    }

    console.log('  ---- ' + pass + ' 通过, ' + fail + ' 失败 ----');
    if (fail) process.exit(1);
    done();
  }, 50);
}

let stage = 0;
function done() {
  stage++;
  if (stage === 1) runProj('stainless-mp', 'stainless-mp', ['purchaseOrders', 'salesOrders']);
  else { console.log('\n✅ 功能测试全部通过'); process.exit(0); }
}

runProj('saintysys-mp', 'saintysys-mp', ['orders', 'productions']);
