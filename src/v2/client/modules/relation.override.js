// v2 relation override — follow/friend/block system
import { state } from "../store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";
import { escapeHtml } from "../renderers.override.js";

export function openRelations(tab) {
  let panel = document.getElementById("v2-relation-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-relation-panel";
  panel.className = "v2-relation-overlay";
  panel.innerHTML = `
    <div class="v2-relation-modal">
      <div class="v2-relation-header">
        <h2>👥 关系链</h2>
        <button class="v2-relation-close" onclick="window.__v2_closeRelations()">&times;</button>
      </div>
      <div class="v2-relation-tabs">
        <button class="v2-relation-tab${tab === 'friends' ? ' active' : ''}" data-tab="friends" onclick="window.__v2_switchRelationsTab('friends')">好友</button>
        <button class="v2-relation-tab${tab === 'following' ? ' active' : ''}" data-tab="following" onclick="window.__v2_switchRelationsTab('following')">关注</button>
        <button class="v2-relation-tab${tab === 'followers' ? ' active' : ''}" data-tab="followers" onclick="window.__v2_switchRelationsTab('followers')">粉丝</button>
        <button class="v2-relation-tab${tab === 'blocked' ? ' active' : ''}" data-tab="blocked" onclick="window.__v2_switchRelationsTab('blocked')">拉黑</button>
      </div>
      <div id="v2-relation-content" class="v2-relation-content"></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeRelations(); });
  switchRelationsTab(tab || "friends");
}

export function closeRelations() {
  const p = document.getElementById("v2-relation-panel");
  if (p) p.remove();
}

export function switchRelationsTab(tab) {
  document.querySelectorAll(".v2-relation-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  const content = document.getElementById("v2-relation-content");
  if (!content) return;
  if (tab === "friends") loadFriends(content);
  else if (tab === "following") loadFollowing(content);
  else if (tab === "followers") loadFollowers(content);
  else loadBlocked(content);
}

async function loadFriends(container) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/relation/friends", { headers: { "Cookie": `token=${token}` } });
    const friends = await res.json();
    if (!Array.isArray(friends) || friends.length === 0) {
      container.innerHTML = '<div class="v2-relation-empty">暂无好友</div>';
      return;
    }
    container.innerHTML = friends.map(f => renderUserRow(f.name, f.tag, "friend")).join("");
  } catch { container.innerHTML = '<div class="v2-relation-error">加载失败</div>'; }
}

async function loadFollowing(container) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/relation/following", { headers: { "Cookie": `token=${token}` } });
    const users = await res.json();
    if (!Array.isArray(users) || users.length === 0) {
      container.innerHTML = '<div class="v2-relation-empty">未关注任何人</div>';
      return;
    }
    container.innerHTML = users.map(u => renderUserRow(u.name, u.tag, "following")).join("");
  } catch { container.innerHTML = '<div class="v2-relation-error">加载失败</div>'; }
}

async function loadFollowers(container) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/relation/followers", { headers: { "Cookie": `token=${token}` } });
    const users = await res.json();
    if (!Array.isArray(users) || users.length === 0) {
      container.innerHTML = '<div class="v2-relation-empty">暂无粉丝</div>';
      return;
    }
    container.innerHTML = users.map(u => renderUserRow(u.name, u.tag, "follower")).join("");
  } catch { container.innerHTML = '<div class="v2-relation-error">加载失败</div>'; }
}

async function loadBlocked(container) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/relation/blocked", { headers: { "Cookie": `token=${token}` } });
    const users = await res.json();
    if (!Array.isArray(users) || users.length === 0) {
      container.innerHTML = '<div class="v2-relation-empty">未拉黑任何人</div>';
      return;
    }
    container.innerHTML = users.map(u => renderUserRow(u.name, u.tag, "blocked")).join("");
  } catch { container.innerHTML = '<div class="v2-relation-error">加载失败</div>'; }
}

function renderUserRow(name, tag, relation) {
  const isSelf = name === state.user?.name;
  if (isSelf) return '';
  const actions = relation === "blocked"
    ? `<button class="v2-relation-action" onclick="window.__v2_unblock('${escapeHtml(name)}')">解除</button>`
    : `<button class="v2-relation-action" onclick="window.__v2_block('${escapeHtml(name)}')">拉黑</button>` +
      `<button class="v2-relation-action" onclick="window.__v2_dmUser('${escapeHtml(name)}')">私信</button>`;
  return `
    <div class="v2-relation-row">
      <span class="v2-relation-name">${escapeHtml(name)}${tag ? `<span class="v2-relation-tag">${escapeHtml(tag)}</span>` : ''}</span>
      ${actions}
    </div>
  `;
}

async function block(username) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/relation/block", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ name: username }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("已拉黑"); openRelations("blocked"); }
    else showError(data.error || "操作失败");
  } catch (e) { showError("操作失败: " + e.message); }
}

async function unblock(username) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/relation/unblock", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ name: username }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("已解除拉黑"); openRelations("blocked"); }
    else showError(data.error || "操作失败");
  } catch (e) { showError("操作失败: " + e.message); }
}

function dmUser(username) {
  window.__v2_openDM?.(username);
}

window.__v2_openRelations = openRelations;
window.__v2_closeRelations = closeRelations;
window.__v2_switchRelationsTab = switchRelationsTab;
window.__v2_block = block;
window.__v2_unblock = unblock;
window.__v2_dmUser = dmUser;
