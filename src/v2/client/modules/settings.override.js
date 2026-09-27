// v2 settings override — user settings panel
import { state, patch } from "./store.js";
import { escapeHtml } from "./renderers.override.js";

export function openSettings() {
  let panel = document.getElementById("v2-settings-panel");
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement("div");
  panel.id = "v2-settings-panel";
  panel.className = "v2-settings-overlay";
  panel.innerHTML = `
    <div class="v2-settings-modal">
      <div class="v2-settings-header">
        <h2>设置</h2>
        <button class="v2-settings-close" onclick="closeV2Settings()">&times;</button>
      </div>
      <div class="v2-settings-body">
        <div class="v2-settings-section">
          <h3>个人信息</h3>
          <div class="v2-settings-row">
            <label>用户名</label>
            <input id="v2-settings-name" value="${escapeHtml(state.user?.name || "")}" maxlength="32">
          </div>
          <div class="v2-settings-row">
            <label>签名</label>
            <input id="v2-settings-tag" value="${escapeHtml(state.user?.tag || "")}" maxlength="20" placeholder="选填">
          </div>
        </div>
        <div class="v2-settings-section">
          <h3>显示设置</h3>
          <div class="v2-settings-row">
            <label>主题</label>
            <select id="v2-settings-theme">
              <option value="dark">深色</option>
              <option value="light">浅色</option>
              <option value="auto">自动</option>
            </select>
          </div>
          <div class="v2-settings-row">
            <label>字体大小</label>
            <select id="v2-settings-fontsize">
              <option value="12">12px</option>
              <option value="14" selected>14px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
            </select>
          </div>
          <div class="v2-settings-row">
            <label>显示时间</label>
            <input type="checkbox" id="v2-settings-showtime" ${state.showTime !== false ? "checked" : ""}>
          </div>
        </div>
        <div class="v2-settings-section">
          <h3>通知</h3>
          <div class="v2-settings-row">
            <label>消息提醒</label>
            <input type="checkbox" id="v2-settings-notif" ${state.notify !== false ? "checked" : ""}>
          </div>
          <div class="v2-settings-row">
            <label>@提醒</label>
            <input type="checkbox" id="v2-settings-atnotif" ${state.atNotif !== false ? "checked" : ""}>
          </div>
        </div>
      </div>
      <div class="v2-settings-footer">
        <button class="v2-settings-save" onclick="saveV2Settings()">保存</button>
        <button class="v2-settings-cancel" onclick="closeV2Settings()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  panel.addEventListener("click", e => { if (e.target === panel) closeV2Settings(); });
}

export function closeV2Settings() {
  const panel = document.getElementById("v2-settings-panel");
  if (panel) panel.remove();
}

export function saveV2Settings() {
  const name = document.getElementById("v2-settings-name")?.value.trim();
  const tag = document.getElementById("v2-settings-tag")?.value.trim();
  const theme = document.getElementById("v2-settings-theme")?.value;
  const fontsize = document.getElementById("v2-settings-fontsize")?.value;
  const showTime = document.getElementById("v2-settings-showtime")?.checked;
  const notify = document.getElementById("v2-settings-notif")?.checked;
  const atNotif = document.getElementById("v2-settings-atnotif")?.checked;

  if (name && name !== state.user?.name) {
    // Rename via WS
    if (state.ws) {
      state.ws.send(JSON.stringify({ type: "rename", name }));
    }
    patch({ user: { ...state.user, name } });
  }

  if (tag !== state.user?.tag) {
    if (state.ws) {
      state.ws.send(JSON.stringify({ type: "tag", tag }));
    }
    patch({ user: { ...state.user, tag } });
  }

  localStorage.setItem("v2_theme", theme || "dark");
  localStorage.setItem("v2_fontsize", fontsize || "14");
  localStorage.setItem("v2_showtime", showTime ? "1" : "0");
  localStorage.setItem("v2_notify", notify ? "1" : "0");
  localStorage.setItem("v2_atnotif", atNotif ? "1" : "0");

  applyV2Settings();
  closeV2Settings();
}

export function applyV2Settings() {
  const theme = localStorage.getItem("v2_theme") || "dark";
  const fontsize = localStorage.getItem("v2_fontsize") || "14";
  const showTime = localStorage.getItem("v2_showtime") !== "0";

  document.body.style.fontSize = fontsize + "px";
  document.body.style.background = theme === "light" ? "#f8fafc" : "#0f172a";
  document.body.style.color = theme === "light" ? "#1e293b" : "#e2e8f0";

  state.showTime = showTime;
}

export function initSettings() {
  applyV2Settings();
}

window.__v2_openSettings = openSettings;
window.__v2_closeSettings = closeV2Settings;
window.__v2_saveSettings = saveV2Settings;
