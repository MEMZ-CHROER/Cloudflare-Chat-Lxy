// v2 season override — seasonal battle pass / event system
import { state } from "./store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";
import { escapeHtml } from "../renderers.override.js";

export function openSeason() {
  let panel = document.getElementById("v2-season-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-season-panel";
  panel.className = "v2-season-overlay";
  panel.innerHTML = `
    <div class="v2-season-modal">
      <div class="v2-season-header">
        <h2>🏆 赛季</h2>
        <button class="v2-season-close" onclick="window.__v2_closeSeason()">&times;</button>
      </div>
      <div id="v2-season-content" class="v2-season-content"></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeSeason(); });
  loadSeason();
}

export function closeSeason() {
  const p = document.getElementById("v2-season-panel");
  if (p) p.remove();
}

async function loadSeason() {
  const token = localStorage.getItem("chat_token") || "";
  const content = document.getElementById("v2-season-content");
  if (!content) return;

  content.innerHTML = '<div class="v2-season-loading">加载中...</div>';

  try {
    const [seasonRes, progressRes] = await Promise.all([
      fetch("/api/season/current", { headers: { "Cookie": `token=${token}` } }),
      fetch("/api/season/progress", { headers: { "Cookie": `token=${token}` } }),
    ]);

    const season = await seasonRes.json();
    const progress = await progressRes.json();

    if (!season || !season.name) {
      content.innerHTML = '<div class="v2-season-empty">当前无赛季</div>';
      return;
    }

    const level = progress.level || 1;
    const exp = progress.exp || 0;
    const nextExp = (level) * 1000;
    const progressPercent = Math.min(100, Math.round((exp / nextExp) * 100));

    content.innerHTML = `
      <div class="v2-season-info">
        <div class="v2-season-name">${escapeHtml(season.name)}</div>
        <div class="v2-season-desc">${escapeHtml(season.description || "")}</div>
        <div class="v2-season-level">等级 ${level}</div>
        <div class="v2-season-exp-bar">
          <div class="v2-season-exp-fill" style="width:${progressPercent}%"></div>
        </div>
        <div class="v2-season-exp-text">${exp}/${nextExp} EXP</div>
      </div>
      <div class="v2-season-rewards">
        <h3>赛季奖励</h3>
        ${(season.rewards || []).map((r, i) => `
          <div class="v2-season-reward${i < level ? ' claimed' : ''}">
            <span class="v2-season-reward-icon">${escapeHtml(r.icon || "🎁")}</span>
            <span class="v2-season-reward-name">${escapeHtml(r.name)}</span>
            <span class="v2-season-reward-req">Lv.${r.level || i + 1}</span>
          </div>
        `).join("")}
      </div>
    `;
  } catch {
    content.innerHTML = '<div class="v2-season-error">加载失败</div>';
  }
}

window.__v2_openSeason = openSeason;
window.__v2_closeSeason = closeSeason;
