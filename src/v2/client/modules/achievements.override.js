// v2 achievements override — user achievement system
import { state } from "./store.js";

const ACHIEVEMENTS = [
  { id: "first_msg", name: "初出茅庐", desc: "发送第一条消息", icon: "💬", check: (s) => s.totalMsgs >= 1 },
  { id: "msg_10", name: "话痨", desc: "发送10条消息", icon: "🗣️", check: (s) => s.totalMsgs >= 10 },
  { id: "msg_100", name: "健谈", desc: "发送100条消息", icon: "💭", check: (s) => s.totalMsgs >= 100 },
  { id: "msg_1000", name: "话痨之王", desc: "发送1000条消息", icon: "👑", check: (s) => s.totalMsgs >= 1000 },
  { id: "join_1", name: "新成员", desc: "加入第一个房间", icon: "🚪", check: (s) => s.roomsJoined >= 1 },
  { id: "join_5", name: "探险家", desc: "加入5个房间", icon: "🗺️", check: (s) => s.roomsJoined >= 5 },
  { id: "online_1h", name: "常驻民", desc: "在线1小时", icon: "⏰", check: (s) => s.onlineSeconds >= 3600 },
  { id: "online_24h", name: "熬夜冠军", desc: "在线24小时", icon: "🌙", check: (s) => s.onlineSeconds >= 86400 },
  { id: "vip", name: "VIP会员", desc: "成为VIP用户", icon: "⭐", check: (s) => s.vip },
  { id: "admin", name: "管理员", desc: "成为管理员", icon: "🛡️", check: (s) => s.isAdmin },
];

export function getUserAchievements() {
  try {
    return JSON.parse(localStorage.getItem("v2_achievements") || "{}");
  } catch { return {}; }
}

export function saveUserAchievements(achs) {
  localStorage.setItem("v2_achievements", JSON.stringify(achs));
}

export function checkAchievements(stats) {
  const unlocked = getUserAchievements();
  let newUnlock = false;

  ACHIEVEMENTS.forEach(a => {
    if (unlocked[a.id]) return;
    if (a.check(stats)) {
      unlocked[a.id] = Date.now();
      newUnlock = true;
      showToast(`🏆 成就解锁: ${a.icon} ${a.name}`, "success");
    }
  });

  if (newUnlock) saveUserAchievements(unlocked);
  return newUnlock;
}

export function renderAchievementsPanel() {
  let panel = document.getElementById("v2-achievements-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-achievements-panel";
  panel.className = "v2-achievements-overlay";
  panel.innerHTML = `
    <div class="v2-achievements-modal">
      <div class="v2-achievements-header">
        <h2>🏆 成就</h2>
        <button class="v2-achievements-close" onclick="this.closest('#v2-achievements-panel').remove()">&times;</button>
      </div>
      <div class="v2-achievements-list"></div>
    </div>
  `;
  document.body.appendChild(panel);

  panel.addEventListener("click", e => {
    if (e.target === panel) panel.remove();
  });

  const unlocked = getUserAchievements();
  const list = panel.querySelector(".v2-achievements-list");
  list.innerHTML = ACHIEVEMENTS.map(a => {
    const isUnlocked = !!unlocked[a.id];
    return `
      <div class="v2-achievement${isUnlocked ? "" : " locked"}">
        <span class="v2-achievement-icon">${isUnlocked ? a.icon : "🔒"}</span>
        <div class="v2-achievement-info">
          <div class="v2-achievement-name">${a.name}</div>
          <div class="v2-achievement-desc">${a.desc}</div>
        </div>
        ${isUnlocked ? '<span class="v2-achievement-unlocked">✓</span>' : ''}
      </div>
    `;
  }).join("");
}

window.__v2_checkAchievements = checkAchievements;
window.__v2_renderAchievements = renderAchievementsPanel;
