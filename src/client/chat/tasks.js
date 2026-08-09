// 任务弹窗
import { state, t } from './state.js';
import { escapeHtml, updatePointsDisplay } from './renderers.js';
import { getAuthName, getAuthToken, isAuthenticated } from './auth.js';

// v1.53 双轨：默认走 Vue3 弹窗管理器；localStorage.chatLegacyModals=1 时回退旧 overlay
export function openTasks() {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    openTasksLegacy();
    return;
  }
  import('./modal-manager.js').then(m => m.openModal('tasks')).catch(() => openTasksLegacy());
}
export function closeTasks() {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    document.getElementById("task-overlay").classList.remove("show");
    return;
  }
  import('./modal-manager.js').then(m => m.closeModal('tasks')).catch(() => {
    document.getElementById("task-overlay").classList.remove("show");
  });
}

function openTasksLegacy() {
  document.getElementById("task-overlay").classList.add("show");
  loadTasks();
}

function updateTaskPoints() {
  let name = getAuthName();
  if (!name) return;
  fetch("/api/points/all").then(r => r.json()).then(data => {
    let pts = data[name];
    if (pts !== undefined) document.getElementById("task-points-display").textContent = pts + t(" 积分");
  }).catch(() => {});
}

async function loadTasks() {
  let container = document.getElementById("task-content");
  if (!isAuthenticated()) { container.innerHTML = '<div class="task-empty">请先<a href="#" onclick="closeTasks();return false">登录</a>后查看任务</div>'; return; }
  updateTaskPoints();
  try {
    let [tasksR, compR, claimsR] = await Promise.all([
      fetch("/api/tasks/list"),
      fetch("/api/tasks/completions?name=" + encodeURIComponent(getAuthName())),
      fetch("/api/tasks/claims?name=" + encodeURIComponent(getAuthName()))
    ]);
    let tasks = await tasksR.json();
    let compData = await compR.json();
    let completed = compData.completed || [];
    let clData = await claimsR.json();
    let claimed = clData.claimed || [];
    if (!tasks || tasks.length === 0) { container.innerHTML = '<div class="task-empty">暂无可用任务</div>'; return; }
    let html = "";
    for (let task of tasks) {
      let isDone = completed.includes(task.id);
      let isClaimed = claimed.includes(task.id);
      let isClaimedByOther = task.claimedBy && task.claimedBy !== getAuthName();
      let btnHtml;
      if (isDone) btnHtml = '<button class="task-btn task-btn-done">已完成 ✓</button>';
      else if (isClaimedByOther) btnHtml = '<button class="task-btn task-btn-done">已被领取</button>';
      else if (isClaimed) btnHtml = '<button class="task-btn task-btn-claim task-btn-complete" data-task-id="' + escapeHtml(task.id) + '">完成任务</button>';
      else btnHtml = '<button class="task-btn task-btn-claim" data-task-id="' + escapeHtml(task.id) + '">领取任务</button>';
      html += '<div class="task-item">' +
        '<div class="task-item-info"><div class="task-item-name">' + escapeHtml(task.name) + '</div>' +
        (task.description ? '<div class="task-item-desc">' + escapeHtml(task.description) + '</div>' : '') +
        '</div><span class="task-item-reward">+' + escapeHtml(task.reward) + ' 积分</span>' +
        btnHtml + '</div>';
    }
    container.innerHTML = html;
  } catch (e) { container.innerHTML = '<div class="task-empty">加载失败: ' + e.message + '</div>'; }
}

export async function claimTask(taskId) {
  try {
    let r = await fetch("/api/tasks/claim", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), taskId, token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(data.error);
    else { alert("已领取任务！完成任务后可获得奖励。"); loadTasks(); }
  } catch (e) { alert("领取失败: " + e.message); }
}

export async function completeTask(taskId) {
  try {
    let r = await fetch("/api/tasks/complete", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({name: getAuthName(), taskId, token: getAuthToken()})});
    let data = await r.json();
    if (data.error) alert(data.error);
    else { alert("任务完成！获得 " + data.reward + t(" 积分！当前积分: ") + data.total); updatePointsDisplay(); loadTasks(); }
  } catch (e) { alert("提交失败: " + e.message); }
}

// 事件委托
(function() {
  let el = document.getElementById("task-content");
  if (el) el.addEventListener("click", (e) => {
    let btn = e.target.closest(".task-btn-claim");
    if (!btn) return;
    let id = btn.dataset.taskId;
    if (!id) return;
    if (btn.classList.contains("task-btn-complete")) completeTask(id);
    else claimTask(id);
  });
})();

(function() {
  let el = document.getElementById("task-overlay");
  if (el) el.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeTasks(); });
})();
