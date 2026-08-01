// 🎰 简单游戏组 — 老虎机 / 猜大小 / 石头剪刀布 / 幸运转盘
import { gs, gameApi, updateBalance, registerGame, playGameSound } from './game-core.js';
import { state, showError, t } from './state.js';

// ========== 🎰 老虎机 ==========

const S_SYMBOLS = ["🍒","🔔","💎","⭐","🍀","7️⃣","💥","🎰"];

function renderSlots(el) {
  el.innerHTML = `
    <div class="game-area">
      <div class="slots-machine">
        <div class="slots-reels">
          <div class="slots-reel" id="slots-r1">🍒</div>
          <div class="slots-reel" id="slots-r2">🍒</div>
          <div class="slots-reel" id="slots-r3">🍒</div>
        </div>
        <div class="slots-info">每次 <strong>100</strong> 积分 | 🎰 三连大奖 5000 分!</div>
        <div class="slots-result" id="slots-result"></div>
        <button class="game-btn" id="slots-spin" onclick="slotsSpin()">🎰 开始旋转</button>
        <div class="game-back" onclick="switchGame('menu')">← 返回游戏列表</div>
      </div>
    </div>`;
  gs.slots = { rolling: false };
  window.slotsSpin = slotsSpin;
}

async function slotsSpin() {
  if (gs.slots.rolling) return;
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  let r1 = await gameApi("bet", {game: "slots", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance;
  updateBalance();
  gs.slots.rolling = true;
  let spinBtn = document.getElementById("slots-spin");
  let resultEl = document.getElementById("slots-result");
  if (spinBtn) { spinBtn.disabled = true; spinBtn.textContent = t("旋转中..."); }
  if (resultEl) resultEl.textContent = "";
  let r = () => S_SYMBOLS[Math.floor(Math.random() * S_SYMBOLS.length)];
  let interval = setInterval(() => {
    document.getElementById("slots-r1").textContent = r();
    document.getElementById("slots-r2").textContent = r();
    document.getElementById("slots-r3").textContent = r();
  }, 80);
  let f1 = r(), f2 = r(), f3 = r();
  setTimeout(async () => {
    clearInterval(interval);
    document.getElementById("slots-r1").textContent = f1;
    document.getElementById("slots-r2").textContent = f2;
    document.getElementById("slots-r3").textContent = f3;
    let prize = 0, msg = t("很遗憾，没有中奖 😢");
    if (f1 === f2 && f2 === f3) { prize = 5000; msg = t("🎉🎉🎉 恭喜！三连大奖！获得 ") + prize + t(" 积分！"); }
    else if (f1 === f2 || f2 === f3 || f1 === f3) { prize = 200; msg = t("🎉 两个相同！获得 ") + prize + t(" 积分！"); }
    if (prize > 0) {
      playGameSound(prize >= 5000 ? 'levelup' : 'win');
      let r2 = await gameApi("win", {game: "slots", win: prize});
      if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); }
    }
    if (resultEl) resultEl.innerHTML = "<div class='slots-msg'>" + msg + "</div>";
    gs.slots.rolling = false;
    if (spinBtn) { spinBtn.disabled = false; spinBtn.textContent = t("🎰 再来一次"); }
  }, 800);
}

registerGame("slots", "🎰", "老虎机", "试试手气，三连中大奖！每次 100 积分", renderSlots, () => ({ rolling: false }));

// ========== 🎲 猜大小 ==========

function renderDice(el) {
  el.innerHTML = `
    <div class="game-area">
      <div class="dice-table">
        <div class="dice-display" id="dice-display">🎲 ?</div>
        <div class="dice-total" id="dice-total">点数: -</div>
        <div class="dice-bet-row"><span>赌注:</span><input type="number" class="game-input" id="dice-bet" value="100" min="10" max="1000" step="10"></div>
        <div class="dice-btns">
          <button class="game-btn game-btn-sm" onclick="dicePlay('low')">🔽 小 (2-6) ×2</button>
          <button class="game-btn game-btn-sm" onclick="dicePlay('high')">🔼 大 (8-12) ×2</button>
        </div>
        <div class="dice-msg" id="dice-msg">选择大或小下注</div>
        <div class="game-back" onclick="switchGame('menu')">← 返回游戏列表</div>
      </div>
    </div>`;
  gs.dice = { playing: false };
  window.dicePlay = dicePlay;
}

async function dicePlay(choice) {
  if (gs.dice.playing) return;
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  let betEl = document.getElementById("dice-bet");
  let bet = Math.max(10, Math.min(1000, parseInt(betEl.value) || 100));
  betEl.value = bet;
  let r1 = await gameApi("bet", {game: "dice", wager: bet});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.dice.playing = true;
  let msgEl = document.getElementById("dice-msg");
  let displayEl = document.getElementById("dice-display");
  let totalEl = document.getElementById("dice-total");
  let interval = setInterval(() => {
    let d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1;
    displayEl.textContent = "🎲 " + d1 + " + " + d2;
  }, 80);
  setTimeout(async () => {
    clearInterval(interval);
    let d1 = Math.floor(Math.random() * 6) + 1, d2 = Math.floor(Math.random() * 6) + 1;
    let total = d1 + d2;
    displayEl.textContent = "🎲 " + d1 + " + " + d2;
    totalEl.textContent = t("点数: ") + total;
    if (total === 7) {
      let r3 = await gameApi("win", {game: "dice", win: bet});
      if (!r3.error) { gs.balance = r3.balance || gs.balance; updateBalance(); }
      msgEl.innerHTML = t("🤝 平局！退换赌注"); gs.dice.playing = false; return;
    }
    let win = (choice === "low" && total >= 2 && total <= 6) || (choice === "high" && total >= 8 && total <= 12);
    if (win) {
      let prize = bet * 2;
      let r2 = await gameApi("win", {game: "dice", win: prize});
      if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); }
      msgEl.innerHTML = "<span class='game-win'>🎉 赢了！获得 " + prize + " 积分！</span>";
    } else { msgEl.innerHTML = t("😢 输了，再试试"); }
    gs.dice.playing = false;
  }, 600);
}

registerGame("dice", "🎲", t("猜大小"), t("猜骰子点数大小，最高 2 倍赔付"), renderDice, () => ({}));

// ========== ✂️ 石头剪刀布 ==========

const RPS_WIN = { rock: "scissors", paper: "rock", scissors: "paper" };
const RPS_EMOJI = { rock: "🪨", paper: "📄", scissors: "✂️" };
const RPS_CN = { rock: "石头", paper: "布", scissors: t("剪刀") };

function renderRPS(el) {
  el.innerHTML = `
    <div class="game-area"><div class="rps-box">
      <div class="rps-display">
        <div class="rps-player-area"><div class="rps-label">你</div><div class="rps-icon-big" id="rps-player-icon">🤚</div></div>
        <div class="rps-vs">VS</div>
        <div class="rps-computer-area"><div class="rps-label">电脑</div><div class="rps-icon-big" id="rps-cpu-icon">🤖</div></div>
      </div>
      <div class="rps-bet-row"><span>赌注:</span><input type="number" class="game-input" id="rps-bet" value="100" min="50" max="2000" step="50"></div>
      <div class="rps-btns">
        <button class="rps-choice" onclick="rpsPlay('rock')"><span class="rps-icon">🪨</span>石头</button>
        <button class="rps-choice" onclick="rpsPlay('paper')"><span class="rps-icon">📄</span>布</button>
        <button class="rps-choice" onclick="rpsPlay('scissors')"><span class="rps-icon">✂️</span>剪刀</button>
      </div>
      <div class="rps-result" id="rps-result">选择出拳开始</div>
      <div class="game-back" onclick="switchGame('menu')">← 返回游戏列表</div>
    </div></div>`;
  gs.rps = { playing: false };
  window.rpsPlay = rpsPlay;
}

async function rpsPlay(choice) {
  if (gs.rps.playing) return;
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  let betEl = document.getElementById("rps-bet");
  let bet = Math.max(50, Math.min(2000, parseInt(betEl.value) || 100));
  betEl.value = bet;
  let r1 = await gameApi("bet", {game: "rps", wager: bet});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.rps.playing = true;
  let resultEl = document.getElementById("rps-result");
  let playerIcon = document.getElementById("rps-player-icon");
  let cpuIcon = document.getElementById("rps-cpu-icon");
  let choices = ["rock","paper","scissors"];
  let anim = setInterval(() => {
    playerIcon.textContent = RPS_EMOJI[choices[Math.floor(Math.random() * 3)]];
    cpuIcon.textContent = RPS_EMOJI[choices[Math.floor(Math.random() * 3)]];
  }, 80);
  setTimeout(async () => {
    clearInterval(anim);
    let cpu = choices[Math.floor(Math.random() * 3)];
    playerIcon.textContent = RPS_EMOJI[choice];
    cpuIcon.textContent = RPS_EMOJI[cpu];
    if (choice === cpu) {
      let r3 = await gameApi("win", {game: "rps", win: bet});
      if (!r3.error) { gs.balance = r3.balance || gs.balance; updateBalance(); }
      resultEl.innerHTML = t("🤝 平局！退换赌注");
    } else if (RPS_WIN[choice] === cpu) {
      let prize = bet * 2;
      let r2 = await gameApi("win", {game: "rps", win: prize});
      if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); }
      resultEl.innerHTML = "<span class='game-win'>🎉 赢了！获得 " + prize + " 积分！</span>";
    } else {
      resultEl.innerHTML = t("😢 输了（你出 ") + RPS_CN[choice] + t("，电脑出 ") + RPS_CN[cpu] + "）";
    }
    gs.rps.playing = false;
  }, 400);
}

registerGame("rps", "✂️", "石头剪刀布", "经典对决，2 倍赔付！50-2000 积分自选下注", renderRPS, () => ({ playing: false }));

// ========== 🎡 幸运转盘 ==========

const WHEEL_SEGMENTS = [
  { label: "10", prize: 10, weight: 40 }, { label: "50", prize: 50, weight: 25 },
  { label: "100", prize: 100, weight: 15 }, { label: "200", prize: 200, weight: 8 },
  { label: "500", prize: 500, weight: 5 }, { label: "1000", prize: 1000, weight: 3 },
  { label: "2000", prize: 2000, weight: 2 }, { label: "5000", prize: 5000, weight: 1 },
];
const WHEEL_COLORS = ["#e74c3c","#f39c12","#2ecc71","#3498db","#9b59b6","#1abc9c","#e67e22","#34495e"];

function renderWheel(el) {
  gs.wheel = { spinning: false, gameOver: false, betPlaced: false, result: 0 };
  let gradientParts = [];
  let cumPct = 0;
  WHEEL_SEGMENTS.forEach((seg, i) => {
    let pct = 12.5;
    gradientParts.push(WHEEL_COLORS[i] + " " + cumPct + "% " + (cumPct + pct) + "%");
    cumPct += pct;
  });
  el.innerHTML = `
    <div class="game-area"><div class="wheel-box">
      <div class="wheel-container">
        <div class="wheel-pointer">▼</div>
        <div class="wheel-circle" id="wheel-circle" style="background:conic-gradient(${gradientParts.join(",")})">
          ${WHEEL_SEGMENTS.map((seg, i) => {
            let a = i * 45 + 22.5;
            return '<span class="wheel-label" style="transform:rotate(' + a + 'deg) translateY(-80px)">' + seg.label + '</span>';
          }).join("")}
        </div>
      </div>
      <div class="wheel-result" id="wheel-result">🎡 点击旋转试试运气！</div>
      <button class="game-btn" id="wheel-spin" onclick="wheelSpin()">🎡 旋转！</button>
      <div class="game-back" onclick="switchGame('menu')">← 返回游戏列表</div>
    </div></div>`;
  window.wheelSpin = wheelSpin;
}

function wheelPick() {
  let total = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let r = Math.random() * total, cum = 0;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) { cum += WHEEL_SEGMENTS[i].weight; if (r <= cum) return i; }
  return 0;
}

async function wheelSpin() {
  if (gs.wheel.spinning) return;
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  let r1 = await gameApi("bet", {game: "wheel", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.wheel.spinning = true;
  let circle = document.getElementById("wheel-circle");
  let spinBtn = document.getElementById("wheel-spin");
  if (spinBtn) { spinBtn.disabled = true; spinBtn.textContent = t("旋转中..."); }
  let idx = wheelPick();
  let targetAngle = 720 + idx * 45 + 22.5;
  circle.style.transition = "transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)";
  circle.style.transform = "rotate(" + targetAngle + "deg)";
  setTimeout(async () => {
    gs.wheel.spinning = false;
    let prize = WHEEL_SEGMENTS[idx].prize;
    document.getElementById("wheel-result").innerHTML = "<span class='game-win'>🎉 恭喜！获得 " + prize + " 积分！</span>";
    if (spinBtn) { spinBtn.disabled = false; spinBtn.textContent = t("🎡 再转一次"); }
    let r2 = await gameApi("win", {game: "wheel", win: prize});
    if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); }
  }, 3200);
}

registerGame("wheel", "🎡", "幸运转盘", "转动轮盘赢积分，最高 5000！", renderWheel, () => ({ spinning: false, gameOver: false, betPlaced: false, result: 0 }));
