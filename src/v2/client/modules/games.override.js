// v2 games override — simple browser games hub
import { state } from "./store.js";
import { showToast, showSuccess } from "./toast.override.js";

const GAMES = {
  2048: { name: "2048", icon: "🔢", desc: "经典数字合并游戏" },
  flappy: { name: "Flappy Bird", icon: "🐦", desc: "躲避障碍" },
  snake: { name: "贪吃蛇", icon: "🐍", desc: "经典贪吃蛇" },
  memory: { name: "记忆卡片", icon: "🃏", desc: "配对记忆卡" },
  tetris: { name: "俄罗斯方块", icon: "🟦", desc: "经典方块消除" },
};

export function openGames() {
  let panel = document.getElementById("v2-games-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-games-panel";
  panel.className = "v2-games-overlay";
  panel.innerHTML = `
    <div class="v2-games-modal">
      <div class="v2-games-header">
        <h2>🎮 游戏厅</h2>
        <button class="v2-games-close" onclick="window.__v2_closeGames()">&times;</button>
      </div>
      <div class="v2-games-grid">
        ${Object.entries(GAMES).map(([id, g]) => `
          <div class="v2-game-card" onclick="window.__v2_launchGame('${id}')">
            <div class="v2-game-icon">${g.icon}</div>
            <div class="v2-game-name">${g.name}</div>
            <div class="v2-game-desc">${g.desc}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeGames(); });
}

export function closeGames() {
  const p = document.getElementById("v2-games-panel");
  if (p) p.remove();
  // Remove any game iframe
  document.getElementById("v2-game-frame")?.remove();
}

export function launchGame(gameId) {
  // Remove existing game
  document.getElementById("v2-game-frame")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "v2-game-frame";
  overlay.className = "v2-game-frame-overlay";
  overlay.innerHTML = `
    <div class="v2-game-frame-container">
      <div class="v2-game-frame-header">
        <span>${GAMES[gameId]?.name || gameId}</span>
        <button class="v2-game-frame-close" onclick="window.__v2_closeGameFrame()">&times;</button>
      </div>
      <iframe class="v2-game-iframe" src="/static/games/${gameId}.html" sandbox="allow-scripts allow-same-origin"></iframe>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", e => { if (e.target === overlay) window.__v2_closeGameFrame(); });
}

export function closeGameFrame() {
  document.getElementById("v2-game-frame")?.remove();
}

// Simple 2048 game inlined
export function launch2048() {
  launchGame("2048");
}

window.__v2_openGames = openGames;
window.__v2_closeGames = closeGames;
window.__v2_launchGame = launchGame;
window.__v2_closeGameFrame = closeGameFrame;
