// v2 settings override — user settings panel (dual-mode: v1 overlay + v2 panel)
import { state, patch } from "../store.js";
import { escapeHtml } from "../renderers.override.js";

export function openSettings() {
  // Try v1-compatible overlay first
  let overlay = document.getElementById("settings-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "1000";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    return;
  }

  // Fallback to dynamically created panel
  let panel = document.getElementById("v2-settings-panel");
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement("div");
  panel.id = "v2-settings-panel";
  panel.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;";
  panel.innerHTML = `
    <div style="background:#1e293b;border-radius:12px;padding:24px;width:90%;max-width:400px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h2 style="font-size:1.25rem;">设置</h2>
        <button style="background:none;border:none;font-size:1.5rem;color:#94a3b8;cursor:pointer;" onclick="closeV2Settings()">&times;</button>
      </div>
      <div style="margin-bottom:20px;">
        <h3 style="font-size:1rem;color:#94a3b8;margin-bottom:12px;">个人信息</h3>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <label style="color:#e2e8f0;">用户名</label>
          <input id="v2-settings-name" value="${escapeHtml(state.user?.name || "")}" maxlength="32" style="padding:8px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0;">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <label style="color:#e2e8f0;">签名</label>
          <input id="v2-settings-tag" value="${escapeHtml(state.user?.tag || "")}" maxlength="20" placeholder="选填" style="padding:8px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0;">
        </div>
      </div>
      <div style="display:flex;gap:12px;justify-content:flex-end;">
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
