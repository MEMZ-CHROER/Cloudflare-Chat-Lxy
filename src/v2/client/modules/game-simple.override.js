// v2 game simple — Slots + Dice + Rock Paper Scissors
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

const S_SYMBOLS = ["🍒", "🔔", "💎", "⭐", "🍀", "7️⃣", "💥", "🎰"];
const RPS_WIN = { rock: "scissors", paper: "rock", scissors: "paper" };
const RPS_EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" };

// ========== 老虎机 ==========
export function openSlots() {
  const existing = document.getElementById("v2-slots-game");
  if (existing) { existing.remove(); return; }
  initSlots();
}

function initSlots() {
  const container = document.createElement("div");
  container.id = "v2-slots-game";
  container.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:300px;text-align:center;";

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1rem;">🎰 老虎机</h2>
      <button onclick="window.__v2_closeSlots()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div style="display:flex;justify-content:center;gap:12px;margin-bottom:16px;">
      <div id="slots-r1" style="font-size:48px;width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:8px;border:2px solid var(--border);">🍒</div>
      <div id="slots-r2" style="font-size:48px;width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:8px;border:2px solid var(--border);">🍒</div>
      <div id="slots-r3" style="font-size:48px;width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:8px;border:2px solid var(--border);">🍒</div>
    </div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">每次 100 积分 | 三连大奖 5000 分!</div>
    <div id="slots-result" style="min-height:24px;margin-bottom:12px;font-size:14px;"></div>
    <button id="slots-spin" class="game-btn" onclick="window.__v2_slotsSpin()" style="width:100%;">🎰 开始旋转</button>
  `;

  document.body.appendChild(container);
  window.__v2_slots = { rolling: false };
}

window.__v2_slotsSpin = async function() {
  if (window.__v2_slots.rolling) return;
  window.__v2_slots.rolling = true;

  const spinBtn = document.getElementById("slots-spin");
  const resultEl = document.getElementById("slots-result");
  if (spinBtn) { spinBtn.disabled = true; spinBtn.textContent = "旋转中..."; }
  if (resultEl) resultEl.textContent = "";

  let r = function() { return S_SYMBOLS[Math.floor(Math.random() * S_SYMBOLS.length)]; };
  let interval = setInterval(function() {
    document.getElementById("slots-r1").textContent = r();
    document.getElementById("slots-r2").textContent = r();
    document.getElementById("slots-r3").textContent = r();
  }, 80);

  let f1 = r(), f2 = r(), f3 = r();
  setTimeout(function() {
    clearInterval(interval);
    document.getElementById("slots-r1").textContent = f1;
    document.getElementById("slots-r2").textContent = f2;
    document.getElementById("slots-r3").textContent = f3;

    let prize = 0, msg = "很遗憾，没有中奖 😢";
    if (f1 === f2 && f2 === f3) {
      prize = 5000;
      msg = "🎉🎉🎉 恭喜！三连大奖！获得 " + prize + " 积分！";
    } else if (f1 === f2 || f2 === f3 || f1 === f3) {
      prize = 200;
      msg = "🎉 两个相同！获得 " + prize + " 积分！";
    }

    if (resultEl) resultEl.innerHTML = "<div style='color:" + (prize > 0 ? "#22c55e" : "#ef4444") + ";'>" + msg + "</div>";
    window.__v2_slots.rolling = false;
    if (spinBtn) { spinBtn.disabled = false; spinBtn.textContent = "🎰 再来一次"; }
    showToast(msg, prize > 0 ? "success" : "error");
  }, 800);
};

window.__v2_closeSlots = function() { document.getElementById("v2-slots-game")?.remove(); };

// ========== 猜大小 ==========
export function openDice() {
  const existing = document.getElementById("v2-dice-game");
  if (existing) { existing.remove(); return; }
  initDice();
}

function initDice() {
  const container = document.createElement("div");
  container.id = "v2-dice-game";
  container.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:300px;text-align:center;";

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1rem;">🎲 猜大小</h2>
      <button onclick="window.__v2_closeDice()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div id="dice-display" style="font-size:64px;margin:20px 0;">🎲 ?</div>
    <div id="dice-total" style="font-size:18px;margin-bottom:16px;">点数: -</div>
    <div style="margin-bottom:12px;">
      <label style="font-size:12px;">赌注: </label>
      <input type="number" id="dice-bet" value="100" min="10" max="1000" step="10"
        style="width:80px;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);">
    </div>
    <div style="display:flex;gap:12px;">
      <button class="game-btn" onclick="window.__v2_dicePlay('low')" style="flex:1;">🔽 小 (2-6) ×2</button>
      <button class="game-btn" onclick="window.__v2_dicePlay('high')" style="flex:1;">🔼 大 (8-12) ×2</button>
    </div>
    <div id="dice-msg" style="margin-top:12px;font-size:13px;color:var(--text-secondary);">选择大或小下注</div>
  `;

  document.body.appendChild(container);
  window.__v2_dice = { playing: false };
}

window.__v2_dicePlay = function(choice) {
  if (window.__v2_dice.playing) return;
  window.__v2_dice.playing = true;

  const betEl = document.getElementById("dice-bet");
  let bet = Math.max(10, Math.min(1000, parseInt(betEl?.value) || 100));

  const displayEl = document.getElementById("dice-display");
  const totalEl = document.getElementById("dice-total");
  const msgEl = document.getElementById("dice-msg");

  let interval = setInterval(function() {
    let d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1;
    displayEl.textContent = "🎲 " + d1 + " + " + d2;
  }, 80);

  setTimeout(function() {
    clearInterval(interval);
    let d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1;
    let total = d1 + d2;
    displayEl.textContent = "🎲 " + d1 + " + " + d2;
    totalEl.textContent = "点数: " + total;

    if (total === 7) {
      msgEl.innerHTML = "🤝 平局！退换赌注";
      window.__v2_dice.playing = false;
      return;
    }

    let win = (choice === "low" && total >= 2 && total <= 6) || (choice === "high" && total >= 8 && total <= 12);
    if (win) {
      let prize = bet * 2;
      msgEl.innerHTML = "<span style='color:#22c55e;'>🎉 赢了！获得 " + prize + " 积分！</span>";
      showToast("赢了 " + bet + " 积分！", "success");
    } else {
      msgEl.innerHTML = "<span style='color:#ef4444;'>😢 输了，再试试</span>";
      showToast("输了 " + bet + " 积分", "error");
    }
    window.__v2_dice.playing = false;
  }, 600);
};

window.__v2_closeDice = function() { document.getElementById("v2-dice-game")?.remove(); };

// ========== 石头剪刀布 ==========
export function openRPS() {
  const existing = document.getElementById("v2-rps-game");
  if (existing) { existing.remove(); return; }
  initRPS();
}

function initRPS() {
  const container = document.createElement("div");
  container.id = "v2-rps-game";
  container.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:300px;text-align:center;";

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1rem;">✂️ 石头剪刀布</h2>
      <button onclick="window.__v2_closeRPS()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div style="display:flex;justify-content:space-around;align-items:center;margin:20px 0;">
      <div>
        <div style="font-size:12px;color:var(--text-secondary);">你</div>
        <div id="rps-player-icon" style="font-size:48px;">🤚</div>
      </div>
      <div style="font-size:24px;font-weight:bold;">VS</div>
      <div>
        <div style="font-size:12px;color:var(--text-secondary);">电脑</div>
        <div id="rps-cpu-icon" style="font-size:48px;">🤖</div>
      </div>
    </div>
    <div id="rps-result" style="min-height:24px;margin-bottom:16px;font-size:14px;"></div>
    <div style="display:flex;gap:12px;justify-content:center;">
      <button class="game-btn" onclick="window.__v2_rpsPlay('rock')" style="flex:1;">🪨 石头</button>
      <button class="game-btn" onclick="window.__v2_rpsPlay('paper')" style="flex:1;">📄 布</button>
      <button class="game-btn" onclick="window.__v2_rpsPlay('scissors')" style="flex:1;">✂️ 剪刀</button>
    </div>
  `;

  document.body.appendChild(container);
}

window.__v2_rpsPlay = function(choice) {
  const choices = ["rock", "paper", "scissors"];
  const cpuChoice = choices[Math.floor(Math.random() * 3)];

  document.getElementById("rps-player-icon").textContent = RPS_EMOJI[choice];
  document.getElementById("rps-cpu-icon").textContent = RPS_EMOJI[cpuChoice];

  const resultEl = document.getElementById("rps-result");
  let result = "";

  if (choice === cpuChoice) {
    result = "🤝 平局！";
  } else if (RPS_WIN[choice] === cpuChoice) {
    result = "<span style='color:#22c55e;'>🎉 你赢了！</span>";
  } else {
    result = "<span style='color:#ef4444;'>😢 你输了！</span>";
  }

  resultEl.innerHTML = result;
  showToast(result.includes("赢") ? "猜拳胜利！" : (result.includes("输") ? "猜拳失败！" : "平局"), result.includes("赢") ? "success" : (result.includes("输") ? "error" : "info"));
};

window.__v2_closeRPS = function() { document.getElementById("v2-rps-game")?.remove(); };

// 导出给games模块使用
export function launchSimpleGame(gameId) {
  if (gameId === "slots") openSlots();
  else if (gameId === "dice") openDice();
  else if (gameId === "rps") openRPS();
  else showToast("游戏开发中...", "info");
}

window.__v2_launchSimpleGame = launchSimpleGame;
