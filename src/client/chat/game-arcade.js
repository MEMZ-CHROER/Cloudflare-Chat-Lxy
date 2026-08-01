// 🏓 动作街机组 — 打砖块 / 接水果 / 飞越障碍 / 保龄球
import { gs, gameApi, updateBalance, registerGame, playGameSound } from './game-core.js';
import { state, showError, t } from './state.js';

// ========== 🏓 打砖块 ==========

function renderBreakout(el) {
  gs.breakout = { lives: 3, score: 0, gameOver: false, betPlaced: false, bricks: [], ballX: 240, ballY: 350, ballDx: 3, ballDy: -3, paddleX: 200, anim: null };
  let html = '<div class="game-area"><div class="arcade-box">';
  html += '<div class="arcade-header"><span>❤️ <span id="br-lives">3</span></span><span>得分: <span id="br-score">0</span></span></div>';
  html += '<div class="breakout-stage" id="br-stage" onmousemove="brMouseMove(event)">';
  html += '<div class="br-paddle" id="br-paddle"></div>';
  html += '<div class="br-ball" id="br-ball"></div></div>';
  html += '<div class="arcade-msg" id="br-msg">点击开始</div>';
  html += '<button class="game-btn" id="br-start" onclick="brStart()">🏓 开始</button>';
  html += '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  el.innerHTML = html;
  window.brStart = brStart; window.brMouseMove = brMouseMove;
}

function brMouseMove(e) {
  let stage = document.getElementById("br-stage");
  if (!stage) return;
  let rect = stage.getBoundingClientRect();
  gs.breakout.paddleX = Math.max(0, Math.min(400, e.clientX - rect.left - 50));
  let paddle = document.getElementById("br-paddle");
  if (paddle) paddle.style.left = gs.breakout.paddleX + "px";
}

function brInitBricks() {
  let bricks = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
    bricks.push({ x: c * 50 + 5, y: r * 22 + 10, w: 45, h: 18, alive: true });
  }
  return bricks;
}

async function brStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.breakout.betPlaced) return;
  let r1 = await gameApi("bet", {game: "breakout", wager: 150});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();

  let b = gs.breakout;
  b.betPlaced = true; b.lives = 3; b.score = 0; b.gameOver = false;
  b.bricks = brInitBricks(); b.ballX = 240; b.ballY = 350; b.ballDx = 3; b.ballDy = -3; b.paddleX = 200;
  document.getElementById("br-start").style.display = "none";
  brDrawBricks();
  document.getElementById("br-msg").textContent = t("移动鼠标/手指控制挡板！");
  brLoop();
}

function brDrawBricks() {
  let stage = document.getElementById("br-stage");
  if (!stage) return;
  stage.querySelectorAll(".br-brick").forEach(el => el.remove());
  gs.breakout.bricks.forEach((brick, i) => {
    if (!brick.alive) return;
    let el = document.createElement("div");
    el.className = "br-brick";
    let colors = ["#e74c3c","#e67e22","#f1c40f","#2ecc71","#3498db","#9b59b6"];
    el.style.cssText = "position:absolute;left:" + brick.x + "px;top:" + brick.y + "px;width:" + brick.w + "px;height:" + brick.h + "px;background:" + colors[Math.floor(i/8)] + ";border-radius:3px;";
    stage.appendChild(el);
  });
}

function brLoop() {
  let b = gs.breakout;
  if (b.gameOver) { b.anim = null; return; }

  // 球移动
  b.ballX += b.ballDx; b.ballY += b.ballDy;
  if (b.ballX <= 0 || b.ballX >= 480) b.ballDx = -b.ballDx;
  if (b.ballY <= 0) b.ballDy = -b.ballDy;

  // 挡板碰撞
  if (b.ballY >= 340 && b.ballY <= 348 && b.ballX >= b.paddleX - 5 && b.ballX <= b.paddleX + 105) {
    b.ballDy = -Math.abs(b.ballDy);
    b.ballY = 340;
  }

  // 球落底
  if (b.ballY > 390) {
    b.lives--;
    document.getElementById("br-lives").textContent = b.lives;
    if (b.lives <= 0) {
      b.gameOver = true; brEnd();
      return;
    }
    b.ballX = 240; b.ballY = 300; b.ballDx = 3; b.ballDy = -3;
  }

  // 砖块碰撞
  for (let i = 0; i < b.bricks.length; i++) {
    let brick = b.bricks[i];
    if (!brick.alive) continue;
    if (b.ballX >= brick.x && b.ballX <= brick.x + brick.w && b.ballY >= brick.y && b.ballY <= brick.y + brick.h) {
      brick.alive = false; b.score += 10;
      document.getElementById("br-score").textContent = b.score;
      b.ballDy = -b.ballDy;
      brDrawBricks();
      break;
    }
  }

  // 渲染球
  let ball = document.getElementById("br-ball");
  if (ball) ball.style.cssText = "position:absolute;left:" + (b.ballX - 5) + "px;top:" + (b.ballY - 5) + "px;width:10px;height:10px;background:#fff;border-radius:50%;";

  // 清空判定
  let allDead = b.bricks.every(br => !br.alive);
  if (allDead) { b.gameOver = true; brEnd(); return; }

  b.anim = requestAnimationFrame(brLoop);
}

function brEnd() {
  if (gs.breakout.anim) { cancelAnimationFrame(gs.breakout.anim); gs.breakout.anim = null; }
  let s = gs.breakout.score, prize = s * 20;
  if (prize > 0) { gameApi("win", {game: "breakout", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
  document.getElementById("br-msg").innerHTML = "<span class='" + (s >= 50 ? "game-win" : "game-lose") + t("'>🏓 得分 ") + s + t("，获得 ") + prize + " 积分</span>"
    + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'breakout\')">🔄 再来一局</button></div>';
  document.querySelectorAll(".br-brick, #br-ball").forEach(el => el.remove());
}

registerGame("breakout", "🏓", "打砖块", "经典打砖块，破砖得分！3 条命，入场 150", renderBreakout, () => ({ lives: 3, score: 0, gameOver: false, betPlaced: false, bricks: [], ballX: 240, ballY: 350, ballDx: 3, ballDy: -3, paddleX: 200, anim: null }));

// ========== 🍎 接水果 ==========

function renderFruitCatch(el) {
  gs.fruit = { score: 0, lives: 5, timeLeft: 30, gameOver: false, betPlaced: false, basketX: 180, timer: null, spawnTimer: null };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>❤️ <span id="fr-lives">5</span></span><span>得分: <span id="fr-score">0</span></span><span>⏱️ <span id="fr-time">30</span>s</span></div>'
    + '<div class="fruit-stage" id="fr-stage" onmousemove="frMouseMove(event)"><div class="fr-basket" id="fr-basket">🧺</div></div>'
    + '<div class="arcade-msg" id="fr-msg">点击开始</div>'
    + '<button class="game-btn" id="fr-start" onclick="frStart()">🍎 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.frStart = frStart; window.frMouseMove = frMouseMove;
}

function frMouseMove(e) {
  let stage = document.getElementById("fr-stage"); if (!stage) return;
  let rect = stage.getBoundingClientRect();
  gs.fruit.basketX = Math.max(0, Math.min(370, e.clientX - rect.left - 25));
  let basket = document.getElementById("fr-basket"); if (basket) basket.style.left = gs.fruit.basketX + "px";
}

async function frStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.fruit.betPlaced) return;
  let r1 = await gameApi("bet", {game: "fruit", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();

  let f = gs.fruit; f.betPlaced = true; f.score = 0; f.lives = 5; f.timeLeft = 30; f.gameOver = false;
  document.getElementById("fr-start").style.display = "none";
  document.getElementById("fr-msg").textContent = t("移动鼠标接水果！");
  frSpawn();
  f.timer = setInterval(() => {
    f.timeLeft--; document.getElementById("fr-time").textContent = f.timeLeft;
    if (f.timeLeft <= 0) {
      clearInterval(f.timer); clearInterval(f.spawnTimer); f.gameOver = true;
      document.querySelectorAll(".fr-fruit").forEach(el => el.remove());
      let prize = f.score * 10;
      if (prize > 0) { gameApi("win", {game: "fruit", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
      document.getElementById("fr-msg").innerHTML = "<span class='" + (f.score >= 20 ? "game-win" : "game-lose") + t("'>⏰ 时间到！接到 ") + f.score + t(" 个水果，获得 ") + prize + " 积分</span>"
        + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'fruit\')">🔄 再来一局</button></div>';
    }
  }, 1000);
}

function frSpawn() {
  if (gs.fruit.gameOver) return;
  const FRUITS = ["🍎","🍊","🍇","🍉","🍓","🍑","🍒"];
  let f = gs.fruit;
  f.spawnTimer = setInterval(() => {
    if (f.gameOver) { clearInterval(f.spawnTimer); return; }
    let stage = document.getElementById("fr-stage"); if (!stage) return;
    let fruitEl = document.createElement("div");
    fruitEl.className = "fr-fruit";
    fruitEl.textContent = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    let x = Math.floor(Math.random() * 5) * 80 + 20;
    fruitEl.style.cssText = "position:absolute;left:" + x + "px;top:-30px;font-size:24px;transition:top 2.5s linear;pointer-events:none;";
    stage.appendChild(fruitEl);
    requestAnimationFrame(() => { fruitEl.style.top = "380px"; });
    setTimeout(() => {
      if (!fruitEl.parentNode) return;
      let rect = fruitEl.getBoundingClientRect();
      let basketEl = document.getElementById("fr-basket");
      if (basketEl) {
        let bRect = basketEl.getBoundingClientRect();
        if (rect.bottom >= bRect.top && rect.bottom <= bRect.bottom + 10 && rect.left + 12 >= bRect.left && rect.right - 12 <= bRect.right + 10) {
          f.score++; document.getElementById("fr-score").textContent = f.score;
        }
      }
      fruitEl.remove();
    }, 2600);
  }, 600);
}

registerGame("fruit", "🍎", "接水果", "水果从天降，移动篮子接！30秒", renderFruitCatch, () => ({ score: 0, lives: 5, timeLeft: 30, gameOver: false, betPlaced: false, basketX: 180, timer: null, spawnTimer: null }));

// ========== ✈️ 飞越障碍 ==========

function renderFlappy(el) {
  gs.flappy = { y: 200, vy: 0, score: 0, gameOver: false, betPlaced: false, pipes: [], anim: null };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>得分: <span id="fl-score">0</span></span></div>'
    + '<div class="flappy-stage" id="fl-stage" onclick="flTap()">'
    + '<div class="fl-bird" id="fl-bird">🐦</div></div>'
    + '<div class="arcade-msg" id="fl-msg">点击/空格开始飞行</div>'
    + '<button class="game-btn" id="fl-start" onclick="flStart()">✈️ 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.flStart = flStart; window.flTap = flTap;
}

async function flStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.flappy.betPlaced) return;
  let r1 = await gameApi("bet", {game: "flappy", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();

  let f = gs.flappy; f.betPlaced = true; f.y = 200; f.vy = 0; f.score = 0; f.gameOver = false; f.pipes = [];
  document.getElementById("fl-start").style.display = "none";
  document.getElementById("fl-msg").textContent = t("点击让小鸟飞！");
  document.addEventListener("keydown", flKey);
  flLoop();
}

function flKey(e) { if (e.key === " " || e.key === "Space") { e.preventDefault(); flTap(); } }

function flTap() {
  if (gs.flappy.gameOver) return;
  gs.flappy.vy = -6;
}

function flLoop() {
  let f = gs.flappy; if (f.gameOver) { f.anim = null; return; }

  // 物理
  f.vy += 0.4; f.y += f.vy;
  if (f.y < 0) f.y = 0;
  if (f.y > 380) { f.gameOver = true; flEnd(); return; }

  // 生成/移动 pipes
  if (f.pipes.length === 0 || f.pipes[f.pipes.length - 1].x < 350) {
    let gap = 120 + Math.random() * 40;
    let topH = 50 + Math.random() * 150;
    f.pipes.push({ x: 500, topH, gap, scored: false });
  }
  let bird = document.getElementById("fl-bird");
  for (let i = f.pipes.length - 1; i >= 0; i--) {
    let p = f.pipes[i];
    p.x -= 3;
    if (p.x < -60) { f.pipes.splice(i, 1); continue; }
    // 碰撞检测
    if (p.x < 60 && p.x + 50 > 30) {
      if (f.y < p.topH || f.y > p.topH + p.gap) { f.gameOver = true; flEnd(); return; }
    }
    // 得分
    if (!p.scored && p.x + 50 < 30) { p.scored = true; f.score++; document.getElementById("fl-score").textContent = f.score; }
  }

  // 渲染
  let stage = document.getElementById("fl-stage");
  if (bird) bird.style.top = f.y + "px";
  stage.querySelectorAll(".fl-pipe").forEach(el => el.remove());
  f.pipes.forEach(p => {
    let top = document.createElement("div"); top.className = "fl-pipe";
    top.style.cssText = "position:absolute;left:" + p.x + "px;top:0;width:50px;height:" + p.topH + "px;background:linear-gradient(#2ecc71,#27ae60);border-radius:0 0 4px 4px;";
    stage.appendChild(top);
    let bot = document.createElement("div"); bot.className = "fl-pipe";
    bot.style.cssText = "position:absolute;left:" + p.x + "px;top:" + (p.topH + p.gap) + "px;width:50px;height:" + (400 - p.topH - p.gap) + "px;background:linear-gradient(#27ae60,#2ecc71);border-radius:4px 4px 0 0;";
    stage.appendChild(bot);
  });

  f.anim = requestAnimationFrame(flLoop);
}

function flEnd() {
  if (gs.flappy.anim) { cancelAnimationFrame(gs.flappy.anim); gs.flappy.anim = null; }
  document.removeEventListener("keydown", flKey);
  let s = gs.flappy.score, prize = s * 5;
  if (prize > 0) { gameApi("win", {game: "flappy", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
  document.getElementById("fl-msg").innerHTML = "<span class='" + (s >= 10 ? "game-win" : "game-lose") + t("'>✈️ 飞过了 ") + s + t(" 个障碍，获得 ") + prize + " 积分</span>"
    + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'flappy\')">🔄 再来一局</button></div>';
}

registerGame("flappy", "✈️", "飞越障碍", "点击飞行避开柱子，越远分越高！", renderFlappy, () => ({ y: 200, vy: 0, score: 0, gameOver: false, betPlaced: false, pipes: [], anim: null }));

// ========== 🎳 保龄球 ==========

function renderBowling(el) {
  gs.bowling = { power: 0, powerDir: 1, throwing: false, pins: [], score: 0, throwNum: 0, gameOver: false, betPlaced: false, timer: null };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>得分: <span id="bw-score">0</span></span><span>第 <span id="bw-throw">1</span>/2 投</span></div>'
    + '<div class="bowling-stage" id="bw-stage">'
    + '<div class="bw-pins" id="bw-pins"></div>'
    + '<div class="bw-power-bar" id="bw-power-bar"><div class="bw-power-fill" id="bw-power-fill"></div></div></div>'
    + '<div class="arcade-msg" id="bw-msg">点击开始</div>'
    + '<button class="game-btn" id="bw-start" onclick="bwStart()">🎳 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.bwStart = bwStart;
}

function bwInitPins() {
  let pins = [];
  let rows = [1, 2, 3, 4];
  let startX = [80, 65, 50, 35];
  rows.forEach((cnt, ri) => {
    let y = 20 + ri * 30;
    for (let c = 0; c < cnt; c++) {
      pins.push({ x: startX[ri] + c * 30, y, standing: true });
    }
  });
  return pins;
}

function bwRenderPins() {
  let container = document.getElementById("bw-pins"); if (!container) return;
  container.innerHTML = "";
  gs.bowling.pins.forEach((pin, i) => {
    let el = document.createElement("div");
    el.style.cssText = "position:absolute;left:" + pin.x + "px;top:" + pin.y + "px;width:16px;height:16px;background:" + (pin.standing ? "#fff" : "#999") + ";border:2px solid #e74c3c;border-radius:50%;transition:all .3s;";
    container.appendChild(el);
  });
}

function bwPowerLoop() {
  let b = gs.bowling; if (b.gameOver) return;
  b.power += b.powerDir * 2;
  if (b.power >= 100) b.powerDir = -1;
  if (b.power <= 0) { b.powerDir = 1; if (b.throwing) return; }
  if (!b.throwing) {
    let fill = document.getElementById("bw-power-fill");
    if (fill) fill.style.width = b.power + "%";
    b.timer = setTimeout(bwPowerLoop, 30);
  }
}

async function bwStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.bowling.betPlaced) return;
  let r1 = await gameApi("bet", {game: "bowling", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();

  let b = gs.bowling; b.betPlaced = true; b.gameOver = false; b.score = 0; b.throwNum = 0; b.power = 0; b.powerDir = 1;
  b.pins = bwInitPins(); b.throwing = false;
  document.getElementById("bw-start").style.display = "none";
  document.getElementById("bw-stage").onclick = bwThrow;
  bwRenderPins(); bwPowerLoop();
  document.getElementById("bw-msg").textContent = t("点击蓄力条释放滚球！");
}

function bwThrow() {
  let b = gs.bowling; if (b.throwing || b.gameOver) return;
  b.throwing = true; b.throwNum++;
  if (b.timer) clearTimeout(b.timer);
  let power = b.power;
  document.getElementById("bw-throw").textContent = b.throwNum;
  document.getElementById("bw-msg").textContent = t("🎳 球滚出... 力度 ") + power + "%";

  // 计算击倒（随机 + 力度加成）
  let knocked = 0;
  b.pins.forEach(pin => {
    if (!pin.standing) return;
    if (Math.random() < power / 120) { pin.standing = false; knocked++; }
  });
  b.score += knocked;
  document.getElementById("bw-score").textContent = b.score;
  bwRenderPins();

  if (knocked === 10) {
    document.getElementById("bw-msg").innerHTML = "<span class='game-win'>🎳 全中！(STRIKE!) +" + knocked + " 瓶</span>";
  } else {
    document.getElementById("bw-msg").innerHTML = t("击倒 ") + knocked + t(" 瓶");
  }

  if (b.throwNum >= 2 || knocked === 10) {
    setTimeout(() => {
      b.gameOver = true;
      let prize = b.score * 30;
      if (prize > 0) { gameApi("win", {game: "bowling", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
      document.getElementById("bw-msg").innerHTML = "<span class='" + (b.score >= 8 ? "game-win" : "game-lose") + t("'>🎳 共击倒 ") + b.score + t(" 瓶，获得 ") + prize + " 积分</span>"
        + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'bowling\')">🔄 再来一局</button></div>';
    }, 1000);
  } else {
    setTimeout(() => {
      b.throwing = false; b.power = 0; b.powerDir = 1;
      bwPowerLoop();
    }, 1500);
  }
}

registerGame("bowling", "🎳", "保龄球", "蓄力滚球击瓶，每局 2 投", renderBowling, () => ({ power: 0, powerDir: 1, throwing: false, pins: [], score: 0, throwNum: 0, gameOver: false, betPlaced: false, timer: null }));

// ========== 🦘 跳一跳 ==========

function renderJump(el) {
  gs.jump = { power: 0, charging: false, score: 0, platformX: 40, nextX: 0, nextW: 0, playerX: 40, playerY: 150, gameOver: false, betPlaced: false, anim: null };
  gs.jump.nextX = 120 + Math.random() * 150; gs.jump.nextW = 50 + Math.random() * 40;
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>得分: <span id="jp-score">0</span></span></div>'
    + '<div class="jump-stage" id="jp-stage" onmousedown="jpDown()" onmouseup="jpUp()" ontouchstart="jpDown()" ontouchend="jpUp()">'
    + '<div class="jp-player" id="jp-player">🦘</div>'
    + '<div class="jp-power-bg" id="jp-power-bg"><div class="jp-power-fill" id="jp-power-fill"></div></div></div>'
    + '<div class="arcade-msg" id="jp-msg">按住蓄力，松开跳跃！</div>'
    + '<button class="game-btn" id="jp-start" onclick="jpStart()">🦘 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.jpStart = jpStart; window.jpDown = jpDown; window.jpUp = jpUp;
}

async function jpStart() {
  if (gs.jump.betPlaced) return;
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  let r1 = await gameApi("bet", {game: "jump", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.jump.betPlaced = true; gs.jump.gameOver = false; gs.jump.score = 0; gs.jump.power = 0;
  gs.jump.platformX = 40; gs.jump.playerX = 40; gs.jump.playerY = 150;
  gs.jump.nextX = 120 + Math.random() * 150; gs.jump.nextW = 50 + Math.random() * 40;
  document.getElementById("jp-start").style.display = "none";
  jpRender();
}

function jpRender() {
  let stage = document.getElementById("jp-stage"); if (!stage) return;
  let j = gs.jump;
  stage.querySelectorAll(".jp-platform").forEach(el => el.remove());
  let p1 = document.createElement("div"); p1.className = "jp-platform";
  p1.style.cssText = "position:absolute;bottom:30px;left:" + j.platformX + "px;width:50px;height:12px;background:var(--primary);border-radius:4px;";
  stage.appendChild(p1);
  let p2 = document.createElement("div"); p2.className = "jp-platform";
  p2.style.cssText = "position:absolute;bottom:30px;left:" + j.nextX + "px;width:" + j.nextW + "px;height:12px;background:#e67e22;border-radius:4px;";
  stage.appendChild(p2);
  let player = document.getElementById("jp-player");
  if (player) player.style.left = j.playerX + "px";
}

function jpDown() {
  if (gs.jump.gameOver || !gs.jump.betPlaced) return;
  gs.jump.charging = true; gs.jump.power = 0;
  if (gs.jump._chargeTimer) clearInterval(gs.jump._chargeTimer);
  gs.jump._chargeTimer = setInterval(() => {
    gs.jump.power = Math.min(100, gs.jump.power + 2);
    let fill = document.getElementById("jp-power-fill");
    if (fill) fill.style.width = gs.jump.power + "%";
  }, 15);
}

function jpUp() {
  if (gs.jump.gameOver || !gs.jump.charging) return;
  gs.jump.charging = false;
  if (gs.jump._chargeTimer) { clearInterval(gs.jump._chargeTimer); gs.jump._chargeTimer = null; }
  let power = gs.jump.power;
  let distance = power * 3.5;
  gs.jump.playerX += distance;
  let player = document.getElementById("jp-player");
  if (player) {
    player.style.transition = "left 0.3s ease";
    player.style.left = gs.jump.playerX + "px";
  }
  // 检测落在平台上
  let j = gs.jump;
  let px = j.playerX, nx = j.nextX, nw = j.nextW;
  setTimeout(() => {
    if (px >= nx - 15 && px <= nx + nw + 15) {
      // 落在平台上
      let bonus = (px >= nx + 5 && px <= nx + nw - 5) ? 10 : 0;
      j.score += 10 + bonus;
      playGameSound(bonus ? 'levelup' : 'click');
      document.getElementById("jp-score").textContent = j.score;
      j.platformX = nx; j.nextX = nx + nw + 30 + Math.random() * 150;
      j.nextW = 40 + Math.random() * 50;
      j.playerY = 150;
      if (player) { player.style.transition = "none"; player.style.left = j.platformX + "px"; }
      j.playerX = j.platformX;
      jpRender();
      document.getElementById("jp-msg").textContent = bonus ? "🎯 完美落地！+10" : t("✅ +10 分");
    } else {
      j.gameOver = true; playGameSound('lose');
      let prize = j.score;
      if (prize > 0) { gameApi("win", {game: "jump", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
      document.getElementById("jp-msg").innerHTML = "<span class='game-lose'>💧 掉下去了！得分 " + j.score + t("，获得 ") + prize + " 积分</span>"
        + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'jump\')">🔄 再来一局</button></div>';
    }
  }, 350);
}

registerGame("jump", "🦘", "跳一跳", "按住蓄力跳跃，落在平台上得分！", renderJump, () => ({ power: 0, charging: false, score: 0, platformX: 40, nextX: 0, nextW: 0, playerX: 40, playerY: 150, gameOver: false, betPlaced: false, anim: null, _chargeTimer: null }));

// ========== 🧊 数字华容道 ==========

function renderPuzzle(el) {
  // 4×4 board: 0=empty, 1-15=tiles. Represented in position order
  let tiles = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0];
  // Shuffle by making random moves from solved state
  for (let m = 0; m < 200; m++) {
    let emptyIdx = tiles.indexOf(0);
    let r = Math.floor(emptyIdx / 4), c = emptyIdx % 4;
    let neighbors = [];
    if (r > 0) neighbors.push(emptyIdx - 4);
    if (r < 3) neighbors.push(emptyIdx + 4);
    if (c > 0) neighbors.push(emptyIdx - 1);
    if (c < 3) neighbors.push(emptyIdx + 1);
    let swap = neighbors[Math.floor(Math.random() * neighbors.length)];
    [tiles[emptyIdx], tiles[swap]] = [tiles[swap], tiles[emptyIdx]];
  }
  gs.puzzle = { tiles: [...tiles], moves: 0, gameOver: false, betPlaced: false, emptyIdx: tiles.indexOf(0) };
  let html = '<div class="game-area"><div class="arcade-box">';
  html += '<div class="arcade-header"><span>步数: <span id="pz-moves">0</span></span></div>';
  html += '<div class="puzzle-grid">';
  for (let i = 0; i < 16; i++) {
    let v = tiles[i];
    html += '<button class="puzzle-cell' + (v === 0 ? ' puzzle-empty' : '') + '" data-idx="' + i + '" onclick="pzClick(' + i + ')">' + (v || '') + '</button>';
  }
  html += '</div><div class="arcade-msg" id="pz-msg">还原数字 1-15</div>';
  html += '<button class="game-btn" id="pz-start" onclick="pzStart()">🧊 开始</button>';
  html += '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  el.innerHTML = html;
  window.pzStart = pzStart; window.pzClick = pzClick;
}

async function pzStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.puzzle.betPlaced) return;
  let r1 = await gameApi("bet", {game: "puzzle", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.puzzle.betPlaced = true; gs.puzzle.moves = 0; gs.puzzle.gameOver = false;
  document.getElementById("pz-start").style.display = "none";
  document.getElementById("pz-msg").textContent = t("点击数字移到空格位置！");
}

function pzClick(pos) {
  let p = gs.puzzle; if (p.gameOver) return;
  let emptyIdx = p.tiles.indexOf(0);
  let r = Math.floor(pos / 4), c = pos % 4;
  let er = Math.floor(emptyIdx / 4), ec = emptyIdx % 4;
  if (Math.abs(r - er) + Math.abs(c - ec) !== 1) return;
  [p.tiles[pos], p.tiles[emptyIdx]] = [p.tiles[emptyIdx], p.tiles[pos]];
  p.moves++; playGameSound('click');
  document.getElementById("pz-moves").textContent = p.moves;
  // Re-render grid
  document.querySelectorAll(".puzzle-cell").forEach((el, i) => {
    let v = p.tiles[i];
    el.textContent = v || '';
    el.className = 'puzzle-cell' + (v === 0 ? ' puzzle-empty' : '');
  });
  // Check win
  if (p.tiles.every((v, i) => v === (i < 15 ? i + 1 : 0))) {
    p.gameOver = true; playGameSound('levelup');
    let prize = Math.max(50, Math.floor((150 - p.moves) * 3));
    if (prize > 0) { gameApi("win", {game: "puzzle", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    document.getElementById("pz-msg").innerHTML = "<span class='game-win'>🎉 完成！用了 " + p.moves + t(" 步，获得 ") + prize + " 积分</span>"
      + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'puzzle\')">🔄 再来一局</button></div>';
  }
}

registerGame("puzzle", "🧊", "数字华容道", "4×4 滑块还原 1-15，步数越少分越高", renderPuzzle, () => ({ tiles: [], emptyIdx: 15, moves: 0, gameOver: false, betPlaced: false }));

// ========== 🎪 套圈 ==========

function renderRings(el) {
  gs.rings = { rings: 3, score: 0, swinging: false, swingDir: 1, swingX: 0, gameOver: false, betPlaced: false, timer: null };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>🎪 圈: <span id="rg-left">3</span></span><span>得分: <span id="rg-score">0</span></span></div>'
    + '<div class="ring-stage" id="rg-stage">'
    + '<div class="rg-pole" style="left:80px"></div><div class="rg-pole" style="left:160px"></div><div class="rg-pole" style="left:240px"></div><div class="rg-pole" style="left:320px"></div><div class="rg-pole" style="left:400px"></div>'
    + '<div class="rg-ring" id="rg-ring">⭕</div></div>'
    + '<div class="arcade-msg" id="rg-msg">点击开始</div>'
    + '<button class="game-btn" id="rg-start" onclick="rgStart()">🎪 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.rgStart = rgStart;
}

async function rgStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.rings.betPlaced) return;
  let r1 = await gameApi("bet", {game: "rings", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let r = gs.rings; r.betPlaced = true; r.rings = 3; r.score = 0; r.gameOver = false; r.swingX = 0; r.swingDir = 1;
  document.getElementById("rg-start").style.display = "none";
  document.getElementById("rg-stage").onclick = rgThrow;
  document.getElementById("rg-msg").textContent = t("点击释放套圈！");
  rgSwing();
}

function rgSwing() {
  let r = gs.rings; if (r.gameOver) return;
  r.swingX += r.swingDir * 4;
  if (r.swingX > 200) r.swingDir = -1; if (r.swingX < 0) r.swingDir = 1;
  let ring = document.getElementById("rg-ring");
  if (ring) ring.style.transform = "translateX(" + r.swingX + "px)";
  r.timer = setTimeout(rgSwing, 20);
}

function rgThrow() {
  let r = gs.rings; if (r.gameOver || r.rings <= 0) return;
  r.rings--;
  if (r.timer) clearTimeout(r.timer);
  document.getElementById("rg-left").textContent = r.rings;
  // 检测是否套中柱子（柱子位置在 80,160,240,320,400）
  let hit = false;
  let centers = [80, 160, 240, 320, 400];
  let ringCenter = 240 + r.swingX;
  for (let c of centers) {
    if (Math.abs(ringCenter - c) < 30) { hit = true; break; }
  }
  if (hit) { r.score += 20; playGameSound('win');
    document.getElementById("rg-score").textContent = r.score;
    document.getElementById("rg-msg").textContent = t("🎯 套中了！+20");
  } else {
    playGameSound('click');
    document.getElementById("rg-msg").textContent = t("❌ 没套中");
  }
  if (r.rings <= 0) {
    r.gameOver = true; let prize = r.score;
    if (prize > 0) { gameApi("win", {game: "rings", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    document.getElementById("rg-msg").innerHTML = "<span class='" + (r.score >= 40 ? "game-win" : "game-lose") + t("'>🎪 套中 ") + (r.score/20) + t(" 个，获得 ") + prize + " 积分</span>"
      + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'rings\')">🔄 再来一局</button></div>';
  } else { setTimeout(rgSwing, 300); }
}

registerGame("rings", "🎪", "套圈", "3 个圈左右摆动释放，套中柱子得分", renderRings, () => ({ rings: 3, score: 0, swinging: false, swingDir: 1, swingX: 0, gameOver: false, betPlaced: false, timer: null }));

// ========== 🐔 抓小鸡 ==========

function renderChickens(el) {
  gs.chickens = { score: 0, timeLeft: 20, gameOver: false, betPlaced: false, timer: null, spawnTimer: null };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>⏱️ <span id="ch-time">20</span>s</span><span>得分: <span id="ch-score">0</span></span></div>'
    + '<div class="chicken-stage" id="ch-stage"></div>'
    + '<div class="arcade-msg" id="ch-msg">点击开始</div>'
    + '<button class="game-btn" id="ch-start" onclick="chStart()">🐔 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.chStart = chStart;
}

async function chStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.chickens.betPlaced) return;
  let r1 = await gameApi("bet", {game: "chickens", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let c = gs.chickens; c.betPlaced = true; c.score = 0; c.timeLeft = 20; c.gameOver = false;
  document.getElementById("ch-start").style.display = "none";
  document.getElementById("ch-msg").textContent = t("点击小鸡抓住它们！");
  chSpawn();
  c.timer = setInterval(() => {
    c.timeLeft--; document.getElementById("ch-time").textContent = c.timeLeft;
    if (c.timeLeft <= 0) {
      clearInterval(c.timer); clearInterval(c.spawnTimer); c.gameOver = true;
      document.querySelectorAll(".ch-chicken").forEach(el => el.remove());
      let prize = c.score * 10;
      if (prize > 0) { gameApi("win", {game: "chickens", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
      document.getElementById("ch-msg").innerHTML = "<span class='" + (c.score >= 15 ? "game-win" : "game-lose") + t("'>⏰ 时间到！抓住 ") + c.score + t(" 只小鸡，获得 ") + prize + " 积分</span>"
        + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'chickens\')">🔄 再来一局</button></div>';
    }
  }, 1000);
}

function chSpawn() {
  if (gs.chickens.gameOver) return;
  gs.chickens.spawnTimer = setInterval(() => {
    if (gs.chickens.gameOver) { clearInterval(gs.chickens.spawnTimer); return; }
    let stage = document.getElementById("ch-stage"); if (!stage) return;
    let el = document.createElement("div"); el.className = "ch-chicken";
    let fromLeft = Math.random() < 0.5;
    let y = 50 + Math.random() * 250;
    el.textContent = "🐔";
    el.style.cssText = "position:absolute;top:" + y + "px;left:" + (fromLeft ? -40 : 540) + "px;font-size:28px;cursor:pointer;transition:left 1.5s linear;user-select:none;z-index:5;";
    el.onclick = function() { if (gs.chickens.gameOver) return; if (!this._caught) { this._caught = true; gs.chickens.score++; document.getElementById("ch-score").textContent = gs.chickens.score; playGameSound('click'); this.remove(); } };
    stage.appendChild(el);
    requestAnimationFrame(() => { el.style.left = fromLeft ? "540px" : "-40px"; });
    setTimeout(() => { if (el.parentNode && !el._caught) el.remove(); }, 1600);
  }, 500 + Math.random() * 600);
}

registerGame("chickens", "🐔", "抓小鸡", "点击跑过的小鸡，20 秒抓越多越好", renderChickens, () => ({ score: 0, timeLeft: 20, gameOver: false, betPlaced: false, timer: null, spawnTimer: null }));

// ========== 🃏 抽牌比大小 ==========

function renderCardWar(el) {
  gs.cardwar = { currentCard: 0, streak: 0, score: 0, gameOver: false, betPlaced: false, revealed: false };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>连胜: <span id="cw-streak">0</span></span><span>得分: <span id="cw-score">0</span></span></div>'
    + '<div class="cw-cards"><div class="cw-card" id="cw-card1">🂠</div><div class="cw-card" id="cw-card2">🂠</div></div>'
    + '<div class="cw-btns" id="cw-btns"><button class="game-btn game-btn-sm" onclick="cwGuess(1)">⬆️ 大</button><button class="game-btn game-btn-sm game-btn-sec" onclick="cwGuess(0)">⬇️ 小</button></div>'
    + '<div class="arcade-msg" id="cw-msg">点击开始</div>'
    + '<button class="game-btn" id="cw-start" onclick="cwStart()">🃏 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.cwStart = cwStart; window.cwGuess = cwGuess;
}

async function cwStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.cardwar.betPlaced) return;
  let r1 = await gameApi("bet", {game: "cardwar", wager: 50});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let c = gs.cardwar; c.betPlaced = true; c.streak = 0; c.score = 0; c.gameOver = false; c.revealed = false;
  c.currentCard = Math.floor(Math.random() * 13) + 2;
  document.getElementById("cw-start").style.display = "none";
  document.getElementById("cw-card1").textContent = cwCardEmoji(c.currentCard);
  document.getElementById("cw-card2").textContent = "🂠";
  document.getElementById("cw-msg").textContent = t("下一张比它大还是小？");
}

function cwCardEmoji(v) {
  const suits = ["♠","♥","♣","♦"]; const s = suits[Math.floor(Math.random() * 4)];
  const names = {2:"2",3:"3",4:"4",5:"5",6:"6",7:"7",8:"8",9:"9",10:"10",11:"J",12:"Q",13:"K",14:"A"};
  return names[v] + s;
}

async function cwGuess(isBigger) {
  let c = gs.cardwar; if (c.gameOver || c.revealed) return;
  c.revealed = true;
  let next = Math.floor(Math.random() * 13) + 2;
  document.getElementById("cw-card2").textContent = cwCardEmoji(next);
  let correct = (isBigger && next > c.currentCard) || (!isBigger && next < c.currentCard) || next === c.currentCard;
  if (next === c.currentCard) {
    document.getElementById("cw-msg").textContent = t("🤝 平局，继续！");
    c.revealed = false; c.currentCard = next;
    setTimeout(() => { document.getElementById("cw-card2").textContent = "🂠"; cwCardEmoji(c.currentCard); document.getElementById("cw-card1").textContent = cwCardEmoji(c.currentCard); }, 1000);
    return;
  }
  if (correct) {
    c.streak++; c.score += c.streak * 10; playGameSound('win');
    document.getElementById("cw-streak").textContent = c.streak; document.getElementById("cw-score").textContent = c.score;
    document.getElementById("cw-msg").textContent = t("✅ 正确！连对 ") + c.streak + t(" 次");
    c.revealed = false; c.currentCard = next;
    setTimeout(() => { document.getElementById("cw-card2").textContent = "🂠"; document.getElementById("cw-card1").textContent = cwCardEmoji(c.currentCard); }, 1000);
  } else {
    c.gameOver = true; playGameSound('lose'); let prize = c.score;
    if (prize > 0) { gameApi("win", {game: "cardwar", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    document.getElementById("cw-msg").innerHTML = "<span class='game-lose'>😢 错了！连对 " + c.streak + t(" 次，获得 ") + prize + " 积分</span>"
      + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'cardwar\')">🔄 再来一局</button></div>';
  }
}

registerGame("cardwar", "🃏", "抽牌比大小", "猜下一张比当前大还是小，连对有加成", renderCardWar, () => ({ currentCard: 0, streak: 0, score: 0, gameOver: false, betPlaced: false, revealed: false }));

// ========== 🖱️ 点泡泡 ==========

function renderBubbles(el) {
  gs.bubbles = { score: 0, missed: 0, maxMissed: 10, gameOver: false, betPlaced: false, timer: null, spawnTimer: null };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>得分: <span id="bb-score">0</span></span><span>漏掉: <span id="bb-missed">0</span>/10</span></div>'
    + '<div class="bubble-stage" id="bb-stage"></div>'
    + '<div class="arcade-msg" id="bb-msg">点击开始</div>'
    + '<button class="game-btn" id="bb-start" onclick="bbStart()">🖱️ 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.bbStart = bbStart;
}

async function bbStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.bubbles.betPlaced) return;
  let r1 = await gameApi("bet", {game: "bubbles", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let b = gs.bubbles; b.betPlaced = true; b.score = 0; b.missed = 0; b.gameOver = false;
  document.getElementById("bb-start").style.display = "none";
  document.getElementById("bb-msg").textContent = t("点击泡泡戳破它们！");
  bbSpawn();
}

function bbSpawn() {
  if (gs.bubbles.gameOver) return;
  gs.bubbles.spawnTimer = setInterval(() => {
    let b = gs.bubbles; if (b.gameOver) { clearInterval(b.spawnTimer); return; }
    if (b.missed >= b.maxMissed) {
      b.gameOver = true; clearInterval(b.spawnTimer); clearInterval(b.timer);
      document.querySelectorAll(".bb-bubble").forEach(el => el.remove());
      let prize = b.score * 10;
      if (prize > 0) { gameApi("win", {game: "bubbles", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
      document.getElementById("bb-msg").innerHTML = "<span class='" + (b.score >= 20 ? "game-win" : "game-lose") + t("'>🖱️ 戳破 ") + b.score + t(" 个泡泡，获得 ") + prize + " 积分</span>"
        + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'bubbles\')">🔄 再来一局</button></div>';
      return;
    }
    let stage = document.getElementById("bb-stage"); if (!stage) return;
    let el = document.createElement("div"); el.className = "bb-bubble";
    el.textContent = Math.random() < 0.5 ? "🫧" : "○";
    let x = 20 + Math.random() * 440;
    let size = 24 + Math.random() * 20;
    let duration = 3 + Math.random() * 3;
    el.style.cssText = "position:absolute;left:" + x + "px;bottom:-40px;font-size:" + size + "px;cursor:pointer;transition:bottom " + duration + "s linear;user-select:none;z-index:5;opacity:0.8;";
    el.onclick = function() { if (b.gameOver) return; if (!this._popped) { this._popped = true; b.score++; document.getElementById("bb-score").textContent = b.score; playGameSound('click'); this.remove(); } };
    stage.appendChild(el);
    requestAnimationFrame(() => { el.style.bottom = "320px"; });
    setTimeout(() => { if (el.parentNode && !el._popped) { el.remove(); b.missed++; document.getElementById("bb-missed").textContent = b.missed; } }, duration * 1000);
  }, 400 + Math.random() * 400);
}

registerGame("bubbles", "🖱️", "点泡泡", "戳破上升的泡泡，漏 10 个结束", renderBubbles, () => ({ score: 0, missed: 0, maxMissed: 10, gameOver: false, betPlaced: false, timer: null, spawnTimer: null }));

// ========== 🔫 射飞碟 ==========

function renderSkeet(el) {
  gs.skeet = { score: 0, round: 0, maxRounds: 10, gameOver: false, betPlaced: false, timer: null };
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>第 <span id="sk-round">0</span>/10</span><span>命中: <span id="sk-score">0</span></span></div>'
    + '<div class="skeet-stage" id="sk-stage"></div>'
    + '<div class="arcade-msg" id="sk-msg">点击开始</div>'
    + '<button class="game-btn" id="sk-start" onclick="skStart()">🔫 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.skStart = skStart;
}

async function skStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.skeet.betPlaced) return;
  let r1 = await gameApi("bet", {game: "skeet", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let s = gs.skeet; s.betPlaced = true; s.score = 0; s.round = 0; s.gameOver = false;
  document.getElementById("sk-start").style.display = "none";
  document.getElementById("sk-msg").textContent = t("点击飞碟射击！");
  skNext();
}

function skNext() {
  let s = gs.skeet;
  if (s.round >= s.maxRounds) {
    s.gameOver = true; let prize = s.score * 50;
    if (prize > 0) { gameApi("win", {game: "skeet", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    document.getElementById("sk-msg").innerHTML = "<span class='" + (s.score >= 7 ? "game-win" : "game-lose") + t("'>🔫 命中 ") + s.score + t("/10 个飞碟，获得 ") + prize + " 积分</span>"
      + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'skeet\')">🔄 再来一局</button></div>';
    return;
  }
  s.round++; document.getElementById("sk-round").textContent = s.round;
  let stage = document.getElementById("sk-stage"); if (!stage) return;
  stage.querySelectorAll(".sk-disk").forEach(el => el.remove());
  let el = document.createElement("div"); el.className = "sk-disk";
  el.textContent = "🛸";
  let fromLeft = Math.random() < 0.5;
  el.style.cssText = "position:absolute;top:" + (60 + Math.random() * 100) + "px;left:" + (fromLeft ? -40 : 540) + "px;font-size:32px;cursor:pointer;transition:left 1.2s linear;user-select:none;z-index:5;";
  el.onclick = function() { if (s.gameOver) return; s.score++; document.getElementById("sk-score").textContent = s.score; playGameSound('win'); this.textContent = "💥"; setTimeout(() => { if (this.parentNode) this.remove(); setTimeout(skNext, 400); }, 200); };
  stage.appendChild(el);
  requestAnimationFrame(() => { el.style.left = fromLeft ? "540px" : "-40px"; });
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => { if (el.parentNode && el.textContent !== "💥") { el.remove(); document.getElementById("sk-msg").textContent = t("⏰ 飞碟飞走了！"); setTimeout(skNext, 500); } }, 1300);
}

registerGame("skeet", "🔫", "射飞碟", "射击飞过的飞碟，10 发射击", renderSkeet, () => ({ score: 0, round: 0, maxRounds: 10, gameOver: false, betPlaced: false, timer: null }));

// ========== 🎨 调色大师 ==========

function renderColorMatch(el) {
  gs.color = { target: { r: 0, g: 0, b: 0 }, current: { r: 128, g: 128, b: 128 }, round: 0, score: 0, gameOver: false, betPlaced: false };
  let t = gs.color.target; t.r = Math.floor(Math.random() * 256); t.g = Math.floor(Math.random() * 256); t.b = Math.floor(Math.random() * 256);
  el.innerHTML = '<div class="game-area"><div class="arcade-box">'
    + '<div class="arcade-header"><span>第 <span id="cl-round">1</span>/5 轮</span><span>得分: <span id="cl-score">0</span></span></div>'
    + '<div class="cl-target" id="cl-target" style="background:rgb(' + t.r + ',' + t.g + ',' + t.b + ')">目标颜色</div>'
    + '<div class="cl-current" id="cl-current" style="background:rgb(128,128,128)">你的调色</div>'
    + '<div class="cl-sliders"><div class="cl-slider-row"><span style="color:#e74c3c">R</span><input type="range" min="0" max="255" value="128" class="cl-slider" id="cl-r" oninput="clUpdate()"></div>'
    + '<div class="cl-slider-row"><span style="color:#2ecc71">G</span><input type="range" min="0" max="255" value="128" class="cl-slider" id="cl-g" oninput="clUpdate()"></div>'
    + '<div class="cl-slider-row"><span style="color:#3498db">B</span><input type="range" min="0" max="255" value="128" class="cl-slider" id="cl-b" oninput="clUpdate()"></div></div>'
    + '<div class="arcade-msg" id="cl-msg">拖动滑块匹配目标颜色</div>'
    + '<button class="game-btn" id="cl-submit" onclick="clSubmit()">🎨 提交</button>'
    + '<button class="game-btn" id="cl-start" onclick="clStart()" style="display:none">🎨 开始挑战</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.clUpdate = clUpdate; window.clSubmit = clSubmit; window.clStart = clStart;
}

function clUpdate() {
  let r = parseInt(document.getElementById("cl-r").value) || 0;
  let g = parseInt(document.getElementById("cl-g").value) || 0;
  let b = parseInt(document.getElementById("cl-b").value) || 0;
  gs.color.current = { r, g, b };
  document.getElementById("cl-current").style.background = "rgb(" + r + "," + g + "," + b + ")";
}

async function clStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError(t("请先设置用户名")); return; }
  if (gs.color.betPlaced) return;
  let r1 = await gameApi("bet", {game: "color", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.color.betPlaced = true; gs.color.round = 0; gs.color.score = 0; gs.color.gameOver = false;
  document.getElementById("cl-start").style.display = "none";
  document.getElementById("cl-submit").style.display = "inline-block";
  clNext();
}

function clNext() {
  let c = gs.color; c.round++; let t = c.target;
  t.r = Math.floor(Math.random() * 256); t.g = Math.floor(Math.random() * 256); t.b = Math.floor(Math.random() * 256);
  document.getElementById("cl-target").style.background = "rgb(" + t.r + "," + t.g + "," + t.b + ")";
  document.getElementById("cl-target").textContent = t("目标颜色 ") + c.round + "/5";
  document.getElementById("cl-round").textContent = c.round;
  document.getElementById("cl-r").value = 128; document.getElementById("cl-g").value = 128; document.getElementById("cl-b").value = 128;
  clUpdate();
  document.getElementById("cl-msg").textContent = t("拖动滑块匹配目标颜色！");
}

async function clSubmit() {
  let c = gs.color; if (c.gameOver) return;
  let diff = Math.abs(c.current.r - c.target.r) + Math.abs(c.current.g - c.target.g) + Math.abs(c.current.b - c.target.b);
  let pts = Math.max(0, Math.floor((765 - diff) / 10));
  c.score += pts; playGameSound(pts > 30 ? 'win' : 'click');
  document.getElementById("cl-score").textContent = c.score;
  document.getElementById("cl-msg").textContent = t("相差 ") + diff + t("，获得 ") + pts + t(" 分");
  if (c.round >= 5) {
    c.gameOver = true; let prize = c.score * 2;
    if (prize > 0) { gameApi("win", {game: "color", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    document.getElementById("cl-submit").style.display = "none";
    document.getElementById("cl-msg").innerHTML = "<span class='game-win'>🎨 总得分 " + c.score + t("，获得 ") + prize + " 积分</span>"
      + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'color\')">🔄 再来一局</button></div>';
  } else {
    setTimeout(clNext, 800);
  }
}

registerGame("color", "🎨", "调色大师", "拖动 RGB 滑块匹配目标颜色，5 轮比精度", renderColorMatch, () => ({ target: { r: 0, g: 0, b: 0 }, current: { r: 128, g: 128, b: 128 }, round: 0, score: 0, gameOver: false, betPlaced: false }));
