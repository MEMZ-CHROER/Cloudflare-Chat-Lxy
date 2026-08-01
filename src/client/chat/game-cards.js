// 🃏 卡牌/记忆游戏组 — 21点 / 记忆翻牌 / 颜色序列记忆
import { gs, gameApi, updateBalance, registerGame, playGameSound } from './game-core.js';
import { state, showError } from './state.js';

// ========== 🃏 21点 ==========

const SUITS = ["♠","♥","♣","♦"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function cardValue(card) { if (card.rank === "A") return 11; if (["J","Q","K"].includes(card.rank)) return 10; return parseInt(card.rank); }
function handValue(hand) { let v = hand.reduce((s, c) => s + cardValue(c), 0); let aces = hand.filter(c => c.rank === "A").length; while (v > 21 && aces > 0) { v -= 10; aces--; } return v; }
function isRed(card) { return card.suit === "♥" || card.suit === "♦"; }
function bjDraw() { return { suit: SUITS[Math.floor(Math.random() * SUITS.length)], rank: RANKS[Math.floor(Math.random() * RANKS.length)] }; }

function bjRender() {
  let playerEl = document.getElementById("bj-player-cards");
  let dealerEl = document.getElementById("bj-dealer-cards");
  let pvEl = document.getElementById("bj-player-value");
  let dvEl = document.getElementById("bj-dealer-value");
  if (!playerEl) return;
  playerEl.innerHTML = gs.blackjack.hand.map(c => "<span class='bj-card" + (isRed(c) ? " bj-red" : "") + "'>" + c.rank + c.suit + "</span>").join("");
  let pv = handValue(gs.blackjack.hand);
  pvEl.textContent = "点数: " + pv;
  if (gs.blackjack.gameOver) {
    dealerEl.innerHTML = gs.blackjack.dealer.map(c => "<span class='bj-card" + (isRed(c) ? " bj-red" : "") + "'>" + c.rank + c.suit + "</span>").join("");
    document.getElementById("bj-dealer-value").textContent = "点数: " + handValue(gs.blackjack.dealer);
  } else {
    dealerEl.innerHTML = "<span class='bj-card" + (isRed(gs.blackjack.dealer[0]) ? " bj-red" : "") + "'>" + gs.blackjack.dealer[0].rank + gs.blackjack.dealer[0].suit + "</span><span class='bj-card bj-back'>🂠</span>";
    document.getElementById("bj-dealer-value").textContent = "点数: " + cardValue(gs.blackjack.dealer[0]) + " + ?";
  }
}

function renderBlackjack(el) {
  el.innerHTML = `
    <div class="game-area"><div class="bj-table">
      <div class="bj-dealer-hand" id="bj-dealer"><div class="bj-label">庄家</div><div class="bj-cards" id="bj-dealer-cards"></div><div class="bj-value" id="bj-dealer-value"></div></div>
      <div class="bj-divider"></div>
      <div class="bj-player-hand" id="bj-player"><div class="bj-label">你的手牌</div><div class="bj-cards" id="bj-player-cards"></div><div class="bj-value" id="bj-player-value"></div></div>
      <div class="bj-bet-row"><span>赌注:</span><input type="number" class="game-input" id="bj-bet" value="100" min="10" max="2000" step="10"></div>
      <div class="bj-btns" id="bj-btns"><button class="game-btn game-btn-sm" onclick="bjStart()">🃏 发牌</button></div>
      <div class="bj-msg" id="bj-msg">点击发牌开始</div>
      <div class="game-back" onclick="switchGame('menu')">← 返回游戏列表</div>
    </div></div>`;
  gs.blackjack = { hand: [], dealer: [], gameOver: false, bet: 0 };
  window.bjStart = bjStart; window.bjHit = bjHit; window.bjStand = bjStand;
}

async function bjStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError("请先设置用户名"); return; }
  let betEl = document.getElementById("bj-bet");
  let bet = Math.max(10, Math.min(2000, parseInt(betEl.value) || 100));
  betEl.value = bet;
  let r1 = await gameApi("bet", {game: "blackjack", wager: bet});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.blackjack = { hand: [bjDraw(), bjDraw()], dealer: [bjDraw(), bjDraw()], gameOver: false, bet };
  document.getElementById("bj-btns").innerHTML = '<button class="game-btn game-btn-sm" onclick="bjHit()">👆 要牌</button> <button class="game-btn game-btn-sm game-btn-sec" onclick="bjStand()">✋ 停牌</button>';
  bjRender();
  if (handValue(gs.blackjack.hand) === 21) { bjStand(); return; }
  document.getElementById("bj-msg").textContent = "要牌还是停牌？";
}

async function bjHit() {
  if (gs.blackjack.gameOver) return;
  gs.blackjack.hand.push(bjDraw()); bjRender();
  if (handValue(gs.blackjack.hand) > 21) {
    gs.blackjack.gameOver = true;
    document.getElementById("bj-msg").innerHTML = "<span class='game-lose'>😢 爆牌了！超过21点</span>";
    document.getElementById("bj-btns").innerHTML = '<button class="game-btn game-btn-sm" onclick="bjStart()">🃏 再来一局</button>';
  } else if (handValue(gs.blackjack.hand) === 21) { bjStand(); }
}

async function bjStand() {
  if (gs.blackjack.gameOver) return;
  gs.blackjack.gameOver = true;
  while (handValue(gs.blackjack.dealer) < 17) gs.blackjack.dealer.push(bjDraw());
  bjRender();
  let pv = handValue(gs.blackjack.hand), dv = handValue(gs.blackjack.dealer);
  let bet = gs.blackjack.bet, prize = 0;
  if (dv > 21 || pv > dv) {
    prize = pv === 21 && gs.blackjack.hand.length === 2 ? Math.floor(bet * 2.5) : bet * 2;
    document.getElementById("bj-msg").innerHTML = "<span class='game-win'>🎉 你赢了！获得 " + prize + " 积分！</span>";
  } else if (pv === dv) { prize = bet; document.getElementById("bj-msg").innerHTML = "🤝 平局，退换赌注"; }
  else { document.getElementById("bj-msg").innerHTML = "😢 庄家赢了，再试试"; }
  if (prize > 0) {
    let r2 = await gameApi("win", {game: "blackjack", win: prize});
    if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); }
  }
  document.getElementById("bj-btns").innerHTML = '<button class="game-btn game-btn-sm" onclick="bjStart()">🃏 再来一局</button>';
}

registerGame("blackjack", "🃏", "21点", "经典扑克 vs 庄家，Blackjack 2.5倍", renderBlackjack, () => ({ hand: [], dealer: [], gameOver: false, bet: 0 }));

// ========== 🀄 记忆翻牌 ==========

const MEMO_ICONS = ["🍎","🍊","🍋","🍇","🍉","🍓","🍑","🍒"];

function renderMemory(el) {
  let cards = [...MEMO_ICONS, ...MEMO_ICONS];
  for (let i = cards.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  gs.memory = { cards, flipped: [], matched: new Set(), moves: 0, gameOver: false, lockBoard: false, betPlaced: false };
  let html = '<div class="game-area"><div class="memory-box">';
  html += '<div class="memory-info"><span id="memory-moves">步数: 0</span></div>';
  html += '<div class="memory-board" id="memory-board">';
  cards.forEach((_, i) => { html += '<button class="memory-card memory-card-back" data-idx="' + i + '" onclick="memoryFlip(' + i + ')"></button>'; });
  html += '</div><div class="memory-result" id="memory-result">翻牌配对，找齐 8 对！</div>';
  html += '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  el.innerHTML = html;
  window.memoryFlip = memoryFlip;
}

async function memoryFlip(idx) {
  if (gs.memory.gameOver || gs.memory.lockBoard || gs.memory.flipped.includes(idx) || gs.memory.matched.has(idx)) return;
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError("请先设置用户名"); return; }
  if (!gs.memory.betPlaced) {
    gs.memory.betPlaced = true;
    let r1 = await gameApi("bet", {game: "memory", wager: 100});
    if (r1.error) { showError(r1.error); gs.memory.betPlaced = false; return; }
    gs.balance = r1.balance || gs.balance; updateBalance();
  }
  gs.memory.moves++;
  document.getElementById("memory-moves").textContent = "步数: " + gs.memory.moves;
  gs.memory.flipped.push(idx);
  let btn = document.querySelector('.memory-card[data-idx="' + idx + '"]');
  btn.textContent = gs.memory.cards[idx];
  btn.className = "memory-card memory-card-flipped";
  if (gs.memory.flipped.length === 2) {
    gs.memory.lockBoard = true;
    let [i1, i2] = gs.memory.flipped;
    if (gs.memory.cards[i1] === gs.memory.cards[i2]) {
      gs.memory.matched.add(i1); gs.memory.matched.add(i2);
      document.querySelector('.memory-card[data-idx="' + i1 + '"]').className = "memory-card memory-card-matched";
      document.querySelector('.memory-card[data-idx="' + i2 + '"]').className = "memory-card memory-card-matched";
      gs.memory.flipped = []; gs.memory.lockBoard = false;
      if (gs.memory.matched.size === 16) {
        gs.memory.gameOver = true;
        let m = gs.memory.moves, prize = 200;
        if (m <= 16) prize = 2000; else if (m <= 20) prize = 1000; else if (m <= 24) prize = 500;
        let r2 = await gameApi("win", {game: "memory", win: prize});
        if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); }
        document.getElementById("memory-result").innerHTML = "<span class='game-win'>🎉 全部配对！用了 " + m + " 步，获得 " + prize + " 积分！</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'memory\')">🔄 再来一局</button></div>';
      }
    } else {
      setTimeout(() => {
        let b1 = document.querySelector('.memory-card[data-idx="' + i1 + '"]');
        let b2 = document.querySelector('.memory-card[data-idx="' + i2 + '"]');
        if (b1 && !gs.memory.matched.has(i1)) { b1.textContent = ""; b1.className = "memory-card memory-card-back"; }
        if (b2 && !gs.memory.matched.has(i2)) { b2.textContent = ""; b2.className = "memory-card memory-card-back"; }
        gs.memory.flipped = []; gs.memory.lockBoard = false;
      }, 700);
    }
  }
}

registerGame("memory", "🀄", "记忆翻牌", "4×4 翻牌配对，步数越少分越高！", renderMemory, () => ({ cards: [], flipped: [], matched: new Set(), moves: 0, gameOver: false, lockBoard: false, betPlaced: false }));

// ========== 🎨 颜色序列记忆 ==========

const SIMON_COLORS = ["#e74c3c", "#f1c40f", "#2ecc71", "#3498db"];

function renderSimon(el) {
  gs.simon = { sequence: [], playerSeq: [], round: 0, playing: false, showing: false, gameOver: false, betPlaced: false };
  el.innerHTML = `
    <div class="game-area"><div class="simon-box">
      <div class="simon-header">轮次: <span id="simon-round">0</span> | 得分: <span id="simon-score">0</span></div>
      <div class="simon-grid">${SIMON_COLORS.map((c, i) => '<button class="simon-btn" data-i="' + i + '" style="background:' + c + '" onclick="simonClick(' + i + ')"></button>').join("")}</div>
      <div class="simon-msg" id="simon-msg">点击开始新游戏</div>
      <button class="game-btn" id="simon-start" onclick="simonStart()">🎨 开始</button>
      <div class="game-back" onclick="switchGame('menu')">← 返回游戏列表</div>
    </div></div>`;
  window.simonClick = simonClick; window.simonStart = simonStart;
}

async function simonStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError("请先设置用户名"); return; }
  let r1 = await gameApi("bet", {game: "simon", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let s = gs.simon; s.betPlaced = true; s.sequence = []; s.round = 0; s.score = 0; s.gameOver = false;
  document.getElementById("simon-start").style.display = "none";
  simonNext();
}

function simonNext() {
  let s = gs.simon; s.round++; s.sequence.push(Math.floor(Math.random() * 4)); s.playerSeq = []; s.showing = true;
  document.getElementById("simon-round").textContent = s.round;
  document.getElementById("simon-score").textContent = s.score;
  document.getElementById("simon-msg").textContent = "👀 注意看！";
  let i = 0;
  let interval = setInterval(() => {
    if (i >= s.sequence.length) { clearInterval(interval); document.querySelectorAll(".simon-btn").forEach(el => el.style.opacity = "1"); s.showing = false; document.getElementById("simon-msg").textContent = "🎯 轮到你！按顺序点击"; return; }
    if (i > 0) { let prev = document.querySelector('.simon-btn[data-i="' + s.sequence[i - 1] + '"]'); if (prev) prev.style.opacity = "1"; }
    let cur = document.querySelector('.simon-btn[data-i="' + s.sequence[i] + '"]'); if (cur) cur.style.opacity = "0.3";
    i++;
  }, 500);
}

async function simonClick(idx) {
  let s = gs.simon;
  if (s.gameOver || s.showing) return;
  s.playerSeq.push(idx);
  let btn = document.querySelector('.simon-btn[data-i="' + idx + '"]');
  if (btn) { btn.style.opacity = "0.3"; setTimeout(() => { if (btn) btn.style.opacity = "1"; }, 200); }
  if (s.playerSeq[s.playerSeq.length - 1] !== s.sequence[s.playerSeq.length - 1]) {
    s.gameOver = true;
    let prize = s.score;
    if (prize > 0) { let r2 = await gameApi("win", {game: "simon", win: prize}); if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }
    document.getElementById("simon-msg").innerHTML = "<span class='game-lose'>😢 点错了！完成 " + (s.round - 1) + " 轮，获得 " + prize + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'simon\')">🔄 再来一局</button></div>';
    return;
  }
  if (s.playerSeq.length === s.sequence.length) {
    s.score += 200; document.getElementById("simon-score").textContent = s.score;
    document.getElementById("simon-msg").textContent = "✅ 第 " + s.round + " 轮正确！+200";
    setTimeout(simonNext, 800);
  }
}

registerGame("simon", "🎨", "颜色序列记忆", "记住颜色序列并复现，越长越难分越高！", renderSimon, () => ({ sequence: [], playerSeq: [], round: 0, playing: false, showing: false, gameOver: false, betPlaced: false }));
