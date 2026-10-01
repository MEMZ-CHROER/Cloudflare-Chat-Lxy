// v2 game arcade — simple breakout game (standalone)
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

let _arcadeAnim = null;
let _arcadeRunning = false;

export function openArcadeGame(type) {
  if (type === "breakout") startBreakout();
  else showToast("游戏开发中...", "info");
}

function startBreakout() {
  // Remove existing game
  document.getElementById("v2-breakout-game")?.remove();

  const canvas = document.createElement("canvas");
  canvas.id = "v2-breakout-game";
  canvas.width = 480;
  canvas.height = 360;
  canvas.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;z-index:999;border-radius:8px;";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const state = {
    lives: 3, score: 0, gameOver: false,
    ballX: 240, ballY: 300, ballDx: 3, ballDy: -3,
    paddleX: 200, paddleW: 80, paddleH: 12,
    bricks: [],
  };

  // Initialize bricks
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      state.bricks.push({ x: c * 60 + 10, y: r * 25 + 30, w: 55, h: 20, alive: true, color: `hsl(${r * 40 + c * 10}, 70%, 50%)` });
    }
  }

  function draw() {
    if (state.gameOver) return;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw bricks
    state.bricks.forEach(b => {
      if (!b.alive) return;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    });

    // Draw paddle
    ctx.fillStyle = "#fff";
    ctx.fillRect(state.paddleX, canvas.height - 30, state.paddleW, state.paddleH);

    // Draw ball
    ctx.beginPath();
    ctx.arc(state.ballX, state.ballY, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // Draw HUD
    ctx.font = "16px monospace";
    ctx.fillStyle = "#fff";
    ctx.fillText("得分: " + state.score, 10, 20);
    ctx.fillText("生命: " + "❤".repeat(state.lives), canvas.width - 100, 20);
  }

  function update() {
    if (state.gameOver) return;
    state.ballX += state.ballDx;
    state.ballY += state.ballDy;

    // Wall bounce
    if (state.ballX <= 8 || state.ballX >= canvas.width - 8) state.ballDx *= -1;
    if (state.ballY <= 8) state.ballDy *= -1;

    // Paddle bounce
    if (state.ballY >= canvas.height - 38 && state.ballY <= canvas.height - 30 &&
        state.ballX >= state.paddleX && state.ballX <= state.paddleX + state.paddleW) {
      state.ballDy = -Math.abs(state.ballDy);
      state.ballDx += (state.ballX - (state.paddleX + state.paddleW / 2)) * 0.1;
    }

    // Brick collision
    state.bricks.forEach(b => {
      if (!b.alive) return;
      if (state.ballX >= b.x && state.ballX <= b.x + b.w &&
          state.ballY >= b.y && state.ballY <= b.y + b.h) {
        b.alive = false;
        state.ballDy *= -1;
        state.score += 10;
      }
    });

    // Ball lost
    if (state.ballY > canvas.height) {
      state.lives--;
      if (state.lives <= 0) {
        state.gameOver = true;
        showToast("游戏结束! 得分: " + state.score, "error");
        setTimeout(() => document.getElementById("v2-breakout-game")?.remove(), 2000);
        return;
      }
      state.ballX = 240;
      state.ballY = 300;
      state.ballDx = 3;
      state.ballDy = -3;
    }

    // Win condition
    if (state.bricks.every(b => !b.alive)) {
      state.gameOver = true;
      showToast("恭喜通关! 得分: " + state.score, "success");
      setTimeout(() => document.getElementById("v2-breakout-game")?.remove(), 2000);
      return;
    }
  }

  function loop() {
    update();
    draw();
    if (!state.gameOver) {
      _arcadeAnim = requestAnimationFrame(loop);
    }
  }

  // Mouse control
  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    state.paddleX = Math.max(0, Math.min(canvas.width - state.paddleW, e.clientX - rect.left - state.paddleW / 2));
  });

  loop();
}

export function closeArcadeGame() {
  if (_arcadeAnim) cancelAnimationFrame(_arcadeAnim);
  document.getElementById("v2-breakout-game")?.remove();
}

window.__v2_openArcadeGame = openArcadeGame;
window.__v2_closeArcadeGame = closeArcadeGame;
