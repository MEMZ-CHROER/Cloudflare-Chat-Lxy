// v2 files panel — file attachment management
import { state } from "../store.js";

export function openFilePanel() {
  let panel = document.getElementById("v2-file-panel");
  if (panel) { panel.remove(); return; }

  panel = document.createElement("div");
  panel.id = "v2-file-panel";
  panel.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;width:90%;max-width:400px;z-index:1000;box-shadow:0 8px 32px rgba(0,0,0,0.3);";

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="margin:0;font-size:1.1rem;">📎 附件管理</h2>
      <button onclick="window.__v2_closeFilePanel()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:var(--text-secondary);">&times;</button>
    </div>
    <div style="margin-bottom:16px;">
      <input type="file" id="v2-file-upload-input" multiple style="display:none">
      <button onclick="document.getElementById('v2-file-upload-input').click()" 
        style="padding:8px 16px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
        📤 选择文件
      </button>
    </div>
    <div id="v2-file-list" style="max-height:300px;overflow-y:auto;">
      <div style="color:var(--text-secondary);text-align:center;padding:20px;">暂无附件</div>
    </div>
  `;

  document.body.appendChild(panel);
  panel.addEventListener("click", function(e) { if (e.target === panel) window.__v2_closeFilePanel(); });

  // File upload handler
  document.getElementById("v2-file-upload-input").addEventListener("change", function(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleFiles(Array.from(files));
    e.target.value = "";
  });
}

function handleFiles(files) {
  const list = document.getElementById("v2-file-list");
  if (!list) return;
  if (files.length > 0) list.innerHTML = "";

  files.forEach(function(file) {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg);border-radius:6px;margin-bottom:8px;";
    item.innerHTML = `
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${file.name}</span>
      <span style="font-size:12px;color:var(--text-secondary);">${formatSize(file.size)}</span>
      <button onclick="window.__v2_uploadFile(this, '${file.name}')" style="padding:4px 8px;background:var(--primary);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">上传</button>
    `;
    list.appendChild(item);
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function closeFilePanel() {
  const panel = document.getElementById("v2-file-panel");
  if (panel) panel.remove();
}

export async function uploadFile(btn, fileName) {
  btn.textContent = "上传中...";
  btn.disabled = true;
  try {
    // Use the existing upload module
    const uploadModule = await import("./upload.override.js");
    const url = await uploadModule.uploadFileByName(fileName);
    if (url && state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: "file", url: url, name: fileName }));
      btn.textContent = "✓ 已发送";
      btn.style.background = "#22c55e";
    } else {
      btn.textContent = "重试";
      btn.disabled = false;
    }
  } catch (e) {
    btn.textContent = "失败";
    btn.disabled = false;
  }
}

window.__v2_openFilePanel = openFilePanel;
window.__v2_closeFilePanel = closeFilePanel;
window.__v2_uploadFile = uploadFile;
