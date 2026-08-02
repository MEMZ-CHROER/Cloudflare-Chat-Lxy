// ⭐ 成就面板 + 升级横幅（纯展示，不绑功能特权）
import { state, t, showToast } from './state.js';
import { escapeHtml } from './renderers.js';

// 成就定义（前端展示用，与服务端 registry/achievements.mjs 保持一致）
const ACH_DEFS = [
  { id: "first_msg",  icon: "💬", name: "初来乍到", desc: "发出第一条消息" },
  { id: "msg_100",    icon: "🗣️", name: "话痨",    desc: "累计发言 100 条" },
  { id: "msg_1000",   icon: "🔥", name: "舌战群儒", desc: "累计发言 1000 条" },
  { id: "checkin_1",  icon: "📅", name: "签到首日", desc: "完成第一次签到" },
  { id: "checkin_7",  icon: "📆", name: "一周坚持", desc: "累计签到 7 天" },
  { id: "game_win_1", icon: "🎮", name: "小试牛刀", desc: "赢得第一局游戏" },
  { id: "shop_1",     icon: "🛒", name: "剁手党",   desc: "完成第一次购物" },
  { id: "level_5",    icon: "⭐", name: "崭露头角", desc: "等级达到 Lv.5" },
  { id: "level_10",   icon: "🌟", name: "声名鹊起", desc: "等级达到 Lv.10" },
];
const ACH_NAME_MAP = {};
ACH_DEFS.forEach(a => { ACH_NAME_MAP[a.id] = a; });

// 🎉 升级横幅：全宽渐变，显示约 4 秒后消失（纯展示）
export function showLevelUpBanner(newLevel, exp) {
  let banner = document.getElementById("level-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "level-banner";
    document.body.appendChild(banner);
  }
  let lv = parseInt(newLevel) || 0;
  let expText = exp ? "（累计经验 " + Number(exp).toLocaleString() + "）" : "";
  banner.innerHTML = '🎉 ' + t("恭喜升级！") + ' <b>Lv.' + lv + '</b>' + expText;
  banner.classList.add("show");
  clearTimeout(banner._t);
  banner._t = setTimeout(() => banner.classList.remove("show"), 4000);
}

// 🏆 成就解锁 toast
export function showAchievementToast(achievementIds) {
  let names = (achievementIds || []).map(id => {
    let d = ACH_NAME_MAP[id];
    return (d ? d.icon + " " + d.name : id);
  });
  if (names.length) showToast("🏆 " + t("成就解锁：") + names.join("、"), "success", 5000);
}

// 🎛️ 成就面板（浮层，仿 highlights.js）
export async function toggleAchievementsPanel() {
  let existing = document.getElementById("achv-panel");
  if (existing) { existing.remove(); return; }

  let name = state.username;
  let token = localStorage.getItem("chat_token");
  if (!name) { showToast(t("请先设置用户名"), "warning"); return; }
  if (!token) { showToast(t("请先登录后再查看成就"), "warning"); return; }

  let data = null;
  try {
    let r = await fetch("/api/user/achievements?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token));
    if (!r.ok) { let e = await r.json().catch(() => ({})); throw new Error(e.error || "HTTP " + r.status); }
    data = await r.json();
  } catch (e) { showToast(t("加载失败: ") + e.message, "error"); return; }

  let overlay = document.createElement("div");
  overlay.id = "achv-panel";
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:150;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  let panel = document.createElement("div");
  panel.style.cssText = "background:var(--surface);border-radius:12px;padding:16px;min-width:300px;max-width:420px;max-height:75vh;box-shadow:0 8px 32px rgba(0,0,0,0.2);color:var(--text);font-size:13px;display:flex;flex-direction:column;overflow:hidden;";

  let level = data.level || 1;
  let cur = data.expCurrent || 0;
  let next = data.expNext || 100;
  let pct = next > 0 ? Math.min(100, Math.round((cur / next) * 100)) : 100;
  let unlockedSet = new Set(data.achievements || []);
  let stats = data.stats || {};

  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<strong style="font-size:15px;">⭐ ' + t("我的成就") + '</strong>' +
      '<span style="cursor:pointer;font-size:20px;line-height:1;color:var(--text-secondary);" id="achv-close">&times;</span>' +
    '</div>' +
    '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        '<span class="lv-badge" style="font-size:13px;">Lv.' + level + '</span>' +
        '<span style="color:var(--text-secondary);font-size:12px;">' + t("经验 ") + Number(data.exp || 0).toLocaleString() + '</span>' +
      '</div>' +
      '<div style="background:var(--surface);border-radius:4px;height:8px;overflow:hidden;position:relative;">' +
        '<div style="background:var(--primary);height:100%;width:' + pct + '%;transition:width .3s;"></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">' + cur + ' / ' + next + t(" 经验") + '（' + pct + '%）</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">' +
      '<div style="background:var(--bg);border-radius:6px;padding:6px 8px;text-align:center;"><div style="font-size:16px;">💬</div><div style="font-size:12px;color:var(--text-secondary);">' + t("发言 ") + (stats.msgCount || 0) + '</div></div>' +
      '<div style="background:var(--bg);border-radius:6px;padding:6px 8px;text-align:center;"><div style="font-size:16px;">📅</div><div style="font-size:12px;color:var(--text-secondary);">' + t("签到 ") + (stats.checkinCount || 0) + '</div></div>' +
      '<div style="background:var(--bg);border-radius:6px;padding:6px 8px;text-align:center;"><div style="font-size:16px;">🎮</div><div style="font-size:12px;color:var(--text-secondary);">' + t("游戏获胜 ") + (stats.gameWins || 0) + '</div></div>' +
      '<div style="background:var(--bg);border-radius:6px;padding:6px 8px;text-align:center;"><div style="font-size:16px;">🛒</div><div style="font-size:12px;color:var(--text-secondary);">' + t("购物 ") + (stats.shopCount || 0) + '</div></div>' +
    '</div>' +
    '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">🏆 ' + t("成就 ") + '(' + unlockedSet.size + '/' + ACH_DEFS.length + ')</div>' +
    '<div style="flex:1;overflow-y:auto;min-height:100px;">' +
      ACH_DEFS.map(a => {
        let got = unlockedSet.has(a.id);
        let row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;margin-bottom:4px;background:var(--bg);opacity:" + (got ? 1 : 0.55) + ";";
        row.innerHTML =
          '<span style="font-size:20px;flex:0 0 auto;">' + a.icon + '</span>' +
          '<span style="flex:1;min-width:0;">' +
            '<span style="display:block;font-weight:600;font-size:12px;">' + escapeHtml(a.name) + (got ? ' ✅' : '') + '</span>' +
            '<span style="display:block;font-size:11px;color:var(--text-secondary);">' + escapeHtml(a.desc) + '</span>' +
          '</span>';
        return row.outerHTML;
      }).join("") +
    '</div>';

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  let closeEl = document.getElementById("achv-close");
  if (closeEl) closeEl.onclick = () => overlay.remove();
}
