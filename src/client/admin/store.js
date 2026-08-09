// v1.52 管理后台 Vue3 迁移 - 共享状态与工具
// 🔒 鉴权全部走 httpOnly Cookie（v1.37 起密钥服务端下发，JS 不可读），
//    因此本版本所有 fetch 一律不带 ?key=，靠浏览器自动携带 cookie。
import * as Vue from '/static/admin/vendor/vue.js';

export const store = Vue.reactive({
  level: null,          // 'super' | 'admin' | null
  current: 'dashboard', // 当前 section key
  userModal: null,      // 用户详情弹窗：用户名 or null
  ptsFocus: null,       // 从弹窗「管理积分」跳转时预填的待查询用户名
});

export const TAG_COLORS = {
  red: "#e74c3c", blue: "#3498db", green: "#2ecc71",
  purple: "#9b59b6", pink: "#e91e63", cyan: "#00bcd4",
  gray: "#95a5a6", orange: "#e67e22",
  yellow: "#ffc107", teal: "#009688", indigo: "#3f51b5",
  brown: "#795548", lime: "#cddc39", deeporange: "#ff5722",
  rose: "#ff80ab", crimson: "#dc143c", coral: "#ff7043",
  gold: "#ffd700", amber: "#ffbf00", forest: "#228b22",
  seagreen: "#2e8b57", turquoise: "#40e0d0", steel: "#4682b4",
  royalblue: "#4169e1", mediumpurple: "#9370db", darkviolet: "#9400d3",
  chocolate: "#d2691e", olive: "#808000", firebrick: "#b22222",
  slateblue: "#6a5acd", darkcyan: "#008b8b", mediumseagreen: "#3cb371",
  indianred: "#cd5c5c", cadetblue: "#5f9ea0"
};

// 浅色底 -> 深色文字（用于 select/color swatch 可读性）
export const LIGHT_COLORS = new Set(['yellow','lime','gold','amber','rose','gray','coral','turquoise']);

// body 级 toast（固定顶部，不随组件重渲染被清掉——复用 lp-ed-toast 思路）
let _toastTimer = null;
export function toast(msg, type = 'ok') {
  let el = document.getElementById('av-toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'av-toast';
  el.className = 'av-toast ' + (type === 'err' ? 'err' : type === 'warn' ? 'warn' : 'ok');
  el.textContent = msg;
  document.body.appendChild(el);
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.remove(), 2800);
}

// 路由切换（供 section 内跳转，如 usermodal「管理积分」）
export function navigate(key) {
  if (store.current === key) return;
  store.current = key;
  try { history.pushState({}, '', '/admin-vue/' + key + '/'); } catch {}
}
