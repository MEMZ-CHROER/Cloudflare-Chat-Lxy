// 附件/文件管理面板
import { state, t } from './state.js';

// v1.53 双轨：默认走 Vue3 弹窗管理器（居中 modal）；localStorage.chatLegacyModals=1 时回退旧 overlay（保底可回退）
export function toggleFilesPanel() {
  if (localStorage.getItem("chatLegacyModals") === "1") {
    toggleFilesPanelLegacy();
    return;
  }
  import('./modal-manager.js').then(m => {
    if (m.stack.some(x => x.name === 'filespanel')) m.closeModal('filespanel');
    else m.openModal('filespanel');
  }).catch(() => toggleFilesPanelLegacy());
}

function toggleFilesPanelLegacy() {
  let existing = document.getElementById("files-panel");
  if (existing) { existing.remove(); return; }

  let overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:150;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  let panel = document.createElement("div");
  panel.style.cssText = "background:var(--surface);border-radius:12px;padding:16px;min-width:320px;max-width:440px;max-height:70vh;box-shadow:0 8px 32px rgba(0,0,0,0.2);color:var(--text);font-size:13px;display:flex;flex-direction:column;overflow:hidden;";

  let header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;";
  header.innerHTML = '<strong style="font-size:15px;">📎 附件管理</strong><span style="cursor:pointer;font-size:20px;line-height:1;color:var(--text-secondary);" id="fp-close">&times;</span>';
  panel.appendChild(header);

  let tabs = document.createElement("div");
  tabs.style.cssText = "display:flex;gap:8px;margin-bottom:10px;border-bottom:1px solid var(--border);padding-bottom:6px;";
  let activeTab = "image";

  function makeTab(label, type) {
    let t = document.createElement("span");
    t.textContent = label;
    t.style.cssText = "cursor:pointer;padding:4px 12px;border-radius:4px;font-size:12px;background:" + (type === activeTab ? "var(--primary)" : "var(--bg)") + ";color:" + (type === activeTab ? "#fff" : "var(--text-secondary)") + ";";
    t.addEventListener("click", () => renderList(type));
    return t;
  }

  let tabImg = makeTab(t("🖼 图片"), "image");
  let tabFile = makeTab(t("📎 文件"), "file");
  tabs.appendChild(tabImg);
  tabs.appendChild(tabFile);
  panel.appendChild(tabs);

  let list = document.createElement("div");
  list.style.cssText = "flex:1;overflow-y:auto;min-height:200px;";
  panel.appendChild(list);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.getElementById("fp-close").onclick = () => overlay.remove();

  function renderList(type) {
    activeTab = type;
    tabImg.style.background = type === "image" ? "var(--primary)" : "var(--bg)";
    tabImg.style.color = type === "image" ? "#fff" : "var(--text-secondary)";
    tabFile.style.background = type === "file" ? "var(--primary)" : "var(--bg)";
    tabFile.style.color = type === "file" ? "#fff" : "var(--text-secondary)";
    list.innerHTML = "";

    let msgs = state.chatlog.querySelectorAll(".chat-msg");
    let items = [];
    msgs.forEach(msg => {
      if (type === "image") {
        let img = msg.querySelector(".bubble img");
        if (img) {
          let nameEl = msg.querySelector(".username");
          let timeEl = msg.querySelector(".msg-time");
          items.push({el: msg, src: img.src, name: nameEl ? nameEl.textContent : "?", time: timeEl ? timeEl.textContent : "", type: "image"});
        }
      } else {
        let fileLink = msg.querySelector(".file-msg");
        if (fileLink) {
          let nameEl = msg.querySelector(".username");
          let timeEl = msg.querySelector(".msg-time");
          let fileName = fileLink.querySelector(".file-name")?.textContent || fileLink.textContent;
          items.push({el: msg, name: nameEl ? nameEl.textContent : "?", time: timeEl ? timeEl.textContent : "", fileName, type: "file"});
        }
      }
    });

    if (items.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:40px 0;">暂无' + (type === "image" ? "图片" : t("文件")) + '</div>';
      return;
    }

    items.reverse().forEach((item, i) => {
      let row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px;background:var(--bg);";
      row.addEventListener("mouseenter", () => row.style.background = "var(--hover-bg, #e8e8e8)");
      row.addEventListener("mouseleave", () => row.style.background = "var(--bg)");
      row.addEventListener("click", () => {
        item.el.scrollIntoView({behavior: "smooth", block: "center"});
        item.el.classList.add("msg-ref-highlight");
        setTimeout(() => item.el.classList.remove("msg-ref-highlight"), 2000);
        overlay.remove();
      });

      if (type === "image") {
        let thumb = document.createElement("img");
        thumb.src = item.src;
        thumb.style.cssText = "width:40px;height:40px;border-radius:4px;object-fit:cover;flex-shrink:0;";
        row.appendChild(thumb);
      } else {
        let icon = document.createElement("span");
        icon.textContent = "📎";
        icon.style.cssText = "font-size:18px;flex-shrink:0;";
        row.appendChild(icon);
      }

      let info = document.createElement("div");
      info.style.cssText = "flex:1;overflow:hidden;";
      let nameSpan = document.createElement("div");
      nameSpan.textContent = type === "image" ? item.name : item.fileName;
      nameSpan.style.cssText = "font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      info.appendChild(nameSpan);
      let meta = document.createElement("div");
      meta.textContent = item.time + " · " + item.name;
      meta.style.cssText = "font-size:10px;color:var(--text-secondary);";
      info.appendChild(meta);
      row.appendChild(info);

      list.appendChild(row);
    });
  }

  renderList("image");
}
