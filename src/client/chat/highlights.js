// 精华消息面板
import { state } from './state.js';
import { escapeHtml } from './renderers.js';

// 精华消息面板
// v1.53 双轨：默认走 Vue3 弹窗管理器（居中 modal）；localStorage.chatLegacyModals=1 时回退旧浮层
export function showHighlightsPanel() {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    showHighlightsPanelLegacy();
    return;
  }
  import('./modal-manager.js').then(m => {
    if (m.stack.some(x => x.name === 'highlights')) {
      m.closeModal('highlights');
    } else {
      m.openModal('highlights');
    }
  }).catch(() => showHighlightsPanelLegacy());
}

// 旧浮层：创建/移除 #hl-panel overlay
function showHighlightsPanelLegacy() {
  let existing = document.getElementById("hl-panel");
  if (existing) { existing.remove(); return; }

  let overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:150;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  let panel = document.createElement("div");
  panel.style.cssText = "background:var(--surface);border-radius:12px;padding:16px;min-width:300px;max-width:420px;max-height:70vh;box-shadow:0 8px 32px rgba(0,0,0,0.2);color:var(--text);font-size:13px;display:flex;flex-direction:column;overflow:hidden;";

  let header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;";
  header.innerHTML = '<strong style="font-size:15px;">⭐ 精华消息</strong><span style="cursor:pointer;font-size:20px;line-height:1;color:var(--text-secondary);" id="hl-close">&times;</span>';
  panel.appendChild(header);

  let list = document.createElement("div");
  list.style.cssText = "flex:1;overflow-y:auto;min-height:100px;";

  let highlights = state._highlights || [];
  if (highlights.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:40px 0;">暂无精华消息</div>';
  } else {
    highlights.slice().reverse().forEach(h => {
      let row = document.createElement("div");
      row.style.cssText = "padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:4px;background:var(--bg);transition:background 0.1s;";
      row.addEventListener("mouseenter", () => row.style.background = "var(--hover-bg, #e8e8e8)");
      row.addEventListener("mouseleave", () => row.style.background = "var(--bg)");
      row.innerHTML = '<div style="font-weight:600;font-size:12px;">' + escapeHtml(h.name) + '</div><div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(h.text) + '</div>';
      row.addEventListener("click", () => {
        let el = state.chatlog.querySelector('[data-timestamp="' + h.timestamp + '"]');
        if (el) { el.scrollIntoView({behavior: "smooth", block: "center"}); el.classList.add("msg-ref-highlight"); setTimeout(() => el.classList.remove("msg-ref-highlight"), 2000); }
        overlay.remove();
      });
      list.appendChild(row);
    });
  }

  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.getElementById("hl-close").onclick = () => overlay.remove();
}
