// 🏆 v1.45 赛季弹窗（聊天室侧）— 查看当前赛季 + 各目标进度 + 荣誉奖励
// 全部 createElement + textContent 渲染（防 XSS）

import { getAuthName, getAuthToken, isAuthenticated } from './auth.js';

const GOAL_TYPE_LABEL = {
  msg: "发言", checkin: "签到", game: "游戏获胜", points: "赛季积分", achievement: "成就"
};

export function openSeason() {
  let overlay = document.getElementById("season-overlay");
  if (!overlay) return;
  overlay.classList.add("show");
  renderSeason();
}
export function closeSeason() {
  let overlay = document.getElementById("season-overlay");
  if (overlay) overlay.classList.remove("show");
}

function fmtTime(ts) {
  if (!ts) return "";
  try { return new Date(Number(ts)).toLocaleString(); } catch (e) { return String(ts); }
}

async function renderSeason() {
  let box = document.getElementById("season-content");
  if (!box) return;
  box.textContent = "加载中...";
  try {
    let r = await fetch("/api/season/status");
    let data = await r.json();
    if (!data || data.status === "none" || data.status === "ended") {
      box.textContent = data && data.status === "ended" ? "上赛季已结算，等待新赛季开启" : "当前没有进行中的赛季";
      return;
    }
    let frag = document.createDocumentFragment();

    // 赛季头部
    let head = document.createElement("div");
    head.style.cssText = "margin-bottom:12px;";
    let name = document.createElement("div");
    name.style.cssText = "font-size:16px;font-weight:700;";
    name.textContent = "🏆 " + (data.name || "赛季");
    head.appendChild(name);
    let meta = document.createElement("div");
    meta.style.cssText = "font-size:12px;color:var(--text-secondary);margin-top:2px;";
    meta.textContent = "开始 " + fmtTime(data.startAt) + " · 结束 " + fmtTime(data.endAt);
    head.appendChild(meta);
    frag.appendChild(head);

    let goals = Array.isArray(data.goals) ? data.goals : [];
    let loggedIn = isAuthenticated();
    // 未登录提示：目标行 current 显示 0，并提示登录查看进度
    if (!loggedIn) {
      let hint = document.createElement("div");
      hint.style.cssText = "font-size:12px;color:var(--text-secondary);margin-bottom:8px;";
      hint.textContent = "🔒 登录后查看我的赛季进度";
      frag.appendChild(hint);
    }
    // 进度（仅登录用户拉取，未登录则只显示目标与目标值）
    let progress = [];
    if (loggedIn) {
      try {
        let pr = await fetch("/api/season/progress?name=" + encodeURIComponent(getAuthName()) + "&token=" + encodeURIComponent(getAuthToken()));
        let pd = await pr.json();
        // 进度接口返回 goals 数组（每个目标含 current/reached），与 status.goals 同序
        if (pd && Array.isArray(pd.goals)) progress = pd.goals;
      } catch (e) {}
    }

    if (goals.length === 0) {
      let none = document.createElement("div");
      none.textContent = "本赛季暂无目标";
      frag.appendChild(none);
    } else {
      goals.forEach((g, i) => {
        let p = progress[i] || null;
        let row = document.createElement("div");
        row.style.cssText = "padding:10px 12px;margin-bottom:8px;background:#f8f9fa;border:1px solid var(--border);border-radius:10px;";
        // 顶部行：类型标签 + 荣誉奖励
        let top = document.createElement("div");
        top.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;";
        let lbl = document.createElement("span");
        lbl.style.cssText = "font-weight:600;";
        lbl.textContent = (GOAL_TYPE_LABEL[g.type] || g.type) + (g.label ? " · " + g.label : "");
        top.appendChild(lbl);
        let reward = document.createElement("span");
        reward.style.cssText = "color:#e67e22;font-size:12px;font-weight:600;";
        reward.textContent = "+" + g.honor + " 荣誉";
        top.appendChild(reward);
        row.appendChild(top);
        // 进度条
        let cur = p ? Number(p.current) : 0;
        let pct = Number(g.target) > 0 ? Math.min(100, (cur / Number(g.target)) * 100) : 0;
        let barOuter = document.createElement("div");
        barOuter.style.cssText = "height:8px;background:#e9ecef;border-radius:4px;overflow:hidden;";
        let bar = document.createElement("div");
        bar.style.cssText = "height:100%;width:" + pct.toFixed(1) + "%;background:linear-gradient(90deg,#4a6cf7,#8e44ad);border-radius:4px;";
        barOuter.appendChild(bar);
        row.appendChild(barOuter);
        // 底部行：进度数字 + 达成状态
        let status = document.createElement("div");
        status.style.cssText = "display:flex;justify-content:space-between;margin-top:5px;font-size:12px;color:var(--text-secondary);";
        let progressTxt = document.createElement("span");
        progressTxt.textContent = String(cur) + " / " + g.target;
        status.appendChild(progressTxt);
        let reached = document.createElement("span");
        if (p && p.reached) {
          reached.textContent = "✔ 已达成";
          reached.style.color = "#27ae60";
          reached.style.fontWeight = "600";
        } else {
          reached.textContent = "未达成";
        }
        status.appendChild(reached);
        row.appendChild(status);
        frag.appendChild(row);
      });
    }
    box.textContent = "";
    box.appendChild(frag);
  } catch (e) {
    box.textContent = "加载失败";
  }
}
