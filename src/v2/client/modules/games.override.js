// v2 games override — complete game hub with all games
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

const GAMES = {
  // Board games
  minesweeper: { name: "扫雷", icon: "💣", desc: "9×9经典扫雷，首击安全", module: "game-board" },
  t2048: { name: "2048", icon: "🔢", desc: "经典数字合并游戏", module: "game-board" },
  // Card games
  blackjack: { name: "21点", icon: "🃏", desc: "经典扑克 vs 庄家", module: "game-cards" },
  memory: { name: "记忆翻牌", icon: "🧠", desc: "配对记忆卡", module: "game-cards" },
  // Simple games
  slots: { name: "老虎机", icon: "🎰", desc: "三连中大奖！", module: "game-simple" },
  dice: { name: "猜大小", icon: "🎲", desc: "猜骰子点数大小", module: "game-simple" },
  rps: { name: "石头剪刀布", icon: "✂️", desc: "经典猜拳游戏", module: "game-simple" },
  breakout: { name: "打砖块", icon: "🏓", desc: "经典街机游戏", module: "game-arcade" },
  // Hacknet
  hacknet: { name: "Hacknet终端", icon: "🟢", desc: "黑客对战终端", module: "hacknet-game" },
};

export function openGames() {
  let panel = document.getElementById("v2-games-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-games-panel";
  panel.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:998;";
  
  let modal = document.createElement("div");
  modal.style.cssText = "background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:90%;max-width:500px;max-height:80vh;overflow:auto;";
  
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1.25rem;">🎮 游戏厅</h2>
      <button onclick="window.__v2_closeGames()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
      ${Object.entries(GAMES).map(function(entry) {
        let id = entry[0], g = entry[1];
        return '<div class="v2-game-card" onclick="window.__v2_launchGame(\'' + id + '\')" style="padding:16px;background:var(--bg);border-radius:8px;cursor:pointer;text-align:center;transition:transform 0.2s;" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">' +
          '<div style="font-size:32px;margin-bottom:8px;">' + g.icon + '</div>' +
          '<div style="font-size:14px;font-weight:bold;">' + g.name + '</div>' +
          '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">' + g.desc + '</div>' +
        '</div>';
      }).join("")}
    </div>
  `;
  
  panel.appendChild(modal);
  document.body.appendChild(panel);
  panel.addEventListener("click", function(e) { if (e.target === panel) window.__v2_closeGames(); });
}

export function closeGames() {
  const p = document.getElementById("v2-games-panel");
  if (p) p.remove();
  document.getElementById("v2-game-frame")?.remove();
}

export function launchGame(gameId) {
  const game = GAMES[gameId];
  if (!game) { showToast("游戏不存在", "error"); return; }
  
  // Close games panel first
  closeGames();
  
  // Import and launch the specific game module
  const moduleMap = {
    "game-board": () => window.__v2_launchGame?.(gameId),
    "game-cards": () => window.__v2_launchCardGame?.(gameId),
    "game-simple": () => window.__v2_launchSimpleGame?.(gameId),
    "game-arcade": () => window.__v2_openArcadeGame?.(gameId === "breakout" ? "breakout" : undefined),
    "hacknet-game": () => window.__v2_launchHacknetGame?.(),
  };
  
  const launcher = moduleMap[game.module];
  if (launcher) {
    launcher();
  } else {
    showToast("游戏开发中...", "info");
  }
}

export function closeGameFrame() {
  document.getElementById("v2-game-frame")?.remove();
}

// 兼容旧接口
window.__v2_openGames = openGames;
window.__v2_closeGames = closeGames;
window.__v2_launchGame = launchGame;
window.__v2_closeGameFrame = closeGameFrame;
