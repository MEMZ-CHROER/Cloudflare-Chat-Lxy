// ⏱️ 动作游戏组 — 打地鼠 / 速算挑战 / 反应测试 / 叠叠乐
import { gs, gameApi, updateBalance, registerGame, playGameSound } from './game-core.js';
import { state, showError } from './state.js';

// ========== 🌊 打地鼠 ==========

function renderMole(el) {
  gs.mole = { score: 0, timeLeft: 20, gameOver: false, timer: null, moleTimer: null, betPlaced: false };
  el.innerHTML = '<div class="game-area"><div class="mole-box">'
    + '<div class="mole-header"><span>⏱️ <span id="mole-time">20</span>s</span><span>得分: <span id="mole-score">0</span></span></div>'
    + '<div class="mole-grid" id="mole-grid">' + Array.from({length: 9}, (_, i) => '<button class="mole-hole" data-i="' + i + '" onclick="moleWhack(' + i + ')"><span class="mole-inner" id="mole-' + i + '"></span></button>').join("")
    + '</div><div class="mole-msg" id="mole-msg">点击开始游戏</div>'
    + '<button class="game-btn" id="mole-start" onclick="moleStart()">🌊 开始</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.moleWhack = moleWhack; window.moleStart = moleStart;
}

async function moleStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError("请先设置用户名"); return; }
  if (gs.mole.betPlaced) return;
  let r1 = await gameApi("bet", {game: "mole", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.mole.betPlaced = true; gs.mole.score = 0; gs.mole.timeLeft = 20; gs.mole.gameOver = false;
  document.getElementById("mole-start").disabled = true; document.getElementById("mole-start").textContent = "游戏中...";
  moleSpawn();
  gs.mole.timer = setInterval(() => {
    gs.mole.timeLeft--; document.getElementById("mole-time").textContent = gs.mole.timeLeft;
    if (gs.mole.timeLeft <= 0) {
      clearInterval(gs.mole.timer); clearInterval(gs.mole.moleTimer); gs.mole.gameOver = true;
      document.querySelectorAll(".mole-inner").forEach(el => el.textContent = "");
      let s = gs.mole.score, prize = s * 50 + (s >= 15 ? 500 : 0);
      if (prize > 0) { gameApi("win", {game: "mole", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } });
      } else { playGameSound('lose'); }
      document.getElementById("mole-msg").innerHTML = "<span class='" + (s >= 10 ? "game-win" : "game-lose") + "'>⏰ 时间到！击中 " + s + " 只，获得 " + prize + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'mole\')">🔄 再来一局</button></div>';
    }
  }, 1000);
}

function moleSpawn() {
  if (gs.mole.gameOver) return;
  document.querySelectorAll(".mole-inner").forEach(el => el.textContent = "");
  let moles = Math.random() < 0.6 ? 1 : 2, chosen = new Set();
  while (chosen.size < moles) { let i = Math.floor(Math.random() * 9); if (!chosen.has(i)) { chosen.add(i); document.getElementById("mole-" + i).textContent = "🐹"; } }
  if (gs.mole.moleTimer) clearInterval(gs.mole.moleTimer);
  gs.mole.moleTimer = setInterval(() => {
    if (gs.mole.gameOver) { clearInterval(gs.mole.moleTimer); return; }
    document.querySelectorAll(".mole-inner").forEach(el => el.textContent = "");
    let n = Math.random() < 0.6 ? 1 : 2, picked = new Set();
    while (picked.size < n) { let i = Math.floor(Math.random() * 9); if (!picked.has(i)) { picked.add(i); document.getElementById("mole-" + i).textContent = "🐹"; } }
  }, 1200);
}

function moleWhack(i) {
  if (gs.mole.gameOver) return;
  let el = document.getElementById("mole-" + i);
  if (el.textContent === "🐹") { gs.mole.score++; document.getElementById("mole-score").textContent = gs.mole.score; el.textContent = "💥"; setTimeout(() => { if (!gs.mole.gameOver) el.textContent = ""; }, 150); }
}

registerGame("mole", "🌊", "打地鼠", "20 秒疯狂点击，点越多奖越多！入场 100 积分", renderMole, () => ({ score: 0, timeLeft: 20, gameOver: false, timer: null, moleTimer: null, betPlaced: false }));

// ========== 🧮 速算挑战 ==========

function quizGenQ() {
  let a = Math.floor(Math.random() * 90) + 10, b = Math.floor(Math.random() * 9) + 1, op = Math.random() < 0.5 ? "+" : "-";
  let correct = op === "+" ? a + b : a - b, opts = new Set([correct]);
  while (opts.size < 4) { let offset = Math.floor(Math.random() * 20) - 10; if (offset !== 0) opts.add(correct + offset); }
  return { question: a + " " + op + " " + b + " = ?", answer: correct, options: [...opts].sort(() => Math.random() - 0.5).slice(0, 4) };
}

function renderQuiz(el) {
  gs.quiz = { qIndex: 0, score: 0, questions: [], answered: false, gameOver: false, timeLeft: 5, timer: null, betPlaced: false };
  el.innerHTML = '<div class="game-area"><div class="quiz-box">'
    + '<div class="quiz-header"><span>题目 <span id="quiz-progress">0/10</span></span><span>得分: <span id="quiz-score">0</span></span><span>⏱️ <span id="quiz-time">5</span>s</span></div>'
    + '<div class="quiz-question" id="quiz-question">点击开始</div><div class="quiz-options" id="quiz-options"></div><div class="quiz-msg" id="quiz-msg"></div>'
    + '<button class="game-btn" id="quiz-start" onclick="quizStart()">🧮 开始挑战</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.quizStart = quizStart; window.quizAnswer = quizAnswer;
}

async function quizStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError("请先设置用户名"); return; }
  let r1 = await gameApi("bet", {game: "quiz", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  gs.quiz.betPlaced = true; gs.quiz.qIndex = 0; gs.quiz.score = 0; gs.quiz.questions = []; gs.quiz.gameOver = false;
  for (let i = 0; i < 10; i++) gs.quiz.questions.push(quizGenQ());
  document.getElementById("quiz-start").style.display = "none"; quizNext();
}

function quizNext() {
  let q = gs.quiz;
  if (q.qIndex >= 10) {
    q.gameOver = true; let prize = q.score * 100 + (q.score === 10 ? 1000 : 0);
    if (prize > 0) { gameApi("win", {game: "quiz", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    document.getElementById("quiz-msg").innerHTML = "<span class='" + (q.score >= 7 ? "game-win" : "game-lose") + "'>📊 完成！答对 " + q.score + "/10，获得 " + prize + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'quiz\')">🔄 再来一局</button></div>';
    return;
  }
  let qd = q.questions[q.qIndex];
  document.getElementById("quiz-progress").textContent = (q.qIndex + 1) + "/10";
  document.getElementById("quiz-score").textContent = q.score;
  document.getElementById("quiz-question").textContent = qd.question;
  document.getElementById("quiz-options").innerHTML = qd.options.map((opt, i) => '<button class="quiz-option" onclick="quizAnswer(' + i + ')">' + opt + '</button>').join("");
  document.getElementById("quiz-msg").textContent = ""; q.answered = false; q.timeLeft = 5;
  document.getElementById("quiz-time").textContent = "5";
  if (q.timer) clearInterval(q.timer);
  q.timer = setInterval(() => { q.timeLeft--; document.getElementById("quiz-time").textContent = q.timeLeft; if (q.timeLeft <= 0 && !q.answered) { clearInterval(q.timer); q.answered = true; document.getElementById("quiz-msg").textContent = "⏰ 超时！答案是 " + qd.answer; document.getElementById("quiz-options").innerHTML = ""; q.qIndex++; setTimeout(quizNext, 1200); } }, 1000);
}

function quizAnswer(idx) {
  let q = gs.quiz;
  if (q.answered || q.gameOver) return;
  q.answered = true; if (q.timer) clearInterval(q.timer);
  let qd = q.questions[q.qIndex];
  if (qd.options[idx] === qd.answer) { q.score++; document.getElementById("quiz-score").textContent = q.score; document.getElementById("quiz-msg").innerHTML = "<span class='game-win'>✅ 正确！</span>"; }
  else { document.getElementById("quiz-msg").innerHTML = "<span class='game-lose'>❌ 错误，答案是 " + qd.answer + "</span>"; }
  document.getElementById("quiz-options").innerHTML = ""; q.qIndex++;
  setTimeout(quizNext, 800);
}

registerGame("quiz", "🧮", "速算挑战", "10 道算术题限时作答，全对额外奖 1000！", renderQuiz, () => ({ qIndex: 0, score: 0, questions: [], answered: false, gameOver: false, timeLeft: 5, timer: null, betPlaced: false }));

// ========== ⚡ 反应测试 ==========

function renderReaction(el) {
  gs.reaction = { round: 0, score: 0, phase: "wait", startTime: 0, gameOver: false, betPlaced: false, timer: null };
  el.innerHTML = '<div class="game-area"><div class="reaction-box">'
    + '<div class="reaction-header">第 <span id="rxn-round">0</span>/5 轮 | 得分: <span id="rxn-score">0</span></div>'
    + '<div class="reaction-pad" id="rxn-pad" onclick="rxnClick()"><div class="reaction-text" id="rxn-text">点击开始</div></div>'
    + '<div class="reaction-msg" id="rxn-msg"></div>'
    + '<button class="game-btn" id="rxn-start" onclick="rxnStart()">⚡ 开始测试</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.rxnClick = rxnClick; window.rxnStart = rxnStart;
}

async function rxnStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError("请先设置用户名"); return; }
  let r1 = await gameApi("bet", {game: "reaction", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let r = gs.reaction; r.betPlaced = true; r.round = 0; r.score = 0; r.gameOver = false;
  document.getElementById("rxn-start").style.display = "none"; rxnNext();
}

function rxnNext() {
  let r = gs.reaction;
  if (r.round >= 5) {
    r.gameOver = true; let avg = r.score / 5, pts = Math.max(50, Math.floor((500 - avg) * 2));
    document.getElementById("rxn-msg").innerHTML = "<span class='" + (avg < 300 ? "game-win" : "game-lose") + "'>📊 平均反应 " + avg.toFixed(0) + "ms，获得 " + pts + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'reaction\')">🔄 再来一局</button></div>';
    let pad = document.getElementById("rxn-pad"); if (pad) pad.style.background = "#f0f2f5";
    gameApi("win", {game: "reaction", win: pts}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } });
    return;
  }
  r.round++; r.phase = "wait";
  document.getElementById("rxn-round").textContent = r.round;
  let pad = document.getElementById("rxn-pad"), text = document.getElementById("rxn-text");
  if (pad) { pad.style.background = "#ff6b6b"; pad.style.cursor = "default"; }
  if (text) text.textContent = "等待绿色...";
  let delay = 1000 + Math.random() * 3000;
  if (r.timer) clearTimeout(r.timer);
  r.timer = setTimeout(() => { r.phase = "go"; r.startTime = Date.now(); if (pad) { pad.style.background = "#2ecc71"; pad.style.cursor = "pointer"; } if (text) text.textContent = "点击！"; }, delay);
}

function rxnClick() {
  let r = gs.reaction; if (r.gameOver) return;
  let pad = document.getElementById("rxn-pad"), text = document.getElementById("rxn-text");
  if (r.phase === "wait") {
    if (pad) pad.style.background = "#ff6b6b"; if (text) text.textContent = "❌ 抢跑了！等变绿";
    if (r.timer) { clearTimeout(r.timer); r.timer = null; } r.phase = "penalty"; setTimeout(rxnNext, 1000);
  } else if (r.phase === "go") {
    let elapsed = Date.now() - r.startTime; r.score += elapsed;
    document.getElementById("rxn-score").textContent = r.score;
    if (pad) { pad.style.background = "#2ecc71"; pad.style.cursor = "default"; }
    if (text) text.textContent = "✅ " + elapsed.toFixed(0) + "ms";
    r.phase = "done"; setTimeout(rxnNext, 1000);
  }
}

registerGame("reaction", "⚡", "反应测试", "等变绿立刻点！5 轮测你的反应速度", renderReaction, () => ({ round: 0, score: 0, phase: "wait", startTime: 0, gameOver: false, betPlaced: false, timer: null }));

// ========== 🧱 叠叠乐 ==========

function renderStack(el) {
  gs.stack = { blocks: [], width: 200, x: 0, dir: 1, speed: 3, level: 0, gameOver: false, betPlaced: false, anim: null };
  el.innerHTML = '<div class="game-area"><div class="stack-box">'
    + '<div class="stack-header">层数: <span id="stack-level">0</span> | 得分: <span id="stack-score">0</span></div>'
    + '<div class="stack-stage" id="stack-stage" onclick="stackDrop()">'
    + '<div class="stack-platform"></div><div class="stack-block" id="stack-block"></div></div>'
    + '<div class="stack-msg" id="stack-msg">点击开始</div>'
    + '<button class="game-btn" id="stack-start" onclick="stackStart()">🧱 开始堆叠</button>'
    + '<div class="game-back" onclick="switchGame(\'menu\')">← 返回游戏列表</div></div></div>';
  window.stackStart = stackStart; window.stackDrop = stackDrop;
}

async function stackStart() {
  let name = state.username || localStorage.getItem("chat_user") || "";
  if (!name) { showError("请先设置用户名"); return; }
  let r1 = await gameApi("bet", {game: "stack", wager: 100});
  if (r1.error) { showError(r1.error); return; }
  gs.balance = r1.balance || gs.balance; updateBalance();
  let s = gs.stack; s.betPlaced = true; s.blocks = [{x: 0, width: 200}]; s.width = 200; s.x = 0; s.dir = 1; s.speed = 3; s.level = 0; s.gameOver = false;
  document.getElementById("stack-start").style.display = "none";
  document.getElementById("stack-msg").textContent = "点击方块让它落下！";
  stackAnim();
}

function stackAnim() {
  let s = gs.stack; if (s.gameOver) return;
  s.x += s.speed * s.dir; if (s.x > 80) s.dir = -1; if (s.x < -80) s.dir = 1;
  let block = document.getElementById("stack-block"); if (block) block.style.transform = "translateX(" + s.x + "px)";
  s.anim = requestAnimationFrame(stackAnim);
}

function stackDrop() {
  let s = gs.stack; if (s.gameOver) return;
  if (s.anim) { cancelAnimationFrame(s.anim); s.anim = null; }
  let last = s.blocks[s.blocks.length - 1], offset = Math.abs(s.x), newWidth = s.width - offset * 2;
  if (newWidth <= 5) {
    s.gameOver = true; let prize = s.level * 100;
    document.getElementById("stack-msg").innerHTML = "<span class='game-lose'>💥 倒了！堆了 " + s.level + " 层，获得 " + prize + " 积分</span>" + '<div style="margin-top:10px;"><button class="game-btn" onclick="switchGame(\'stack\')">🔄 再来一局</button></div>';
    if (prize > 0) { gameApi("win", {game: "stack", win: prize}).then(r2 => { if (!r2.error) { gs.balance = r2.balance || gs.balance; updateBalance(); } }); }
    return;
  }
  s.level++; s.width = newWidth; s.x = s.x > 0 ? offset : -offset;
  s.blocks.push({x: s.x, width: s.width}); s.speed = 3 + s.level * 0.3;
  let stage = document.getElementById("stack-stage");
  if (!stage) return;
  stage.querySelectorAll(".stack-placed").forEach(el => el.remove());
  s.blocks.forEach((b, i) => { let top = 180 - i * 22; let el = document.createElement("div"); el.className = "stack-placed"; el.style.cssText = "position:absolute;bottom:" + top + "px;left:50%;width:" + b.width + "px;height:20px;background:var(--primary);transform:translateX(calc(-50% + " + b.x + "px));border-radius:3px;"; stage.appendChild(el); });
  let block = document.getElementById("stack-block"); if (block) block.style.width = newWidth + "px";
  document.getElementById("stack-level").textContent = s.level; document.getElementById("stack-score").textContent = s.level * 100;
  s.x = -s.dir * Math.min(Math.abs(s.x), 60); stackAnim();
}

registerGame("stack", "🧱", "叠叠乐", "方块滑落堆叠，越叠越高！每层 +100 分", renderStack, () => ({ blocks: [], width: 200, x: 0, dir: 1, speed: 3, level: 0, gameOver: false, betPlaced: false, anim: null }));
