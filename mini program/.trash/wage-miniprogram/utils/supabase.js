/**
 * Supabase 云端同步适配器（微信小程序版）
 *
 * 与网页版（Onlineofficework/apps/wage）共用同一个 Supabase 后端：
 *   - 数据表：app_data_store（字段 store_key / payload / updated_at）
 *   - 数据键名与网页版完全一致（wage_records、wage_employees…），
 *     小程序启动拉取、保存即推送，实现手机/网页多端实时同步。
 *
 * 鉴权说明：
 *   app_data_store 的 RLS 策略要求 authenticated 角色（仅带 anon key 的匿名
 *   请求会被拦截：读返回 0 行、写返回 42501）。因此启动时使用与网页版
 *   supabase-sync.js 相同的"数据同步专用账号"静默登录（/auth/v1/token），
 *   拿到 access_token 后再读写；token 缓存在本地，过期自动刷新，401/403 自动重登重试。
 *
 * 注意：需在微信公众平台把 https://ugoyacuagslqhqguxyqe.supabase.co
 *       加入 request 合法域名（开发期可在开发者工具勾选"不校验合法域名"）。
 */
const CONFIG = {
  url: 'https://ugoyacuagslqhqguxyqe.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnb3lhY3VhZ3NscWhxZ3V4eXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MzI5NTUsImV4cCI6MjEwMjUwODk1NX0._GdWOGWblSpOYm3y8f_d3aVQszfn2YbRjHN0FqZiLtI',
  table: 'app_data_store',
  // 数据同步专用账号（与网页版一致，authenticated 角色，用户无感知）
  syncAccount: {
    email: 'sync@lori.app',
    password: 'LoriSync2026!'
  },
  // 只同步工资系统相关的键，避免拉取其它应用的数据
  syncKeys: [
    'wage_records', 'wage_employees', 'wage_processes', 'wage_orders',
    'wage_adjustments', 'wage_dropdown_options',
    'wage_calendar_events', 'wage_calendar_event_types'
  ]
};

const AUTH_CACHE_KEY = '_sb_auth_token';
let authPromise = null;

function isConfigured() {
  return Boolean(CONFIG.url && CONFIG.anonKey);
}

/* ============ 鉴权：静默登录，缓存 access_token ============ */
function authRequest(path, body) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: CONFIG.url.replace(/\/$/, '') + '/auth/v1' + path,
      method: 'POST',
      data: body,
      header: {
        'apikey': CONFIG.anonKey,
        'Content-Type': 'application/json'
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.access_token) resolve(res.data);
        else reject(res);
      },
      fail: reject
    });
  });
}

function readCachedAuth() {
  try { return wx.getStorageSync(AUTH_CACHE_KEY) || null; } catch (e) { return null; }
}

function cacheAuth(data) {
  try {
    wx.setStorageSync(AUTH_CACHE_KEY, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      // 提前 5 分钟视为过期，避免边界失效
      expires_at: Date.now() + (data.expires_in || 3600) * 1000 - 5 * 60 * 1000
    });
  } catch (e) {}
}

function clearCachedAuth() {
  try { wx.removeStorageSync(AUTH_CACHE_KEY); } catch (e) {}
  authPromise = null;
}

/** 确保拿到有效的 access_token；失败返回 null（调用方静默跳过云端，不影响本地使用） */
function ensureToken(forceRelogin) {
  if (!isConfigured()) return Promise.resolve(null);
  if (!forceRelogin && authPromise) return authPromise;

  authPromise = (async () => {
    const cached = forceRelogin ? null : readCachedAuth();

    // 1) 缓存 token 仍在有效期内
    if (cached && cached.access_token && cached.expires_at > Date.now()) {
      return cached.access_token;
    }

    // 2) 用 refresh_token 续期
    if (cached && cached.refresh_token) {
      try {
        const r = await authRequest('/token?grant_type=refresh_token', { refresh_token: cached.refresh_token });
        cacheAuth(r);
        return r.access_token;
      } catch (e) { /* 续期失败，继续走密码登录 */ }
    }

    // 3) 同步账号密码登录
    try {
      const r = await authRequest('/token?grant_type=password', {
        email: CONFIG.syncAccount.email,
        password: CONFIG.syncAccount.password
      });
      cacheAuth(r);
      return r.access_token;
    } catch (e) {
      console.warn('[supabase] 登录失败，云同步不可用（本地数据不受影响）', e && e.data);
      return null;
    } finally {
      // 释放锁：已完成的登录结果缓存在 storage，下次调用直接读缓存
      setTimeout(() => { authPromise = null; }, 0);
    }
  })();

  return authPromise;
}

/* ============ 基础请求 ============ */

/**
 * 基础请求
 * @param {string} method GET/POST/PATCH/DELETE
 * @param {string} qs query string（以 ? 开头）
 * @param {*} data 请求体
 * @param {object} extraHeader 额外请求头
 * @param {boolean} retry 内部使用：401/403 重登后重试一次
 */
function req(method, qs, data, extraHeader, retry) {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) { resolve(null); return; }
    ensureToken().then(token => {
      if (!token) { resolve(null); return; }
      wx.request({
        url: CONFIG.url.replace(/\/$/, '') + '/rest/v1/' + CONFIG.table + (qs || ''),
        method,
        data,
        header: Object.assign({
          'apikey': CONFIG.anonKey,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }, extraHeader || {}),
        success(res) {
          // token 失效/过期：清缓存强制重新登录，重试一次
          if ((res.statusCode === 401 || res.statusCode === 403) && !retry) {
            clearCachedAuth();
            req(method, qs, data, extraHeader, true).then(resolve, reject);
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(res);
        },
        fail: reject
      });
    });
  });
}

/**
 * 拉取云端工资系统全部数据 → [{key, value}]
 * （云端字段 store_key/payload 在这里统一映射为 db.js 约定的 key/value）
 */
function pullAll() {
  const keyList = CONFIG.syncKeys.map(encodeURIComponent).join(',');
  return req('GET', '?select=store_key,payload,updated_at&store_key=in.(' + keyList + ')', null, {
    'Prefer': 'count=none'
  }).then(rows => {
    if (!Array.isArray(rows)) return rows;
    return rows.map(r => ({ key: r.store_key, value: r.payload, updatedAt: r.updated_at }));
  });
}

/** 按 key 拉取单条 → {key, value}（无数据返回 null） */
function pull(key) {
  return req('GET', '?select=store_key,payload,updated_at&store_key=eq.' + encodeURIComponent(key), null)
    .then(rows => {
      if (!Array.isArray(rows) || !rows.length) return null;
      const r = rows[0];
      return { key: r.store_key, value: r.payload, updatedAt: r.updated_at };
    });
}

/** 插入/更新（upsert）一条数据 */
function push(key, value) {
  return req('POST', '', [{
    store_key: key,
    payload: value,
    updated_at: new Date().toISOString()
  }], {
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  });
}

module.exports = { CONFIG, isConfigured, pullAll, pull, push };
