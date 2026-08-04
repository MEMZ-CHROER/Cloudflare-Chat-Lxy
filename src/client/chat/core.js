// startChat 核心初始化
import { state, t } from './state.js';
import { join } from './websocket.js';
import { handleCommand } from './commands.js';
import { addChatMessage } from './renderers.js';
import { sendTyping, cancelReply } from './ui.js';
import { showToast, showSuccess, showError } from './state.js';
import { initImageUpload } from './image-upload.js';
import { initVoiceRecord } from './voice-record.js';
import { initFileUpload } from './file-upload.js';
import { initMention, showMentionDropdown, hideMentionDropdown, insertMention } from './mention.js';
import { initEmojiPanel } from './emoji-panel.js';

export function startChat() {
  if (window._chatStarted) return;
  window._chatStarted = true;

  if (state.roomListInterval) { clearInterval(state.roomListInterval); state.roomListInterval = null; }
  document.querySelector("#room-list-form").style.display = "none";
  state.chatroom.style.display = "block";

  state.roomname = state.roomname.replace(/[^a-zA-Z0-9_-]/g, "").replace(/_/g, "-").toLowerCase();
  if (state.roomname.length > 32 && !state.roomname.match(/^[0-9a-f]{64}$/)) { addChatMessage(t("错误"), t("无效的房间名称。")); return; }

  document.location.hash = "#" + state.roomname;

  // 加载自定义表情
  import('./renderers.js').then(m => m.loadCustomEmoji());

  state.chatInput.addEventListener("keydown", event => {
    let md = document.querySelector("#mention-dropdown");
    if (md && md.classList.contains("show")) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        let items = md.querySelectorAll(".mention-item");
        let active = md.querySelector(".mention-item.active");
        let idx = Array.from(items).indexOf(active);
        if (active) active.classList.remove("active");
        idx = Math.min(idx + 1, items.length - 1);
        if (items[idx]) { items[idx].classList.add("active"); items[idx].scrollIntoView({block: "nearest"}); }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        let items = md.querySelectorAll(".mention-item");
        let active = md.querySelector(".mention-item.active");
        let idx = Array.from(items).indexOf(active);
        if (active) active.classList.remove("active");
        idx = Math.max(idx - 1, 0);
        if (items[idx]) { items[idx].classList.add("active"); items[idx].scrollIntoView({block: "nearest"}); }
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        let active = md.querySelector(".mention-item.active");
        if (active && active.dataset.name) insertMention(active.dataset.name);
        else hideMentionDropdown();
        return;
      }
      if (event.key === "Escape") { hideMentionDropdown(); event.preventDefault(); return; }
    }
    if (event.keyCode == 38) state.chatlog.scrollBy(0, -50);
    else if (event.keyCode == 40) state.chatlog.scrollBy(0, 50);
    else if (event.keyCode == 33) state.chatlog.scrollBy(0, -state.chatlog.clientHeight + 50);
    else if (event.keyCode == 34) state.chatlog.scrollBy(0, state.chatlog.clientHeight - 50);
  });

  state.chatInput.addEventListener("input", event => {
    if (event.currentTarget.value.length > 256) event.currentTarget.value = event.currentTarget.value.slice(0, 256);
    if (event.currentTarget.value.trim()) sendTyping();
    localStorage.setItem("chat_draft", event.currentTarget.value);
  });

  state.chatroom.addEventListener("submit", event => {
    event.preventDefault();
    if (state.currentWebSocket) {
      let text = state.chatInput.value;
      state.chatInput.value = "";
      // L27: // 转义——以 // 开头时去掉一个前导斜杠，按普通文本发送（如 //about → /about）
      if (text.startsWith("//")) text = text.slice(1);
      else if (text.startsWith("/")) { handleCommand(text); return; }
      let msg = {message: text, color: state.selectedColor, channel: state.currentChannel};
      if (state.replyTarget) { msg.reply = {name: state.replyTarget, text: state.replyText || "", id: state.replyId || ""}; cancelReply(); }
      if (/@(all|everyone|全体)/i.test(text)) msg.atAll = true;
      // 🕶️ 匿名马甲：开启时携带 anon 标志，服务端扣一张券后以「匿名」身份展示
      if (state.anonMode && localStorage.getItem("chat_token")) msg.anon = true;
      state.currentWebSocket.send(JSON.stringify(msg));
      localStorage.removeItem("chat_draft");
      state.chatlog.scrollBy(0, 1e8);
    }
  });

  document.getElementById("announcement-dismiss").addEventListener("click", () => {
    document.getElementById("announcement-banner").style.display = "none";
  });

  // 🕶️ 匿名发言开关：开启后下一条消息以「匿名」身份发送（服务端扣一张匿名券）
  let btnAnon = document.getElementById("btn-anon");
  if (btnAnon) {
    btnAnon.addEventListener("click", () => {
      if (!localStorage.getItem("chat_token")) {
        showToast("请先登录后再使用匿名发言", "warning");
        return;
      }
      state.anonMode = !state.anonMode;
      btnAnon.classList.toggle("active", state.anonMode);
      if (state.anonMode) {
        // 查询剩余券数（user-profile 公开返回）
        fetch("/api/user/profile?name=" + encodeURIComponent(state.username || ""))
          .then(r => r.json())
          .then(d => {
            let n = d && d.anonCoupons ? d.anonCoupons : 0;
            showToast("🕶️ 匿名模式已开启（剩余 " + n + " 张匿名券），下一条消息以「匿名」身份发送", "info", 3500);
          })
          .catch(() => showToast("🕶️ 匿名模式已开启，下一条消息以「匿名」身份发送", "info"));
      } else {
        showToast("匿名模式已关闭", "info");
      }
    });
  }

  state.chatlog.addEventListener("scroll", event => {
    let wasNotAtBottom = state.isAtBottom;
    state.isAtBottom = state.chatlog.scrollTop + state.chatlog.clientHeight >= state.chatlog.scrollHeight - 60;
    let sbBtn = document.querySelector("#scroll-bottom-btn");
    if (sbBtn) sbBtn.classList.toggle("show", !state.isAtBottom);
    if (!wasNotAtBottom && state.isAtBottom) state._newMsgDividerAdded = false;
  });

  document.querySelector("#scroll-bottom-btn").addEventListener("click", () => state.chatlog.scrollBy(0, 1e8));

  // Markdown toolbar
  let mdToolbar = document.getElementById("md-toolbar");
  mdToolbar.querySelectorAll(".md-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      let inp = state.chatInput;
      let start = inp.selectionStart, end = inp.selectionEnd;
      let wrap = btn.dataset.wrap || "";
      let suffix = btn.dataset.suffix || wrap;
      let text = inp.value;
      let selected = text.substring(start, end) || "text";
      inp.value = text.substring(0, start) + wrap + selected + suffix + text.substring(end);
      let newPos = start + wrap.length + (selected === "text" ? 0 : selected.length) + suffix.length;
      inp.setSelectionRange(newPos, newPos);
      inp.focus();
    });
  });

  state.chatInput.focus();
  let savedDraft = localStorage.getItem("chat_draft");
  if (savedDraft) { state.chatInput.value = savedDraft; state.chatInput.setSelectionRange(savedDraft.length, savedDraft.length); }

  document.body.addEventListener("click", event => {
    // 点击在弹窗/面板内时不抢焦点
    if (event.target.closest('#music-overlay, #settings-overlay, #shop-overlay, #task-overlay, #game-overlay, #lottery-overlay, #profile-modal, #dm-panel, #favorites-panel, #search-bar, #mention-dropdown, #more-menu-panel, #emoji-panel, .modal, .overlay, #hacknet-terminal, #hacknet-netmap')) return;
    if (window.getSelection().toString() == "") state.chatInput.focus();
  });

  if ('visualViewport' in window) {
    window.visualViewport.addEventListener('resize', function() {
      if (state.isAtBottom) state.chatlog.scrollBy(0, 1e8);
    });
  }

  // Roster toggle
  let rosterPanel = state.roster;
  let rosterToggle = document.querySelector("#roster-toggle");
  let rosterBackdrop = document.querySelector("#roster-backdrop");
  function hideRoster() { rosterPanel.classList.remove("show"); rosterBackdrop.classList.remove("show"); }
  rosterToggle.addEventListener("click", event => {
    event.stopPropagation();
    rosterPanel.classList.toggle("show");
    rosterBackdrop.classList.toggle("show");
  });
  rosterBackdrop.addEventListener("click", hideRoster);
  document.body.addEventListener("click", event => {
    if (!rosterPanel.contains(event.target) && !rosterToggle.contains(event.target)) hideRoster();
  });

  // 图片上传 + 粘贴发图 + AI 快捷按钮（image-upload.js）
  initImageUpload();

  // 语音消息（voice-record.js）
  initVoiceRecord();

  // Schedule
  document.querySelector("#schedule-btn").addEventListener("click", () => {
    let msg = prompt("输入定时发送的消息：");
    if (!msg || !msg.trim()) return;
    let minutes = prompt("多少分钟后发送？（1-10080，即7天内）", "5");
    if (!minutes || isNaN(minutes) || minutes < 1 || minutes > 10080) { showError(t("时间范围：1分钟 - 7天")); return; }
    let delayMs = parseInt(minutes) * 60 * 1000;
    if (state.currentWebSocket) {
      state.currentWebSocket.send(JSON.stringify({type: "schedule", message: msg.trim(), time: Date.now() + delayMs, channel: state.currentChannel}));
      showSuccess(t("消息已定时，将在 ") + minutes + t(" 分钟后发送"));
    }
  });

  // Poll
  document.querySelector("#poll-btn").addEventListener("click", () => {
    let question = prompt("输入投票问题：");
    if (!question || !question.trim()) return;
    let options = [];
    for (let i = 1; i <= 5; i++) {
      let opt = prompt("选项 " + i + t("（留空结束）："));
      if (!opt) break;
      options.push(opt.trim());
    }
    if (options.length < 2) { showError(t("投票至少需要2个选项")); return; }
    if (state.currentWebSocket) {
      state.currentWebSocket.send(JSON.stringify({type: "poll-create", question: question.trim(), options}));
      showSuccess(t("投票已创建"));
    }
  });

  // Files panel
  document.querySelector("#files-btn").addEventListener("click", () => {
    import('./filespanel.js').then(m => m.toggleFilesPanel());
  });

  // Keyword alerts
  document.querySelector("#kw-btn").addEventListener("click", () => {
    import('./keywords.js').then(m => m.showKeywordManager());
  });

  // 文件上传（file-upload.js）
  initFileUpload();
  // @提及 下拉（mention.js，键盘导航在 chatInput keydown 里复用其导出函数）
  initMention();

  // 表情面板（emoji-panel.js）
  initEmojiPanel();

  // More toggle - expand/collapse input toolbar
  let moreToggle = document.querySelector("#more-toggle-btn");
  let inputToolbar = document.querySelector("#input-toolbar-expanded");
  if (moreToggle && inputToolbar) {
    moreToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      inputToolbar.classList.toggle("show");
    });
    document.addEventListener("click", (e) => {
      if (!inputToolbar.contains(e.target) && e.target !== moreToggle) {
        inputToolbar.classList.remove("show");
      }
    });
  }

  // MD toggle button in expanded toolbar
  let mdToggleBtn = document.querySelector("#md-toggle-btn");
  let mdToolbarEl = document.querySelector("#md-toolbar");
  if (mdToggleBtn && mdToolbarEl) {
    mdToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      let isVisible = mdToolbarEl.style.display !== "none";
      mdToolbarEl.style.display = isVisible ? "none" : "flex";
      inputToolbar.classList.remove("show");
    });
  }

  // More menu panel
  let moreMenuBtn = document.querySelector("#more-menu-btn");
  let moreMenuPanel = document.querySelector("#more-menu-panel");
  let moreMenuBackdrop = document.querySelector("#more-menu-backdrop");
  if (moreMenuBtn && moreMenuPanel && moreMenuBackdrop) {
    function hideMoreMenu() {
      moreMenuPanel.classList.remove("show");
      moreMenuBackdrop.classList.remove("show");
    }
    moreMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      moreMenuPanel.classList.toggle("show");
      moreMenuBackdrop.classList.toggle("show");
    });
    moreMenuBackdrop.addEventListener("click", hideMoreMenu);
    moreMenuPanel.querySelectorAll(".more-menu-item").forEach(item => {
      item.addEventListener("click", () => {
        hideMoreMenu();
        let action = item.dataset.action;
        switch (action) {
          case "achievements":
            import('./achievements.js').then(m => m.toggleAchievementsPanel());
            break;
          case "favorites":
            import('./favorites.js').then(m => m.toggleFavoritesPanel());
            break;
          case "highlights":
            import('./highlights.js').then(m => m.showHighlightsPanel());
            break;
          case "room-info":
            import('./roominfo.js').then(m => m.toggleRoomInfo());
            break;
          case "scheduler":
            document.querySelector("#schedule-btn").click();
            break;
          case "changelog":
            window.open("/changelog", "_blank");
            break;
          case "archive":
            window.open("/archive", "_blank");
            break;
          case "export":
            import('./ui.js').then(m => m.exportChatLog());
            break;
        }
      });
    });
  }

  // Mobile bottom bar
  document.querySelector("#mbb-sound")?.addEventListener("click", () => {
    document.querySelector("#sound-toggle")?.click();
  });
  document.querySelector("#mbb-dark")?.addEventListener("click", () => {
    document.querySelector("#dark-toggle")?.click();
  });
  document.querySelector("#mbb-search")?.addEventListener("click", () => {
    document.querySelector("#search-toggle")?.click();
  });
  document.querySelector("#mbb-more")?.addEventListener("click", () => {
    moreMenuBtn?.click();
  });

  // Touch device hover support
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add("touch-device");
    state.chatlog.addEventListener("click", (e) => {
      let msg = e.target.closest(".chat-msg");
      if (!msg) return;
      let wasTouchHover = msg.classList.contains("touch-hover");
      state.chatlog.querySelectorAll(".chat-msg.touch-hover").forEach(el => el.classList.remove("touch-hover"));
      if (!wasTouchHover) msg.classList.add("touch-hover");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".chat-msg")) {
        state.chatlog.querySelectorAll(".chat-msg.touch-hover").forEach(el => el.classList.remove("touch-hover"));
      }
    });
  }

  join();
}