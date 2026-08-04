// startChat 核心初始化
import { state, t } from './state.js';
import { join } from './websocket.js';
import { handleCommand } from './commands.js';
import { addChatMessage } from './renderers.js';
import { sendTyping, cancelReply } from './ui.js';
import { showToast, showSuccess, showError, showInfo } from './state.js';

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

  // Image upload
  async function compressAndSendImage(file) {
    if (!file || !state.currentWebSocket) return;
    showUploadProgress(0, t("正在处理图片..."));
    let img = await createImageBitmap(file);
    let maxSize = 800;
    let w = img.width, h = img.height;
    if (w > maxSize || h > maxSize) {
      if (w > h) { h = h * maxSize / w; w = maxSize; }
      else { w = w * maxSize / h; h = maxSize; }
    }
    let canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    let ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    let base64 = canvas.toDataURL("image/jpeg", 0.7);
    img.close();
    let imgMsg = {type: "image", data: base64, channel: state.currentChannel};
    if (state.replyTarget) { imgMsg.reply = {name: state.replyTarget, text: state.replyText || "", id: state.replyId || ""}; cancelReply(); }
    state.currentWebSocket.send(JSON.stringify(imgMsg));
    hideUploadProgress();
  }

  // 🤖 AI 快捷按钮：一键在输入框插入 /ai 命令并聚焦
  let aiBtn = document.querySelector("#ai-btn");
  if (aiBtn) {
    aiBtn.addEventListener("click", () => {
      if (!state.chatInput) return;
      state.chatInput.focus();
      let cur = state.chatInput.value || "";
      if (cur.trim().startsWith("/ai")) {
        state.chatInput.setSelectionRange(state.chatInput.value.length, state.chatInput.value.length);
      } else {
        state.chatInput.value = "/ai ";
        state.chatInput.setSelectionRange(4, 4);
      }
    });
  }

  let imagePicker = document.querySelector("#image-picker");
  document.querySelector("#image-btn").addEventListener("click", () => imagePicker.click());
  imagePicker.addEventListener("change", async () => {
    let file = imagePicker.files[0];
    if (!file || !state.currentWebSocket) return;
    await compressAndSendImage(file);
    imagePicker.value = "";
  });

  // Voice message (语音消息)：长按/点击录音，松开发送
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStart = 0;
  let voiceTimer = null;
  let voiceBtn = document.querySelector("#voice-btn");
  let voiceStatus = document.createElement("div");
  voiceStatus.id = "voice-status";
  voiceStatus.style.cssText = "display:none;position:fixed;bottom:70px;left:16px;font-size:12px;color:#e74c3c;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 12px;z-index:30;";
  voiceStatus.textContent = t("正在录音... 点击 🎤 结束");
  document.body.appendChild(voiceStatus);

  function stopRecording(send) {
    if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
    if (!mediaRecorder || mediaRecorder.state === "inactive") { mediaRecorder = null; voiceStatus.style.display = "none"; return; }
    voiceBtn.classList.remove("recording");
    let mr = mediaRecorder;
    mediaRecorder = null;
    mr.onstop = () => {
      let duration = Math.round((Date.now() - recordingStart) / 1000);
      voiceStatus.style.display = "none";
      if (!send || recordedChunks.length === 0) { recordedChunks = []; return; }
      let blob = new Blob(recordedChunks, {type: mr.mimeType || "audio/webm"});
      recordedChunks = [];
      if (duration < 1) { showError(t("录音太短（至少 1 秒）")); return; }
      if (blob.size > 8 * 1024 * 1024) { showError(t("录音过长，请分段发送")); return; }
      let reader = new FileReader();
      reader.onload = () => {
        if (state.currentWebSocket) {
          let voiceMsg = {type: "voice", data: reader.result, duration, channel: state.currentChannel};
          if (state.replyTarget) { voiceMsg.reply = {name: state.replyTarget, text: state.replyText || "", id: state.replyId || ""}; cancelReply(); }
          state.currentWebSocket.send(JSON.stringify(voiceMsg));
        }
      };
      reader.readAsDataURL(blob);
    };
    try { mr.stop(); } catch (e) {}
  }

  voiceBtn.addEventListener("click", () => {
    if (!state.currentWebSocket) { showError(t("连接未就绪")); return; }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      stopRecording(true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showError(t("当前浏览器不支持录音")); return; }
    navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
      recordedChunks = [];
      let mimeType = "audio/webm;codecs=opus";
      if (typeof MediaRecorder === "undefined") { showError(t("当前浏览器不支持录音")); stream.getTracks().forEach(t => t.stop()); return; }
      let opts = MediaRecorder.isTypeSupported(mimeType) ? {mimeType} : undefined;
      mediaRecorder = new MediaRecorder(stream, opts);
      recordingStart = Date.now();
      mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); };
      mediaRecorder.start();
      voiceBtn.classList.add("recording");
      voiceStatus.style.display = "block";
      voiceTimer = setInterval(() => {
        let secs = Math.round((Date.now() - recordingStart) / 1000);
        voiceStatus.textContent = t("正在录音... ") + secs + "s " + t("(点击 🎤 结束)");
        if (secs >= 60) stopRecording(true); // 上限 60 秒
      }, 1000);
    }).catch(() => showError(t("麦克风权限被拒绝")));
  });

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

  // Paste image
  state.chatInput.addEventListener("paste", async (e) => {
    let items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        let file = item.getAsFile();
        if (file) await compressAndSendImage(file);
        break;
      }
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

  // File upload
  let filePicker = document.querySelector("#file-picker");
  document.querySelector("#file-btn").addEventListener("click", () => filePicker.click());

  function showUploadProgress(pct, statusText) {
    let bar = document.getElementById("upload-progress");
    let fill = document.getElementById("upload-progress-bar");
    let st = document.getElementById("upload-status");
    bar.style.display = "block";
    fill.style.width = Math.min(100, pct) + "%";
    st.style.display = "block";
    st.textContent = statusText || "";
  }
  function hideUploadProgress() {
    setTimeout(() => {
      document.getElementById("upload-progress").style.display = "none";
      document.getElementById("upload-status").style.display = "none";
    }, 500);
  }

  filePicker.addEventListener("change", async () => {
    let file = filePicker.files[0];
    if (!file || !state.currentWebSocket) return;
    if (file.size > 15 * 1024 * 1024) { showError(t("文件过大，上限 15MB")); filePicker.value = ""; return; }
    let reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) { let pct = Math.round((e.loaded / e.total) * 100); showUploadProgress(pct, t("正在读取文件... ") + pct + "%"); }
    };
    reader.onload = () => {
      showUploadProgress(100, t("正在上传..."));
      let fileMsg = {type: "file", data: reader.result, fileName: file.name, fileType: file.type || "application/octet-stream", fileSize: file.size, channel: state.currentChannel};
      if (state.replyTarget) { fileMsg.reply = {name: state.replyTarget, text: state.replyText || "", id: state.replyId || ""}; cancelReply(); }
      state.currentWebSocket.send(JSON.stringify(fileMsg));
      hideUploadProgress();
      filePicker.value = "";
    };
    reader.onerror = () => { showError(t("文件读取失败")); hideUploadProgress(); filePicker.value = ""; };
    reader.readAsDataURL(file);
  });

  // Mention dropdown
  let mentionDropdown = document.querySelector("#mention-dropdown");
  let mentionUsers = [];
  let mentionQuery = "";

  function showMentionDropdown(query) {
    mentionQuery = query;
    mentionUsers = [];
    state.roster.querySelectorAll("[data-name]").forEach(el => {
      let n = el.dataset.name;
      if (n && n.toLowerCase().includes(query.toLowerCase())) mentionUsers.push(n);
    });
    mentionUsers = [...new Set(mentionUsers)].filter(n => n !== state.username);
    if (mentionUsers.length === 0) { hideMentionDropdown(); return; }
    mentionDropdown.innerHTML = "";
    mentionUsers.forEach((name, i) => {
      let item = document.createElement("div");
      item.className = "mention-item" + (i === 0 ? " active" : "");
      item.dataset.name = name;
      let rosterEl = state.roster.querySelector('[data-name="' + name.replace(/["\\]/g, '') + '"]');
      let tagSpan = rosterEl ? rosterEl.querySelector(".tag") : null;
      if (tagSpan) { let clone = tagSpan.cloneNode(true); clone.style.position = "static"; clone.style.display = "inline-block"; item.appendChild(clone); }
      item.appendChild(document.createTextNode(" " + name));
      item.addEventListener("click", () => insertMention(name));
      item.addEventListener("mouseenter", () => { mentionDropdown.querySelectorAll(".active").forEach(a => a.classList.remove("active")); item.classList.add("active"); });
      mentionDropdown.appendChild(item);
    });
    mentionDropdown.classList.add("show");
  }

  function hideMentionDropdown() {
    mentionDropdown.classList.remove("show");
    mentionDropdown.innerHTML = "";
    mentionQuery = "";
  }

  function insertMention(name) {
    let val = state.chatInput.value;
    let pos = state.chatInput.selectionStart;
    let textBefore = val.substring(0, pos);
    let atIdx = textBefore.lastIndexOf("@");
    if (atIdx >= 0) {
      let beforeAt = val.substring(0, atIdx);
      let afterAt = val.substring(pos);
      state.chatInput.value = beforeAt + "@" + name + " " + afterAt;
      let newPos = (beforeAt + "@" + name + " ").length;
      state.chatInput.setSelectionRange(newPos, newPos);
    }
    hideMentionDropdown();
    state.chatInput.focus();
  }

  state.chatInput.addEventListener("input", () => {
    let val = state.chatInput.value;
    let pos = state.chatInput.selectionStart;
    let textBefore = val.substring(0, pos);
    let atIdx = textBefore.lastIndexOf("@");
    if (atIdx >= 0) {
      if (atIdx === 0 || /\s/.test(textBefore[atIdx - 1])) {
        let afterAt = textBefore.substring(atIdx + 1);
        if (!/\s/.test(afterAt) && afterAt.length <= 20) { showMentionDropdown(afterAt); return; }
      }
    }
    hideMentionDropdown();
  });

  // Emoji panel
  const EMOJIS = [
    "😀","😂","🤣","😃","😄","😅","😆","😉","😊","😋",
    "😎","😍","🥰","😘","🤗","🤩","🤔","🤨","😐","😑",
    "😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫",
    "😴","😌","😛","😜","😝","🤤","😒","😓","😔","😕",
    "🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢",
    "😭","😦","😧","😨","😩","🤯","😬","😰","😱","🥵",
    "🥶","😳","🤪","😵","😡","😠","🤬",
    "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👋","🤚",
    "✋","🖐️","🖖","👏","🙌","🤲","🤝","🙏","✍️","💪",
    "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💕",
    "💞","💓","💗","💖","💘","💝","💋","👀","🔥","⭐",
    "🎉","🎊","🎈","🎁","✨","🌟","💡","📌","✅","❌"
  ];
  let emojiPanel = document.querySelector("#emoji-panel");
  EMOJIS.forEach(e => {
    let span = document.createElement("span");
    span.className = "emoji-item";
    span.textContent = e;
    span.title = e;
    span.addEventListener("click", () => {
      if (state.currentWebSocket) { state.currentWebSocket.send(JSON.stringify({message: e, channel: state.currentChannel})); state.chatlog.scrollBy(0, 1e8); }
      emojiPanel.classList.remove("show");
    });
    emojiPanel.appendChild(span);
  });
  document.querySelector("#emoji-btn").addEventListener("click", event => { event.stopPropagation(); emojiPanel.classList.toggle("show"); });
  document.body.addEventListener("click", () => emojiPanel.classList.remove("show"), false);
  emojiPanel.addEventListener("click", event => event.stopPropagation());

  // 添加自定义表情到表情面板
  if (state.customEmoji) {
    let names = Object.keys(state.customEmoji);
    if (names.length > 0) {
      let divider = document.createElement("div");
      divider.style.cssText = "padding:4px 8px;font-size:11px;color:var(--text-secondary);border-top:1px solid var(--border);margin-top:4px;";
      divider.textContent = t("自定义");
      emojiPanel.appendChild(divider);
      names.forEach(name => {
        let span = document.createElement("span");
        span.className = "emoji-item";
        let img = document.createElement("img");
        img.src = state.customEmoji[name];
        img.style.cssText = "width:24px;height:24px;vertical-align:middle;object-fit:contain;";
        img.title = ":" + name + ":";
        span.appendChild(img);
        span.addEventListener("click", () => {
          if (state.currentWebSocket) {
            let inp = state.chatInput;
            let cursorPos = inp.selectionStart || inp.value.length;
            let textBefore = inp.value.substring(0, cursorPos);
            let textAfter = inp.value.substring(cursorPos);
            inp.value = textBefore + ":" + name + ":" + textAfter;
            inp.focus();
            inp.setSelectionRange(cursorPos + name.length + 2, cursorPos + name.length + 2);
          }
          emojiPanel.classList.remove("show");
        });
        emojiPanel.appendChild(span);
      });
    }
  }

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