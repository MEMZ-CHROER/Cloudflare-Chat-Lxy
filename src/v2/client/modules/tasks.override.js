// v2 tasks override — daily/weekly task system
import { state } from "./store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";
import { escapeHtml } from "../renderers.override.js";

export function openTasks() {
  let panel = document.getElementById("v2-tasks-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-tasks-panel";
  panel.className = "v2-tasks-overlay";
  panel.innerHTML = `
    <div class="v2-tasks-modal">
      <div class="v2-tasks-header">
        <h2>📋 任务</h2>
        <button class="v2-tasks-close" onclick="window.__v2_closeTasks()">&times;</button>
      </div>
      <div class="v2-tasks-points">当前积分: <span id="v2-task-points">--</span></div>
      <div id="v2-tasks-list" class="v2-tasks-list"></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.addEventListener("click", e => { if (e.target === panel) window.__v2_closeTasks(); });
  loadTasks();
}

export function closeTasks() {
  const p = document.getElementById("v2-tasks-panel");
  if (p) p.remove();
}

async function loadTasks() {
  const list = document.getElementById("v2-tasks-list");
  const pointsEl = document.getElementById("v2-task-points");
  if (!list) return;

  list.innerHTML = '<div class="v2-tasks-loading">加载中...</div>';

  // Load points
  const token = localStorage.getItem("chat_token") || "";
  fetch("/api/points/all", { headers: { "Cookie": `token=${token}` } })
    .then(r => r.json())
    .then(data => {
      const name = state.user?.name;
      if (name && data[name] !== undefined) {
        if (pointsEl) pointsEl.textContent = data[name];
      }
    })
    .catch(() => {});

  // Load tasks
  try {
    const res = await fetch("/api/tasks/list");
    const tasks = await res.json();
    if (!Array.isArray(tasks) || tasks.length === 0) {
      list.innerHTML = '<div class="v2-tasks-empty">暂无任务</div>';
      return;
    }
    list.innerHTML = tasks.map(task => {
      const done = task.done || false;
      const progress = task.progress || 0;
      const maxProgress = task.maxProgress || 1;
      return `
        <div class="v2-task-item${done ? ' done' : ''}">
          <div class="v2-task-icon">${escapeHtml(task.icon || "📋")}</div>
          <div class="v2-task-info">
            <div class="v2-task-name">${escapeHtml(task.name)}</div>
            <div class="v2-task-desc">${escapeHtml(task.description || "")}</div>
            ${maxProgress > 1 ? `<div class="v2-task-progress"><div class="v2-task-progress-bar" style="width:${(progress/maxProgress*100).toFixed(0)}%"></div><span>${progress}/${maxProgress}</span></div>` : ''}
          </div>
          ${done
            ? '<span class="v2-task-done">✓ 已完成</span>'
            : `<button class="v2-task-claim-btn" onclick="window.__v2_claimTask('${task.id || task.name}')">领取 ${task.reward || 10} 🪙</button>`
          }
        </div>
      `;
    }).join("");
  } catch {
    list.innerHTML = '<div class="v2-tasks-error">加载失败</div>';
  }
}

async function claimTask(taskId) {
  const token = localStorage.getItem("chat_token") || "";
  try {
    const res = await fetch("/api/tasks/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": `token=${token}` },
      body: JSON.stringify({ id: taskId }),
    });
    const data = await res.json();
    if (data.ok) { showSuccess("任务完成！+" + (data.reward || 10) + " 积分"); loadTasks(); }
    else showError(data.error || "领取失败");
  } catch (e) { showError("领取失败: " + e.message); }
}

window.__v2_openTasks = openTasks;
window.__v2_closeTasks = closeTasks;
window.__v2_claimTask = claimTask;
