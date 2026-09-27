// v2 user profile override — user card on click
import { state } from "../store.js";

const EXP_TABLE = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6700, 8000, 9500, 11200, 13000, 15000, 17500, 20000, 25000];

export function getUserLevel(exp) {
  for (let i = EXP_TABLE.length - 1; i >= 0; i--) {
    if ((exp || 0) >= EXP_TABLE[i]) return i + 1;
  }
  return 1;
}

export function getUserExpForLevel(level) {
  return EXP_TABLE[Math.min(level, EXP_TABLE.length) - 1] || 0;
}

export function showUserProfile(username) {
  // Fetch user info from API
  const token = localStorage.getItem("chat_token") || "";
  fetch(`/api/user/${encodeURIComponent(username)}?token=${encodeURIComponent(token)}`)
    .then(r => r.json())
    .then(data => renderProfileCard(username, data))
    .catch(() => renderProfileCard(username, null));
}

function renderProfileCard(username, data) {
  let panel = document.getElementById("v2-profile-panel");
  if (panel) panel.remove();

  panel = document.createElement("div");
  panel.id = "v2-profile-panel";
  panel.className = "v2-profile-overlay";

  const level = data?.level || 1;
  const exp = data?.exp || 0;
  const nextExp = getUserExpForLevel(level + 1);
  const expProgress = Math.min(100, Math.round((exp / nextExp) * 100));

  panel.innerHTML = `
    <div class="v2-profile-card">
      <div class="v2-profile-header">
        <span class="v2-profile-name">${username}</span>
        <button class="v2-profile-close" onclick="this.closest('#v2-profile-panel').remove()">&times;</button>
      </div>
      ${data ? `
      <div class="v2-profile-body">
        <div class="v2-profile-stat"><span class="label">等级</span><span class="value">${level}</span></div>
        <div class="v2-profile-stat"><span class="label">经验</span><span class="value">${exp}/${nextExp}</span></div>
        <div class="v2-profile-bar"><div class="v2-profile-bar-fill" style="width:${expProgress}%"></div></div>
        ${data.points ? `<div class="v2-profile-stat"><span class="label">积分</span><span class="value">${data.points}</span></div>` : ""}
        ${data.levelStyle ? `<div class="v2-profile-stat"><span class="label">样式</span><span class="value">${data.levelStyle}</span></div>` : ""}
      </div>
      ` : `
      <div class="v2-profile-empty">用户信息不可用</div>
      `}
    </div>
  `;
  document.body.appendChild(panel);

  panel.addEventListener("click", e => {
    if (e.target === panel) panel.remove();
  });
}

window.__v2_showUserProfile = showUserProfile;
