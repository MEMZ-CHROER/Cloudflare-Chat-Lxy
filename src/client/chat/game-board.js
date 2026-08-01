// 🧩 网格游戏组 — 扫雷 / 2048 / 舒尔特方格 / 打靶 / 打飞碟
import { gs, gameApi, updateBalance, registerGame, playGameSound } from './game-core.js';
import { state, showError } from './state.js';

// ========== 💣 扫雷 ==========

function msGenBoard(exR, exC) {
  let board = Array.from({length: 9}, () => Array(9).fill(0));
  let exclude = new Set();
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) exclude.add((exR + dr) + "," + (exC + dc));
  let placed = 0;
  while (placed < 10) { let r = Math.floor(Math.random() * 9), c = Math.floor(Math.random() * 9); if (!exclude.has(r + "," + c) && board[r][c] !== "M") { board[r][c] = "M"; placed++; } }
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (board[r][c] === "M") continue;
    let cnt = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { let nr = r + dr, nc = c + dc; if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && board[nr][nc] === "M") cnt++; }
    board[r][c] = cnt;
  }
  return board;
}

function msReveal(r, c) {
  let ms = gs.minesweeper, key = r + "," + c;
  if (r < 0 || r >= 9 || c < 0 || c >= 9 || ms.revealed.has(key) || ms.flags.has(key)) return;
  ms.revealed.add(key);
  let cell = document.querySelector('.minesweeper-cell[data-r="' + r + '"][data-c="' + c + '"]');
  let val = ms.board[r][c];
  if (val === 0) { cell.className = "minesweeper-cell minesweeper-cell-revealed"; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) msReveal(r + dr, c + dc); }
  else { cell.className = "minesweeper-cell minesweeper-cell-revealed minesweeper-cell-" + val; cell.textContent = val; }
}

function checkMsWin() {
  let ms = gs.minesweeper;
  if (ms.revealed.size >= 71) {
    ms.gameOver = true;
    for (let rr = 0; rr < 9; rr++) for (let cc = 0; cc < 9; cc++) { if (ms.board[rr][cc] === "M") { let mc = document.querySelector('.minesweeper-cell[data-r="' + rr + '"][data-c="' + cc + '"]'); if (mc) { mc.textContent = "🚩"; mc.className = "minesweeper-cell minesweeper-cell-flagged"; } } }
    document.getElementById("ms-result").innerHTML = "<span class='game-win'>🎉 全部排完！获得 3000 积分！</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'minesweeper\')">🔄 再来一局</button></div>';
    gameApi("win", {game: "minesweeper", win: 3000}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } });
  }
}

function renderMinesweeper(el) {
  gs.minesweeper = { board: [], revealed: new Set(), gameOver: false, firstClick: true, flagMode: false, rows: 9, cols: 9, mineCount: 10, flags: new Set() };
  el.innerHTML = '<div class="game-area"><div class="minesweeper-box">'
    + '<div class="minesweeper-info"><span>💣 雷: <span id="ms-mine-count">10</span></span><button class="minesweeper-flag-toggle" id="ms-flag-btn" onclick="msToggleFlag()">🚩 插旗</button></div>'
    + '<div class="minesweeper-board" id="ms-board">'
    + Array.from({length: 81}, (_, i) => '<button class="minesweeper-cell" data-r="' + Math.floor(i/9) + '" data-c="' + i%9 + '" onclick="msClick(' + Math.floor(i/9) + ',' + i%9 + ')"></button>').join("")
    + '</div><div class="minesweeper-result" id="ms-result">点击格子开始，首击安全！</div>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.msClick = msClick; window.msToggleFlag = msToggleFlag;
}

async function msClick(r, c) {
  let ms = gs.minesweeper, key = r + "," + c;
  if (ms.gameOver || ms.flags.has(key)) return;
  if (ms.firstClick) {
    ms.firstClick = false;
    let r1 = await gameApi("bet", {game: "minesweeper", wager: 200});
    if (r1.error) { showError(r1.error); ms.firstClick = true; return; }
    gs.balance = r1.balance || gs.balance; updateBalance();
    ms.board = msGenBoard(r, c); ms.revealed = new Set(); ms.flags = new Set();
    msReveal(r, c); checkMsWin(); return;
  }
  if (ms.board[r][c] === "M") {
    ms.gameOver = true;
    for (let rr = 0; rr < 9; rr++) for (let cc = 0; cc < 9; cc++) { if (ms.board[rr][cc] === "M") { let mc = document.querySelector('.minesweeper-cell[data-r="' + rr + '"][data-c="' + cc + '"]'); if (mc) { mc.textContent = "💣"; mc.className = "minesweeper-cell minesweeper-cell-mine"; } } }
    document.getElementById("ms-result").innerHTML = "<span class='game-lose'>💥 踩雷了！游戏结束</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'minesweeper\')">🔄 再来一局</button></div>';
  } else { msReveal(r, c); checkMsWin(); }
}

function msToggleFlag() { gs.minesweeper.flagMode = !gs.minesweeper.flagMode; document.getElementById("ms-flag-btn").classList.toggle("active", gs.minesweeper.flagMode); }

registerGame("minesweeper", "💣", "扫雷", "9×9 经典扫雷，首击安全！全清奖 3000 分", renderMinesweeper, () => ({ board: [], revealed: new Set(), gameOver: false, firstClick: true, flagMode: false, rows: 9, cols: 9, mineCount: 10, flags: new Set() }));

// ========== 🧩 2048 ==========

function t2048Init() { let g = Array.from({length: 4}, () => Array(4).fill(0)); return t2048AddTile(t2048AddTile(g)); }
function t2048AddTile(grid) { let empty = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (grid[r][c] === 0) empty.push([r, c]); if (!empty.length) return grid; let [r, c] = empty[Math.floor(Math.random() * empty.length)]; grid[r][c] = Math.random() < 0.9 ? 2 : 4; return grid; }
function t2048SlideRow(row) { let arr = row.filter(v => v !== 0), score = 0; for (let i = 0; i < arr.length - 1; i++) { if (arr[i] === arr[i + 1]) { arr[i] *= 2; score += arr[i]; arr.splice(i + 1, 1); } } while (arr.length < 4) arr.push(0); return { row: arr, score }; }

function t2048Move(dir) {
  if (gs.t2048.gameOver) return; let gs8 = gs.t2048;
  if (!gs8.betPlaced) {
    gs8.betPlaced = true;
    let name = state.username || localStorage.getItem("chat_user") || "";
    if (name) { gameApi("bet", {game: "t2048", wager: 200}).then(r1 => { if (!r1.error) { gs.balance = r1.balance || gs.balance; updateBalance(); } }); }
  }
  let old = JSON.stringify(gs8.grid), score = 0;
  if (dir === 0) { for (let r = 0; r < 4; r++) { let res = t2048SlideRow(gs8.grid[r]); gs8.grid[r] = res.row; score += res.score; } }
  else if (dir === 2) { for (let r = 0; r < 4; r++) { let res = t2048SlideRow(gs8.grid[r].slice().reverse()); gs8.grid[r] = res.row.reverse(); score += res.score; } }
  else if (dir === 1) { for (let c = 0; c < 4; c++) { let col = [gs8.grid[0][c], gs8.grid[1][c], gs8.grid[2][c], gs8.grid[3][c]]; let res = t2048SlideRow(col); for (let r = 0; r < 4; r++) gs8.grid[r][c] = res.row[r]; score += res.score; } }
  else if (dir === 3) { for (let c = 0; c < 4; c++) { let col = [gs8.grid[3][c], gs8.grid[2][c], gs8.grid[1][c], gs8.grid[0][c]]; let res = t2048SlideRow(col); for (let r = 0; r < 4; r++) gs8.grid[3 - r][c] = res.row[r]; score += res.score; } }
  if (JSON.stringify(gs8.grid) === old) return; gs8.score += score; gs8.grid = t2048AddTile(gs8.grid);
  let maxTile = 0; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (gs8.grid[r][c] > maxTile) maxTile = gs8.grid[r][c];
  if (maxTile >= 2048 && !gs8.paid && !gs8.won) { gs8.won = true; gs8.paid = true; gameApi("win", {game: "t2048", win: 5000}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
  let canMove = false; for (let r = 0; r < 4 && !canMove; r++) for (let c = 0; c < 4 && !canMove; c++) { if (gs8.grid[r][c] === 0) canMove = true; else if (c < 3 && gs8.grid[r][c] === gs8.grid[r][c + 1]) canMove = true; else if (r < 3 && gs8.grid[r][c] === gs8.grid[r + 1][c]) canMove = true; }
  if (!canMove) { gs8.gameOver = true; if (!gs8.paid && maxTile >= 512) { gs8.paid = true; let p = maxTile >= 2048 ? 5000 : maxTile >= 1024 ? 1000 : 200; gameApi("win", {game: "t2048", win: p}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); } }
  t2048RenderGrid(document.getElementById("game-content"));
}

function t2048RenderGrid(el) {
  if (!el) el = document.getElementById("game-content"); if (!el) return;
  let gs8 = gs.t2048, maxTile = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (gs8.grid[r][c] > maxTile) maxTile = gs8.grid[r][c];
  let html = '<div class="game-area"><div class="t2048-box">';
  html += '<div class="t2048-header"><div class="t2048-score">🏆 ' + gs8.score + '</div><div class="t2048-score">最大: ' + maxTile + '</div></div>';
  html += '<div class="t2048-grid" id="t2048-grid" ontouchstart="t2048TouchStart(event)" ontouchend="t2048TouchEnd(event)">';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let v = gs8.grid[r][c]; html += '<div class="t2048-cell' + (v > 0 ? ' t2048-tile-' + v : '') + '">' + (v || "") + '</div>'; }
  html += '</div><div class="t2048-hint">方向键 / 点击箭头移动</div>';
  html += '<div class="t2048-btns"><div style="display:flex;flex-direction:column;align-items:center;gap:4px;">';
  html += '<button class="t2048-arrow" onclick="t2048Move(1)">⬆️</button><div style="display:flex;gap:4px;"><button class="t2048-arrow" onclick="t2048Move(0)">⬅️</button><button class="t2048-arrow" onclick="t2048Move(2)">➡️</button></div><button class="t2048-arrow" onclick="t2048Move(3)">⬇️</button></div></div>';
  html += '<div class="t2048-result" id="t2048-result">';
  if (gs8.gameOver) html += "<span style='font-weight:700;color:var(--text-secondary);'>游戏结束</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'t2048\')">🔄 再来一局</button></div>';
  else if (gs8.won) html += "<span class='game-win'>🎉 达到 2048！获得 5000 积分，继续挑战更高分！</span>";
  html += '</div><div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  el.innerHTML = html;
  window.t2048Move = t2048Move; window.t2048TouchStart = t2048TouchStart; window.t2048TouchEnd = t2048TouchEnd;
}

function t2048TouchStart(e) { let t = e.touches[0]; gs.t2048.touchStartX = t.clientX; gs.t2048.touchStartY = t.clientY; }
function t2048TouchEnd(e) { let t = e.changedTouches[0], dx = t.clientX - gs.t2048.touchStartX, dy = t.clientY - gs.t2048.touchStartY; if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return; t2048Move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 0) : (dy > 0 ? 3 : 1)); }

function render2048(el) {
  gs.t2048 = { grid: t2048Init(), score: 0, gameOver: false, won: false, paid: false, betPlaced: false, touchStartX: 0, touchStartY: 0 };
  t2048RenderGrid(el);
  document.removeEventListener("keydown", t2048KeyHandler);
  document.addEventListener("keydown", t2048KeyHandler);
}

function t2048KeyHandler(e) { if (gs.currentGame !== "t2048") return; const m = { "ArrowLeft": 0, "ArrowUp": 1, "ArrowRight": 2, "ArrowDown": 3 }; if (e.key in m) { e.preventDefault(); t2048Move(m[e.key]); } }

registerGame("t2048", "🧩", "2048", "合并方块冲击 2048，最高 5000 分！键盘/触屏", render2048, () => ({ grid: null, score: 0, gameOver: false, won: false, paid: false, betPlaced: false, touchStartX: 0, touchStartY: 0 }));

// ========== 📋 舒尔特方格 ==========

function renderSchulte(el) {
  let size = Math.max(3, Math.min(8, parseInt(localStorage.getItem("schulte_size")) || 5));
  let total = size * size, nums = Array.from({length: total}, (_, i) => i + 1);
  for (let i = nums.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  gs.schulte = { nums, next: 1, startTime: 0, gameOver: false, betPlaced: false, size, total };
  let html = '<div class="game-area"><div class="schulte-box">';
  html += '<div class="schulte-header"><span>下一个: <span id="schulte-next">1</span></span><span>⏱️ <span id="schulte-time">0.0</span>s</span></div>';
  html += '<div class="schulte-size-row">大小: ' + [3,4,5,6,7,8].map(s => '<button class="schulte-size-btn' + (s === size ? ' active' : '') + '" onclick="schulteSetSize(' + s + ')">' + s + '×' + s + '</button>').join("") + '</div>';
  html += '<div class="schulte-grid" style="grid-template-columns:repeat(' + size + ',56px)">';
  nums.forEach((n, i) => { html += '<button class="schulte-cell" data-idx="' + i + '" data-n="' + n + '" onclick="schulteClick(' + i + ')">' + n + '</button>'; });
  html += '</div><div class="schulte-msg" id="schulte-msg">点击数字 1 开始</div>';
  html += '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  el.innerHTML = html;
  window.schulteClick = schulteClick; window.schulteSetSize = schulteSetSize;
}

function schulteSetSize(s) { localStorage.setItem("schulte_size", String(s)); window.switchGame("schulte"); }

async function schulteClick(idx) {
  let s = gs.schulte, n = s.nums[idx];
  if (s.gameOver) return;
  if (n !== s.next) { document.getElementById("schulte-msg").textContent = t("❌ 应该点 ") + s.next; return; }
  if (!s.betPlaced) {
    let name = state.username || localStorage.getItem("chat_user") || "";
    if (!name) { showError(t("请先设置用户名")); return; }
    let r1 = await gameApi("bet", {game: "schulte", wager: 100});
    if (r1.error) { showError(r1.error); return; }
    gs.balance = r1.balance || gs.balance; updateBalance(); s.betPlaced = true; s.startTime = Date.now();
  }
  let btn = document.querySelector('.schulte-cell[data-idx="' + idx + '"]'); btn.className = "schulte-cell schulte-done";
  if (s.next === s.total) {
    s.gameOver = true;
    let elapsed = Date.now() - s.startTime;
    let baseScore = s.size <= 4 ? 60000 : s.size <= 5 ? 30000 : s.size <= 6 ? 120000 : 240000;
    let pts = Math.max(50, Math.floor((baseScore - elapsed) / 100));
    document.getElementById("schulte-msg").innerHTML = "<span class='game-win'>🎉 完成！用时 " + (elapsed / 1000).toFixed(1) + "s，获得 " + pts + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'schulte\')">🔄 再来一局</button></div>';
    let r2 = await gameApi("win", {game: "schulte", win: pts}); if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); }
  } else {
    s.next++; document.getElementById("schulte-next").textContent = s.next;
    document.getElementById("schulte-time").textContent = ((Date.now() - s.startTime) / 1000).toFixed(1);
    document.getElementById("schulte-msg").textContent = t("✅ 继续点 ") + s.next;
  }
}

registerGame("schulte", "📋", "舒尔特方格", "5×5 数字按顺序点击，考验注意力！可调大小", renderSchulte, () => ({ nums: [], next: 1, startTime: 0, gameOver: false, betPlaced: false, size: 5, total: 25 }));

// ========== 🎯 打靶 ==========

function renderTarget(el) {
  gs.target = { round: 0, score: 0, maxRounds: 15, gameOver: false, timer: null, targetRow: -1, targetCol: -1, roundStart: 0, betPlaced: false };
  el.innerHTML = '<div class="game-area"><div class="target-box">'
    + '<div class="target-header"><span>🎯 第 <span id="target-round">0</span>/15</span><span>得分: <span id="target-score">0</span></span></div>'
    + '<div class="target-grid" id="target-grid">'
    + Array.from({length: 25}, (_, i) => '<button class="target-cell" data-r="' + Math.floor(i/5) + '" data-c="' + i%5 + '" onclick="targetClick(' + Math.floor(i/5) + ',' + i%5 + ')"></button>').join("")
    + '</div><div class="target-msg" id="target-msg">点击开始</div>'
    + '<button class="game-btn" id="target-start" onclick="targetStart()">🎯 开始打靶</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.targetClick = targetClick; window.targetStart = targetStart;
}

async function targetStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  let r1 = await gameApi("bet", {game: "target", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.target.betPlaced = true; gs.target.round = 0; gs.target.score = 0; gs.target.gameOver = false;
  document.getElementById("target-start").style.display = "none"; targetNext();
}

function targetNext() {
  let t = gs.target;
  if (t.round >= t.maxRounds) {
    t.gameOver = true; let prize = t.score * 10;
    if (prize > 0) { gameApi("win", {game: "target", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    document.getElementById("target-msg").innerHTML = "<span class='" + (t.score >= 100 ? "game-win" : "game-lose") + "'>🎯 完成！得分 " + t.score + "，获得 " + prize + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'target\')">🔄 再来一局</button></div>';
    return;
  }
  document.querySelectorAll(".target-cell").forEach(el => { el.textContent = ""; el.classList.remove("target-hit"); });
  t.targetRow = Math.floor(Math.random() * 5); t.targetCol = Math.floor(Math.random() * 5); t.roundStart = Date.now();
  let cell = document.querySelector('.target-cell[data-r="' + t.targetRow + '"][data-c="' + t.targetCol + '"]');
  if (cell) { cell.textContent = "🎯"; cell.classList.add("target-hit"); }
  document.getElementById("target-round").textContent = t.round + 1; document.getElementById("target-score").textContent = t.score;
  document.getElementById("target-msg").textContent = t("点击 🎯 目标！");
  if (t.timer) clearTimeout(t.timer);
  t.timer = setTimeout(() => { if (!t.gameOver) { document.getElementById("target-msg").textContent = t("⏰ 超时！"); t.round++; setTimeout(targetNext, 500); } }, 3000);
}

function targetClick(r, c) {
  let t = gs.target;
  if (t.gameOver) return;
  if (r === t.targetRow && c === t.targetCol) {
    let pts = Math.max(1, Math.floor((3000 - (Date.now() - t.roundStart)) / 100) + 1);
    t.score += pts; document.getElementById("target-score").textContent = t.score;
    document.getElementById("target-msg").textContent = t("🎯 命中！+") + pts + t(" 分"); t.round++;
    if (t.timer) clearTimeout(t.timer); setTimeout(targetNext, 400);
  } else { document.getElementById("target-msg").textContent = t("❌ 没打中！"); }
}

registerGame("target", "🎯", "打靶", "5×5 网格中快速点击目标，越准越快分越高", renderTarget, () => ({ round: 0, score: 0, maxRounds: 15, gameOver: false, timer: null, targetRow: -1, targetCol: -1, roundStart: 0, betPlaced: false }));

// ========== 🪐 打飞碟 ==========

function renderUFO(el) {
  gs.ufo = { score: 0, timeLeft: 30, gameOver: false, betPlaced: false, spawnTimer: null, countdown: null };
  el.innerHTML = '<div class="game-area"><div class="ufo-box">'
    + '<div class="ufo-header"><span>⏱️ <span id="ufo-time">30</span>s</span><span>得分: <span id="ufo-score">0</span></span></div>'
    + '<div class="ufo-grid">' + Array.from({length: 16}, (_, i) => '<button class="ufo-cell" data-i="' + i + '" onclick="ufoClick(' + i + ')"></button>').join("")
    + '</div><div class="ufo-msg" id="ufo-msg">点击开始</div>'
    + '<button class="game-btn" id="ufo-start" onclick="ufoStart()">🪐 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.ufoClick = ufoClick; window.ufoStart = ufoStart;
}

async function ufoStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.ufo.betPlaced) return;
  let r1 = await gameApi("bet", {game: "ufo", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let u = gs.ufo; u.betPlaced = true; u.score = 0; u.timeLeft = 30; u.gameOver = false;
  document.getElementById("ufo-start").disabled = true; document.getElementById("ufo-start").textContent = t("游戏中...");
  ufoSpawn();
  u.countdown = setInterval(() => {
    u.timeLeft--; document.getElementById("ufo-time").textContent = u.timeLeft;
    if (u.timeLeft <= 0) {
      clearInterval(u.countdown); clearInterval(u.spawnTimer); u.gameOver = true;
      document.querySelectorAll(".ufo-cell").forEach(el => el.textContent = "");
      let s = u.score, prize = s * 50 + (s >= 20 ? 500 : 0);
      if (prize > 0) { gameApi("win", {game: "ufo", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
      document.getElementById("ufo-msg").innerHTML = "<span class='" + (s >= 10 ? "game-win" : "game-lose") + "'>⏰ 时间到！击中 " + s + " 个飞碟，获得 " + prize + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'ufo\')">🔄 再来一局</button></div>';
    }
  }, 1000);
}

function ufoSpawn() {
  if (gs.ufo.gameOver) return;
  document.querySelectorAll(".ufo-cell").forEach(el => el.textContent = "");
  let spots = new Set(); let n = 1 + Math.floor(Math.random() * 2);
  while (spots.size < n) spots.add(Math.floor(Math.random() * 16));
  spots.forEach(i => { let el = document.querySelector('.ufo-cell[data-i="' + i + '"]'); if (el) el.textContent = "🛸"; });
  if (gs.ufo.spawnTimer) clearInterval(gs.ufo.spawnTimer);
  gs.ufo.spawnTimer = setInterval(() => {
    if (gs.ufo.gameOver) { clearInterval(gs.ufo.spawnTimer); return; }
    document.querySelectorAll(".ufo-cell").forEach(el => el.textContent = "");
    let spots2 = new Set(); let n2 = 1 + Math.floor(Math.random() * 3);
    while (spots2.size < n2) spots2.add(Math.floor(Math.random() * 16));
    spots2.forEach(i => { let el = document.querySelector('.ufo-cell[data-i="' + i + '"]'); if (el) el.textContent = "🛸"; });
  }, 1000 + Math.random() * 800);
}

function ufoClick(i) {
  if (gs.ufo.gameOver) return;
  let el = document.querySelector('.ufo-cell[data-i="' + i + '"]');
  if (el && el.textContent === "🛸") {
    gs.ufo.score++; document.getElementById("ufo-score").textContent = gs.ufo.score;
    el.textContent = "💥"; setTimeout(() => { if (!gs.ufo.gameOver && el) el.textContent = ""; }, 200);
  }
}

registerGame("ufo", "🪐", "打飞碟", "4×4 网格打飞碟，30 秒疯狂点击！", renderUFO, () => ({ score: 0, timeLeft: 30, gameOver: false, betPlaced: false, spawnTimer: null, countdown: null }));
