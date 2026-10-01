// v2 game board — Minesweeper + 2048 (standalone)
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

let _gs = {};

export function openMinesweeper() {
  const existing = document.getElementById("v2-minesweeper-game");
  if (existing) { existing.remove(); return; }
  initMinesweeper();
}

function initMinesweeper() {
  const board = document.createElement("div");
  board.id = "v2-minesweeper-game";
  board.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3);";

  _gs.minesweeper = {
    board: [], revealed: new Set(), flags: new Set(),
    gameOver: false, firstClick: true, flagMode: false,
    rows: 9, cols: 9, mineCount: 10
  };

  board.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h2 style="margin:0;font-size:1rem;">💣 扫雷</h2>
      <button onclick="window.__v2_closeMinesweeper()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;font-size:13px;">
      <span>💣 雷数: <span id="ms-mine-count">10</span></span>
      <button id="ms-flag-btn" onclick="window.__v2_msToggleFlag()" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;cursor:pointer;">🚩 插旗模式</button>
    </div>
    <div id="ms-board" style="display:grid;grid-template-columns:repeat(9,32px);gap:2px;user-select:none;"></div>
    <div id="ms-result" style="text-align:center;margin-top:12px;font-size:13px;color:var(--text-secondary);">点击格子开始，首击安全！</div>
  `;

  document.body.appendChild(board);
  renderMineBoard();
}

function renderMineBoard() {
  const ms = _gs.minesweeper;
  const boardEl = document.getElementById("ms-board");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let r = 0; r < ms.rows; r++) {
    for (let c = 0; c < ms.cols; c++) {
      const cell = document.createElement("button");
      cell.className = "ms-cell";
      cell.style.cssText = "width:32px;height:32px;background:var(--bg);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;display:flex;align-items:center;justify-content:center;";
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener("click", function() { msClick(r, c); });
      cell.addEventListener("contextmenu", function(e) { e.preventDefault(); msFlag(r, c); });
      boardEl.appendChild(cell);
    }
  }
}

function msGenBoard(exR, exC) {
  const ms = _gs.minesweeper;
  let board = Array.from({length: ms.rows}, function() { return Array(ms.cols).fill(0); });
  let exclude = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      exclude.add((exR + dr) + "," + (exC + dc));
    }
  }
  let placed = 0;
  while (placed < ms.mineCount) {
    let r = Math.floor(Math.random() * ms.rows);
    let c = Math.floor(Math.random() * ms.cols);
    if (!exclude.has(r + "," + c) && board[r][c] !== "M") {
      board[r][c] = "M";
      placed++;
    }
  }
  for (let r = 0; r < ms.rows; r++) {
    for (let c = 0; c < ms.cols; c++) {
      if (board[r][c] === "M") continue;
      let cnt = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          let nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < ms.rows && nc >= 0 && nc < ms.cols && board[nr][nc] === "M") cnt++;
        }
      }
      board[r][c] = cnt;
    }
  }
  return board;
}

function msClick(r, c) {
  const ms = _gs.minesweeper;
  if (ms.gameOver) return;
  const key = r + "," + c;
  if (ms.flags.has(key)) return;

  if (ms.firstClick) {
    ms.firstClick = false;
    ms.board = msGenBoard(r, c);
    ms.revealed = new Set();
    msReveal(r, c);
    checkMsWin();
    return;
  }

  if (!ms.board || ms.board.length === 0) return;
  if (ms.board[r][c] === "M") {
    ms.gameOver = true;
    revealAllMines();
    document.getElementById("ms-result").innerHTML = "<span style='color:#ef4444;'>💥 踩雷了！游戏结束</span>";
    showToast("踩雷了！", "error");
  } else {
    msReveal(r, c);
    checkMsWin();
  }
}

function msReveal(r, c) {
  const ms = _gs.minesweeper;
  const key = r + "," + c;
  if (r < 0 || r >= ms.rows || c < 0 || c >= ms.cols) return;
  if (ms.revealed.has(key) || ms.flags.has(key)) return;

  ms.revealed.add(key);
  const cell = document.querySelector('.ms-cell[data-r="' + r + '"][data-c="' + c + '"]');
  if (!cell) return;

  const val = ms.board[r][c];
  if (val === 0) {
    cell.textContent = "";
    cell.style.background = "var(--frosted)";
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        msReveal(r + dr, c + dc);
      }
    }
  } else {
    cell.textContent = val;
    cell.style.background = "var(--frosted)";
    const colors = ["", "#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f97316", "#06b6d4", "#84cc16", "#64748b"];
    cell.style.color = colors[val] || "#fff";
  }
}

function msFlag(r, c) {
  const ms = _gs.minesweeper;
  const key = r + "," + c;
  if (ms.revealed.has(key)) return;

  if (ms.flags.has(key)) {
    ms.flags.delete(key);
  } else {
    ms.flags.add(key);
  }

  const cell = document.querySelector('.ms-cell[data-r="' + r + '"][data-c="' + c + '"]');
  if (cell) {
    cell.textContent = ms.flags.has(key) ? "🚩" : "";
  }

  document.getElementById("ms-mine-count").textContent = ms.mineCount - ms.flags.size;
}

function checkMsWin() {
  const ms = _gs.minesweeper;
  if (ms.revealed.size >= ms.rows * ms.cols - ms.mineCount) {
    ms.gameOver = true;
    document.getElementById("ms-result").innerHTML = "<span style='color:#22c55e;'>🎉 全部排完！恭喜获胜！</span>";
    showToast("扫雷成功！", "success");
  }
}

function revealAllMines() {
  const ms = _gs.minesweeper;
  for (let r = 0; r < ms.rows; r++) {
    for (let c = 0; c < ms.cols; c++) {
      if (ms.board[r][c] === "M") {
        const cell = document.querySelector('.ms-cell[data-r="' + r + '"][data-c="' + c + '"]');
        if (cell) { cell.textContent = "💣"; cell.style.background = "#ef4444"; }
      }
    }
  }
}

window.__v2_openMinesweeper = openMinesweeper;
window.__v2_closeMinesweeper = function() { document.getElementById("v2-minesweeper-game")?.remove(); };
window.__v2_msToggleFlag = function() { _gs.minesweeper.flagMode = !_gs.minesweeper.flagMode; };

export function open2048() {
  const existing = document.getElementById("v2-2048-game");
  if (existing) { existing.remove(); return; }
  init2048();
}

function init2048() {
  const board = document.createElement("div");
  board.id = "v2-2048-game";
  board.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,0.3);";

  _gs.t2048 = { grid: t2048Init(), score: 0, gameOver: false };

  board.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h2 style="margin:0;font-size:1rem;">🧩 2048</h2>
      <div style="display:flex;gap:12px;font-size:13px;">
        <span>得分: <strong id="t2048-score">0</strong></span>
        <span>最大: <strong id="t2048-max">0</strong></span>
      </div>
      <button onclick="window.__v2_close2048()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div id="t2048-grid" style="display:grid;grid-template-columns:repeat(4,70px);gap:8px;user-select:none;"></div>
    <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-secondary);">方向键 / WASD / 滑动控制</div>
  `;

  document.body.appendChild(board);
  t2048Render();
  document.addEventListener("keydown", t2048KeyHandler);
}

function t2048Init() {
  let g = Array.from({length: 4}, function() { return Array(4).fill(0); });
  return t2048AddTile(t2048AddTile(g));
}

function t2048AddTile(grid) {
  let empty = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) empty.push([r, c]);
    }
  }
  if (!empty.length) return grid;
  let idx = Math.floor(Math.random() * empty.length);
  let [r, c] = empty[idx];
  grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  return grid;
}

function t2048SlideRow(row) {
  let arr = row.filter(function(v) { return v !== 0; });
  let score = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    if (arr[i] === arr[i + 1]) {
      arr[i] *= 2;
      score += arr[i];
      arr.splice(i + 1, 1);
    }
  }
  while (arr.length < 4) arr.push(0);
  return { row: arr, score: score };
}

function t2048Move(dir) {
  const g = _gs.t2048;
  if (g.gameOver) return;
  let old = JSON.stringify(g.grid), score = 0;

  if (dir === 0) {
    for (let r = 0; r < 4; r++) { let res = t2048SlideRow(g.grid[r]); g.grid[r] = res.row; score += res.score; }
  } else if (dir === 2) {
    for (let r = 0; r < 4; r++) { let res = t2048SlideRow(g.grid[r].slice().reverse()); g.grid[r] = res.row.reverse(); score += res.score; }
  } else if (dir === 1) {
    for (let c = 0; c < 4; c++) {
      let col = [g.grid[0][c], g.grid[1][c], g.grid[2][c], g.grid[3][c]];
      let res = t2048SlideRow(col);
      for (let r = 0; r < 4; r++) g.grid[r][c] = res.row[r];
      score += res.score;
    }
  } else if (dir === 3) {
    for (let c = 0; c < 4; c++) {
      let col = [g.grid[3][c], g.grid[2][c], g.grid[1][c], g.grid[0][c]];
      let res = t2048SlideRow(col);
      for (let r = 0; r < 4; r++) g.grid[3 - r][c] = res.row[r];
      score += res.score;
    }
  }

  if (JSON.stringify(g.grid) === old) return;
  g.score += score;
  g.grid = t2048AddTile(g.grid);
  t2048Render();

  let maxTile = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (g.grid[r][c] > maxTile) maxTile = g.grid[r][c];
    }
  }

  if (maxTile >= 2048) {
    showToast("🎉 达到2048！继续挑战更高分！", "success");
  }

  let canMove = false;
  for (let r = 0; r < 4 && !canMove; r++) {
    for (let c = 0; c < 4 && !canMove; c++) {
      if (g.grid[r][c] === 0) canMove = true;
      else if (c < 3 && g.grid[r][c] === g.grid[r][c + 1]) canMove = true;
      else if (r < 3 && g.grid[r][c] === g.grid[r + 1][c]) canMove = true;
    }
  }
  if (!canMove) {
    g.gameOver = true;
    showToast("游戏结束！得分: " + g.score, "info");
  }
}

function t2048Render() {
  const gridEl = document.getElementById("t2048-grid");
  if (!gridEl) return;
  gridEl.innerHTML = "";
  const g = _gs.t2048;

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = document.createElement("div");
      const val = g.grid[r][c];
      cell.style.cssText = "width:70px;height:70px;background:" + t2048Color(val) + ";border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:" + (val >= 1024 ? 20 : val >= 128 ? 24 : 28) + "px;font-weight:bold;color:#fff;";
      cell.textContent = val || "";
      gridEl.appendChild(cell);
    }
  }

  document.getElementById("t2048-score").textContent = g.score;
  let maxTile = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (g.grid[r][c] > maxTile) maxTile = g.grid[r][c];
    }
  }
  document.getElementById("t2048-max").textContent = maxTile;
}

function t2048Color(v) {
  const colors = {
    0: "var(--bg)", 2: "#eee4da", 4: "#ede0c8", 8: "#f2b179",
    16: "#f59563", 32: "#f67c5f", 64: "#f65e3b", 128: "#edcf72",
    256: "#edcc61", 512: "#edc850", 1024: "#edc53f", 2048: "#edc22e"
  };
  return colors[v] || "#3c3a32";
}

function t2048KeyHandler(e) {
  const m = { "ArrowLeft": 0, "ArrowUp": 1, "ArrowRight": 2, "ArrowDown": 3,
              "a": 0, "w": 1, "d": 2, "s": 3 };
  if (e.key in m) { e.preventDefault(); t2048Move(m[e.key]); }
}

window.__v2_open2048 = open2048;
window.__v2_close2048 = function() {
  document.getElementById("v2-2048-game")?.remove();
  document.removeEventListener("keydown", t2048KeyHandler);
};

export function launchGame(gameId) {
  if (gameId === "minesweeper") openMinesweeper();
  else if (gameId === "t2048") open2048();
  else showToast("游戏开发中...", "info");
}

window.__v2_launchGame = launchGame;
