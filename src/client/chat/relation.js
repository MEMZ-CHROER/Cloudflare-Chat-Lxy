// 👥 v1.48 关系链弹窗（聊天室侧）— 关注 / 好友 / 拉黑 关系管理
// 全部 createElement + textContent 渲染（防 XSS），禁 innerHTML 拼用户数据
// 后端：GET /api/rel/status?name&token&target、GET /api/rel/lists?name&token&tab、
//       POST /api/rel/{follow|unfollow|request|respond|unfriend|block|unblock}  body {name,token,target,(action)}
import { state, t } from './state.js';
import { getAuthName, getAuthToken, isAuthenticated } from './auth.js';

// 轻量防抖——同一(目标,动作)处理中直接忽略重复点击（仿 market._marketBusy）
const _relBusy = new Set();

function emptyEl(text) {
  let el = document.createElement("div");
  el.className = "relation-empty";
  el.textContent = text;
  return el;
}

function btn(text, onClick) {
  let b = document.createElement("button");
  b.className = "relation-btn";
  b.textContent = text;
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
}

// v1.53 双轨：默认走 Vue3 弹窗管理器（modals/relation.js）；localStorage.chatLegacyModals=1 时回退旧 overlay
export function openRelations(tab) {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    openRelationsLegacy(tab);
    return;
  }
  import('./modal-manager.js').then(m => m.openModal('relation', { tab })).catch(() => openRelationsLegacy(tab));
}

function openRelationsLegacy(tab) {
  let overlay = document.getElementById("relation-overlay");
  if (!overlay) return;
  overlay.classList.add("show");
  overlay.style.display = "flex"; // chat.html 内联 display:none 会压过 .show 类，须内联显隐
  switchRelationsTab(tab || "following");
}

export function closeRelations() {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    closeRelationsLegacy();
    return;
  }
  import('./modal-manager.js').then(m => m.closeModal('relation')).catch(() => closeRelationsLegacy());
}

function closeRelationsLegacy() {
  let overlay = document.getElementById("relation-overlay");
  if (!overlay) return;
  overlay.classList.remove("show");
  overlay.style.display = "none";
}

export function switchRelationsTab(tab) {
  document.querySelectorAll("#relation-overlay [data-tab]").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
  loadRelationsList(tab);
}

// 行内动作：followers 需按 status 决定按钮显隐，其余 tab 直接按关系类型给动作
async function renderRowActions(row, tab, name) {
  let actions = document.createElement("span");
  actions.className = "relation-actions";
  if (tab === "following") {
    actions.appendChild(btn(t("relUnfollow"), () => unfollow(name)));
  } else if (tab === "friends") {
    actions.appendChild(btn(t("relDeleteFriend"), () => unfriend(name)));
  } else if (tab === "blocked") {
    actions.appendChild(btn(t("relUnblock"), () => unblock(name)));
  } else if (tab === "requests") {
    actions.appendChild(btn(t("relAccept"), () => respondRequest(name, "accept")));
    actions.appendChild(btn(t("relReject"), () => respondRequest(name, "reject")));
  } else if (tab === "followers") {
    let st = null;
    try {
      let r = await fetch("/api/rel/status?name=" + encodeURIComponent(getAuthName()) + "&token=" + encodeURIComponent(getAuthToken()) + "&target=" + encodeURIComponent(name));
      let d = await r.json();
      if (d && d.ok && d.status) st = d.status;
    } catch (_) {}
    // 关注TA（若未关注）
    if (!st || !st.following) {
      actions.appendChild(btn(t("relFollowTarget"), () => follow(name)));
    }
    // 加好友（仅当不是好友、无 pending、且未互相拉黑）
    if (st && !st.friends && !st.pendingOut && !st.pendingIn && !st.blocked && !st.blockedBy) {
      actions.appendChild(btn(t("relAddFriend"), () => sendFriendRequest(name)));
    }
  }
  row.appendChild(actions);
}

export async function loadRelationsList(tab) {
  let list = document.getElementById("relation-list");
  if (!list) return;
  if (!isAuthenticated()) { list.textContent = ""; list.appendChild(emptyEl(t("relPleaseLogin"))); return; }
  list.textContent = "";
  try {
    let r = await fetch("/api/rel/lists?name=" + encodeURIComponent(getAuthName()) + "&token=" + encodeURIComponent(getAuthToken()) + "&tab=" + encodeURIComponent(tab));
    let data = await r.json();
    if (!data || data.ok === false) { list.appendChild(emptyEl(t("加载失败"))); return; }
    let counts = data.counts || {};
    let names = Array.isArray(data.names) ? data.names : [];
    // 顶部各 tab 计数
    let countsEl = document.createElement("div");
    countsEl.className = "relation-counts";
    countsEl.textContent = t("relMyFollowing") + " " + (counts.following || 0) + " · " + t("relMyFollowers") + " " + (counts.followers || 0) + " · " + t("relMyFriends") + " " + (counts.friends || 0) + " · " + t("relMyBlocked") + " " + (counts.blocked || 0) + " · " + t("relFriendRequests") + " " + (counts.requests || 0);
    list.appendChild(countsEl);
    if (names.length === 0) { list.appendChild(emptyEl(t("relEmpty"))); return; }
    let frag = document.createDocumentFragment();
    for (let n of names) {
      let row = document.createElement("div");
      row.className = "relation-row";
      let nameEl = document.createElement("span");
      nameEl.className = "relation-name";
      nameEl.textContent = n;
      // 点击名字复用现有用户详情菜单（若 window 上有 showUserMenu），否则退回用户主页
      nameEl.addEventListener("click", (e) => {
        e.stopPropagation();
        let rct = e.currentTarget.getBoundingClientRect();
        if (typeof window.showUserMenu === "function") window.showUserMenu(n, rct.left, rct.bottom + 4);
        else if (typeof window.showProfile === "function") window.showProfile(n);
      });
      row.appendChild(nameEl);
      frag.appendChild(row);
      renderRowActions(row, tab, n); // fire-and-forget 填充行内动作（followers 需先查 status）
    }
    list.appendChild(frag);
  } catch (e) {
    list.appendChild(emptyEl(t("加载失败") + ": " + e.message));
  }
}

// 动作成功后刷新：当前列表 + 若目标在打开的菜单中则刷新菜单按钮
function refreshAfterAction(target) {
  let overlay = document.getElementById("relation-overlay");
  if (overlay && overlay.classList.contains("show")) {
    let activeTab = overlay.querySelector("[data-tab].active");
    loadRelationsList(activeTab ? activeTab.dataset.tab : "following");
  }
  let menu = document.getElementById("user-menu");
  if (menu && menu.classList.contains("show") && state.menuTargetUser === target) {
    loadRelationMenuButtons(target);
  }
}

// 统一 POST 封装（仿 market.js 的 fetch + .error 处理 + _busy 防抖）
async function postAction(action, target, extra) {
  if (!target) return;
  if (!isAuthenticated()) { alert(t("relPleaseLogin")); return; }
  let key = action + ":" + target;
  if (_relBusy.has(key)) return;
  _relBusy.add(key);
  try {
    let body = {name: getAuthName(), token: getAuthToken(), target};
    if (extra) Object.assign(body, extra);
    let r = await fetch("/api/rel/" + action, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    let d = await r.json();
    if (d && d.error) alert(t(d.error) || t("relOpFailed"));
    else refreshAfterAction(target);
  } catch (e) {
    alert(t("relOpFailed") + ": " + e.message);
  } finally {
    _relBusy.delete(key);
  }
}

export function follow(target) { return postAction("follow", target); }
export function unfollow(target) { return postAction("unfollow", target); }
export function sendFriendRequest(target) { return postAction("request", target); }
export function respondRequest(target, action) { return postAction("respond", target, {action}); }
export function unfriend(target) { return postAction("unfriend", target); }
export function block(target) { return postAction("block", target); }
export function unblock(target) { return postAction("unblock", target); }

// 菜单关系按钮显隐（按 status 优先级：blockedBy 全隐 → blocked 只显解拉黑 → friends 全隐 → 常规）
export async function loadRelationMenuButtons(targetName) {
  let legacy = localStorage.getItem("chatLegacyModals") === "1";
  let menu = document.getElementById("user-menu");
  if (!targetName) return;
  if (legacy && !menu) return;
  // v1.53 批3B 双轨：Vue 用户菜单（nav.js）下关系按钮写在响应式 userMenuState.relButtons；
  // legacy 下操作旧 #user-menu 的 .menu-btn DOM。
  let btns = legacy ? menu.querySelectorAll('[data-action^="rel-"]') : [];
  btns.forEach(b => { b.style.display = "none"; });
  let resetVue = () => { if (window.__navSetUserMenu) window.__navSetUserMenu({ relButtons: {} }); };
  if (legacy) resetVue = () => {};
  resetVue();
  if (!isAuthenticated() || targetName === getAuthName()) return;
  let st = null;
  try {
    let r = await fetch("/api/rel/status?name=" + encodeURIComponent(getAuthName()) + "&token=" + encodeURIComponent(getAuthToken()) + "&target=" + encodeURIComponent(targetName));
    let d = await r.json();
    if (d && d.ok && d.status) st = d.status;
  } catch (_) {}
  if (!st) return;
  let show = {};
  if (st.blockedBy) {
    // 对方拉黑我：我无法操作对方，全部隐藏
  } else if (st.blocked) {
    // 我拉黑对方：只显示解除拉黑
    show["rel-unblock"] = true;
  } else if (st.friends) {
    // 已是好友：无需关注/加好友/拉黑按钮，全部隐藏
  } else {
    show[st.following ? "rel-unfollow" : "rel-follow"] = true;
    if (!st.pendingOut && !st.pendingIn) show["rel-friend"] = true;
    show["rel-block"] = true;
  }
  if (legacy) {
    btns.forEach(b => { if (show[b.dataset.action]) b.style.display = "block"; });
  } else if (window.__navSetUserMenu) {
    window.__navSetUserMenu({ relButtons: show });
  }
}

// 事件委托：#user-menu 内关系按钮（主入口若未把 .menu-btn 路由到 handleMenuAction 时的兜底；_relBusy 防重复）
(function() {
  let menu = document.getElementById("user-menu");
  if (menu) menu.addEventListener("click", (e) => {
    let btnEl = e.target.closest('#user-menu [data-action^="rel-"]');
    if (!btnEl) return;
    let action = btnEl.dataset.action;
    let target = state.menuTargetUser;
    if (!target) return;
    if (action === "rel-follow") follow(target);
    else if (action === "rel-unfollow") unfollow(target);
    else if (action === "rel-friend") sendFriendRequest(target);
    else if (action === "rel-block") block(target);
    else if (action === "rel-unblock") unblock(target);
  });
})();

// 事件委托：关系弹窗 tab 切换（chat.html 的 tab 按钮无 onclick，此处统一绑定）
(function() {
  let overlay = document.getElementById("relation-overlay");
  if (overlay) overlay.addEventListener("click", (e) => {
    let tabEl = e.target.closest("[data-tab]");
    if (tabEl) { switchRelationsTab(tabEl.dataset.tab); return; }
    // 遮罩点击空白关闭
    if (e.target === e.currentTarget) closeRelations();
  });
})();

// 暴露到 window（供 onclick / 动态 import / 菜单 action 调用，仿 market 的 lazyMods 映射）
window.openRelations = openRelations;
window.closeRelations = closeRelations;
window.switchRelationsTab = switchRelationsTab;
window.loadRelationsList = loadRelationsList;
window.loadRelationMenuButtons = loadRelationMenuButtons;
window.follow = follow;
window.unfollow = unfollow;
window.sendFriendRequest = sendFriendRequest;
window.respondRequest = respondRequest;
window.unfriend = unfriend;
window.block = block;
window.unblock = unblock;
