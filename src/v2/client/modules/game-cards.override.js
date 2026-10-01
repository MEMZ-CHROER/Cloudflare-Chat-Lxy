// v2 game cards — Blackjack + Memory Game
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

const SUITS = ["♠", "♥", "♣", "♦"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function openBlackjack() {
  const existing = document.getElementById("v2-blackjack-game");
  if (existing) { existing.remove(); return; }
  initBlackjack();
}

function initBlackjack() {
  const container = document.createElement("div");
  container.id = "v2-blackjack-game";
  container.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:360px;";

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1rem;">🃏 21点</h2>
      <button onclick="window.__v2_closeBlackjack()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;color:var(--text-secondary);">庄家</div>
        <div id="bj-dealer-cards" style="min-height:60px;display:flex;justify-content:center;gap:4px;"></div>
        <div id="bj-dealer-value" style="font-size:14px;font-weight:bold;"></div>
      </div>
      <div style="border-top:1px solid var(--border);padding:12px 0;"></div>
      <div>
        <div style="font-size:12px;color:var(--text-secondary);">你的手牌</div>
        <div id="bj-player-cards" style="min-height:60px;display:flex;justify-content:center;gap:4px;"></div>
        <div id="bj-player-value" style="font-size:14px;font-weight:bold;"></div>
      </div>
    </div>
    <div style="text-align:center;margin-bottom:12px;">
      <label style="font-size:12px;">赌注: </label>
      <input type="number" id="bj-bet" value="100" min="10" max="2000" step="10"
        style="width:80px;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);">
    </div>
    <div id="bj-btns" style="text-align:center;display:flex;gap:8px;justify-content:center;">
      <button class="game-btn" onclick="window.__v2_bjStart()" style="flex:1;">🃏 发牌</button>
    </div>
    <div id="bj-msg" style="text-align:center;margin-top:12px;font-size:13px;color:var(--text-secondary);">点击发牌开始</div>
  `;

  document.body.appendChild(container);
  window.__v2_blackjack = { hand: [], dealer: [], gameOver: false, bet: 0 };
}

function cardValue(card) {
  if (card.rank === "A") return 11;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return parseInt(card.rank);
}

function handValue(hand) {
  let v = hand.reduce(function(s, c) { return s + cardValue(c); }, 0);
  let aces = hand.filter(function(c) { return c.rank === "A"; }).length;
  while (v > 21 && aces > 0) { v -= 10; aces--; }
  return v;
}

function isRed(card) { return card.suit === "♥" || card.suit === "♦"; }

function bjDraw() {
  return { suit: SUITS[Math.floor(Math.random() * SUITS.length)], rank: RANKS[Math.floor(Math.random() * RANKS.length)] };
}

function bjRender() {
  const bj = window.__v2_blackjack;
  const playerEl = document.getElementById("bj-player-cards");
  const dealerEl = document.getElementById("bj-dealer-cards");
  const pvEl = document.getElementById("bj-player-value");
  const dvEl = document.getElementById("bj-dealer-value");

  if (playerEl) {
    playerEl.innerHTML = bj.hand.map(function(c) {
      return "<span style='display:inline-block;padding:4px 8px;background:" + (isRed(c) ? "#ef4444" : "#1e293b") + ";color:#fff;border-radius:4px;font-size:16px;margin:2px;'>" + c.rank + c.suit + "</span>";
    }).join("");
  }
  if (pvEl) pvEl.textContent = "点数: " + handValue(bj.hand);

  if (bj.gameOver && dealerEl) {
    dealerEl.innerHTML = bj.dealer.map(function(c) {
      return "<span style='display:inline-block;padding:4px 8px;background:" + (isRed(c) ? "#ef4444" : "#1e293b") + ";color:#fff;border-radius:4px;font-size:16px;margin:2px;'>" + c.rank + c.suit + "</span>";
    }).join("");
    if (dvEl) dvEl.textContent = "点数: " + handValue(bj.dealer);
  } else if (dealerEl && bj.dealer.length > 0) {
    dealerEl.innerHTML = "<span style='display:inline-block;padding:4px 8px;background:" + (isRed(bj.dealer[0]) ? "#ef4444" : "#1e293b") + ";color:#fff;border-radius:4px;font-size:16px;margin:2px;'>" + bj.dealer[0].rank + bj.dealer[0].suit + "</span><span style='display:inline-block;padding:4px 8px;background:#64748b;color:#fff;border-radius:4px;font-size:16px;margin:2px;'>🂠</span>";
    if (dvEl) dvEl.textContent = "点数: " + cardValue(bj.dealer[0]) + " + ?";
  }
}

window.__v2_bjStart = async function() {
  const bj = window.__v2_blackjack;
  let betEl = document.getElementById("bj-bet");
  let bet = Math.max(10, Math.min(2000, parseInt(betEl?.value) || 100));

  bj.hand = [bjDraw(), bjDraw()];
  bj.dealer = [bjDraw(), bjDraw()];
  bj.gameOver = false;
  bj.bet = bet;

  document.getElementById("bj-btns").innerHTML = '<button class="game-btn" onclick="window.__v2_bjHit()" style="flex:1;">👆 要牌</button> <button class="game-btn" onclick="window.__v2_bjStand()" style="flex:1;">✋ 停牌</button>';

  bjRender();

  if (handValue(bj.hand) === 21) { bjStand(); return; }
  document.getElementById("bj-msg").textContent = "要牌还是停牌？";
};

window.__v2_bjHit = function() {
  const bj = window.__v2_blackjack;
  if (bj.gameOver) return;
  bj.hand.push(bjDraw());
  bjRender();
  if (handValue(bj.hand) > 21) {
    bj.gameOver = true;
    document.getElementById("bj-msg").innerHTML = "<span style='color:#ef4444;'>😢 爆牌了！超过21点</span>";
    document.getElementById("bj-btns").innerHTML = '<button class="game-btn" onclick="window.__v2_bjStart()" style="flex:1;">🃏 再来一局</button>';
  } else if (handValue(bj.hand) === 21) { bjStand(); }
};

window.__v2_bjStand = async function() {
  const bj = window.__v2_blackjack;
  if (bj.gameOver) return;
  bj.gameOver = true;
  while (handValue(bj.dealer) < 17) bj.dealer.push(bjDraw());
  bjRender();

  let pv = handValue(bj.hand), dv = handValue(bj.dealer);
  let bet = bj.bet, prize = 0;

  if (dv > 21 || pv > dv) {
    prize = pv === 21 && bj.hand.length === 2 ? Math.floor(bet * 2.5) : bet * 2;
    document.getElementById("bj-msg").innerHTML = "<span style='color:#22c55e;'>🎉 你赢了！获得 " + prize + " 积分！</span>";
  } else if (pv === dv) {
    prize = bet;
    document.getElementById("bj-msg").textContent = "🤝 平局，退换赌注";
  } else {
    document.getElementById("bj-msg").innerHTML = "<span style='color:#ef4444;'>😢 庄家赢了，再试试</span>";
  }

  document.getElementById("bj-btns").innerHTML = '<button class="game-btn" onclick="window.__v2_bjStart()" style="flex:1;">🃏 再来一局</button>';
  showToast(prize > bet ? "赢了 " + (prize - bet) + " 积分！" : (prize === bet ? "平局" : "输了 " + bet + " 积分"), prize >= bet ? "success" : "error");
};

window.__v2_closeBlackjack = function() { document.getElementById("v2-blackjack-game")?.remove(); };

// ========== 记忆翻牌 ==========
const MEMO_ICONS = ["🍎", "🍊", "🍋", "🍇", "🍉", "🍓", "🍑", "🍒"];

export function openMemory() {
  const existing = document.getElementById("v2-memory-game");
  if (existing) { existing.remove(); return; }
  initMemory();
}

function initMemory() {
  const container = document.createElement("div");
  container.id = "v2-memory-game";
  container.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3);";

  let cards = [...MEMO_ICONS, ...MEMO_ICONS];
  for (let i = cards.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  window.__v2_memory = { cards: cards, flipped: [], matched: new Set(), moves: 0, gameOver: false, lockBoard: false };

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1rem;">🃏 记忆翻牌</h2>
      <div style="font-size:12px;">步数: <span id="memo-moves">0</span></div>
      <button onclick="window.__v2_closeMemory()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div id="memo-board" style="display:grid;grid-template-columns:repeat(4,60px);gap:8px;justify-content:center;"></div>
    <div id="memo-result" style="text-align:center;margin-top:16px;font-size:13px;"></div>
  `;

  document.body.appendChild(container);

  const board = document.getElementById("memo-board");
  cards.forEach(function(_, i) {
    const btn = document.createElement("button");
    btn.className = "memo-card memo-card-back";
    btn.dataset.idx = i;
    btn.style.cssText = "width:60px;height:60px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;";
    btn.addEventListener("click", function() { memoryFlip(i); });
    board.appendChild(btn);
  });
}

function memoryFlip(idx) {
  const m = window.__v2_memory;
  if (m.gameOver || m.lockBoard || m.flipped.includes(idx) || m.matched.has(idx)) return;

  m.moves++;
  document.getElementById("memo-moves").textContent = m.moves;
  m.flipped.push(idx);

  const btn = document.querySelector('.memo-card[data-idx="' + idx + '"]');
  if (btn) {
    btn.textContent = m.cards[idx];
    btn.style.background = "var(--primary)";
    btn.style.color = "#fff";
  }

  if (m.flipped.length === 2) {
    m.lockBoard = true;
    const i1 = m.flipped[0], i2 = m.flipped[1];
    if (m.cards[i1] === m.cards[i2]) {
      m.matched.add(i1);
      m.matched.add(i2);
      m.flipped = [];
      m.lockBoard = false;

      document.querySelector('.memo-card[data-idx="' + i1 + '"]').style.background = "#22c55e";
      document.querySelector('.memo-card[data-idx="' + i2 + '"]').style.background = "#22c55e";

      if (m.matched.size === 16) {
        m.gameOver = true;
        const prize = m.moves <= 16 ? 2000 : m.moves <= 20 ? 1000 : 500;
        document.getElementById("memo-result").innerHTML = "<span style='color:#22c55e;'>🎉 全部配对！用了 " + m.moves + " 步，获得 " + prize + " 积分！</span>";
        showToast("记忆游戏胜利！", "success");
      }
    } else {
      setTimeout(function() {
        [i1, i2].forEach(function(i) {
          const b = document.querySelector('.memo-card[data-idx="' + i + '"]');
          if (b && !m.matched.has(i)) {
            b.textContent = "";
            b.style.background = "var(--bg)";
            b.style.color = "";
          }
        });
        m.flipped = [];
        m.lockBoard = false;
      }, 800);
    }
  }
}

window.__v2_closeMemory = function() { document.getElementById("v2-memory-game")?.remove(); };
window.__v2_openMemory = openMemory;

// 导出给games模块使用
export function launchCardGame(gameId) {
  if (gameId === "blackjack") openBlackjack();
  else if (gameId === "memory") openMemory();
  else showToast("游戏开发中...", "info");
}

window.__v2_launchCardGame = launchCardGame;
