// v2 lottery override — lottery/gacha system
import { state } from "./store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";
import { escapeHtml } from "../renderers.override.js";

export function openLottery() {
  let panel = document.getElementById("v2-lottery-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-lottery-panel";
  panel.className = "v2-lottery-overlay";
  panel.innerHTML = `
    <div class="v2-lottery-modal">
      <div class="v2-lottery-header">
        <h2>🎰 彩票</h2>
        <button class="v2-lottery-close" onclick="window.__v2_closeLottery()">&times;</button>
      </div>
      <div class="v2-lottery-balance">余额: <span id="v2-lottery-points">--</span> 🪙</div>
      <div class="v2-lottery-prices">
        <button class="v2-lottery-btn" onclick="window.__v2_doDraw('single')">单抽 (10🪙)</button>
        <button class="v2-lottery-btn" onclick="window.__v2_doDraw('ten')">十连抽 (90🪙)</button>
      </div>
      <div id="v2-lottery-result" class="v2-lottery-result"></div>
      <div class="v2-lottery-history">
        <h3>历史记录</h3>
        <div id="v2-lottery-history-list"></div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeLottery(); });
  loadLotteryData();
}

export function closeLottery() {
  const p = document.getElementById("v2-lottery-panel");
  if (p) p.remove();
}

async function loadLotteryData() {
  const token = localStorage.getItem("chat_token") || "";
  // Load balance
  fetch("/api/points/all", { headers: { "Cookie": `token=${token}` } })
    .then(r => r.json())
    .then(data => {
      const el = document.getElementById("v2-lottery-points");
      if (el) el.textContent = data[state.user?.name] || 0;
    })
    .catch(() => {});

  // Load history
  fetch("/api/lottery/history?limit=20", { headers: { "Cookie": `token=${token}` } })
    .then(r => r.json())
    .then(history => {
      const list = document.getElementById("v2-lottery-history-list");
      if (!list) return;
      if (!Array.isArray(history) || history.length === 0) {
        list.innerHTML = '<div class="v2-lottery-empty">暂无记录</div>';
        return;
      }
      list.innerHTML = history.slice(0, 20).map(h => `
        <div class="v2-lottery-history-item">
          <span class="v2-lottery-item-icon">${escapeHtml(h.icon || "🎁")}</span>
          <span class="v2-lottery-item-name">${escapeHtml(h.name)}</span>
          <span class="v2-lottery-item-rarity">${escapeHtml(h.rarity || "")}</span>
          <span class="v2-lottery-item-time">${new Date(h.timestamp).toLocaleTimeString()}</span>
        </div>
      `).join("");
    })
    .catch(() => {});
}

async function doDraw(type) {
  const token = localStorage.getItem("chat_token") || "";
  const resultEl = document.getElementById("v2-lottery-result");
  if (resultEl) resultEl.innerHTML = '<div class="v2-lottery-drawing">抽奖中...</div>';

  try {
    const res = await fetch("/api/lottery/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    if (data.ok) {
      if (resultEl) {
        const items = Array.isArray(data.items) ? data.items : [data.item];
        resultEl.innerHTML = items.map(item => `
          <div class="v2-lottery-won">
            <span class="v2-lottery-item-icon">${escapeHtml(item.icon || "🎁")}</span>
            <span class="v2-lottery-item-name">${escapeHtml(item.name)}</span>
            <span class="v2-lottery-item-rarity ${escapeHtml(item.rarity || '')}">${escapeHtml(item.rarity || '')}</span>
          </div>
        `).join("");
      }
      showSuccess(`获得: ${data.items?.map(i => i.name).join(", ") || data.item?.name || "物品"}`);
      loadLotteryData();
    } else {
      showError(data.error || "抽奖失败");
    }
  } catch (e) { showError("抽奖失败: " + e.message); }
}

window.__v2_openLottery = openLottery;
window.__v2_closeLottery = closeLottery;
window.__v2_doDraw = doDraw;
