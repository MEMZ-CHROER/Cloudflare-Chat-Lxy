// WebSocket 连接 + 消息调度
import { state, t } from './state.js';
import { addChatMessage, addChatImage, addChatFile, addChatVoice, addChatGhCard, renderPoll, formatTime, markdownToHtml, escapeHtml, updateRosterCount, applyRoomBackground, updatePointsDisplay, createColoredTag, attachSignature, resetMsgDate } from './renderers.js';
import { modifyOwnTag, playMsgSound, showTyping, flashTitle, checkAtMention, updateTitleUnread } from './ui.js';
import { showUserMenu } from './menu.js';
import { addToDMCache, updateDmBadge } from './dm.js';
import { TAG_COLORS, getVipLevel, createVipBadge } from './vip.js';
import { showWelcomeBanner } from './banner.js';
import { checkKeywords } from './keywords.js';
import { applyWaveEffect, applyCrashEffect } from './commands.js';
import { buildChannelBar, updateChannelBadges, renderChannelMessage, pushToChannelCache, bumpChannelUnread, updateCachedMessage } from './channels.js';

export function join() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();

  const wss = document.location.protocol === "http:" ? "ws://" : "wss://";
  let wsUrl = wss + state.hostname + "/api/room/" + state.roomname + "/websocket";
  if (state.roomPassword) wsUrl += "?password=" + encodeURIComponent(state.roomPassword);
  let ws = new WebSocket(wsUrl);
  let rejoined = false;
  let startTime = Date.now();

  let retryAttempt = 0;
  let rejoin = async () => {
    if (!rejoined) {
      rejoined = true;
      state.currentWebSocket = null;
      document.getElementById("reconnect-banner").classList.add("show");
      state.roster.querySelectorAll('[data-name]').forEach(el => el.remove());
      updateRosterCount();
      let delay = Math.min(1000 * Math.pow(2, retryAttempt), 60000);
      retryAttempt++;
      await new Promise(resolve => setTimeout(resolve, delay));
      join();
    }
  };

  ws.addEventListener("open", event => {
    retryAttempt = 0;
    state.currentWebSocket = ws;
    document.getElementById("reconnect-banner").classList.remove("show");
    applyRoomBackground(state.roomname);
    let msg = {name: state.username};
    let token = localStorage.getItem("chat_token");
    if (token) msg.token = token;
    ws.send(JSON.stringify(msg));
  });

  ws.addEventListener("message", event => {
    let data = JSON.parse(event.data);

    // 💥 房间销毁通知：服务端销毁房间时全员收到，直接跳首页（不依赖 CloseEvent.reason）
    if (data.type === "destroyed") {
      addChatMessage(null, t("* 房间已销毁，正在离开..."));
      setTimeout(() => document.location.href = "/", 500);
      return;
    }

    // 频道体系：频道列表 / 切换历史
    if (data.type === "channels") {
      state.channels = data.channels || state.channels;
      buildChannelBar();
      return;
    }
    if (data.type === "channel-history") {
      state.channels = data.channels || state.channels;
      buildChannelBar();
      if (data.channel !== state.currentChannel) return;
      state.chatlog.innerHTML = '<div id="spacer"></div>';
      state.lastSeenTimestamp = 0;
      resetMsgDate(); // 日期分组重新计数
      (data.messages || []).forEach(m => renderChannelMessage(m));
      state.chatlog.scrollBy(0, 1e8);
      state.channelUnread[data.channel] = 0;
      updateChannelBadges();
      return;
    }

    // 频道体系：跨频道 @全体 / @#频道 提醒 —— 即使不在该频道也能收到
    if (data.type === "channel-ping") {
      if (data.name && data.name !== state.username) {
        let fromCh = "#" + (data.fromChannel || "general");
        let text;
        if (data.targetChannel) {
          text = "📢 " + data.name + t(" 在 ") + fromCh + t(" 提到了 #") + data.targetChannel + t(" 频道");
        } else {
          text = "📢 " + data.name + t(" 在 ") + fromCh + t("  @了全体成员");
        }
        let banner = document.getElementById("announcement-banner");
        let textEl = document.getElementById("announcement-text");
        if (banner && textEl) { textEl.textContent = text; banner.style.display = "flex"; }
        flashTitle(text);
        if (state.unreadCount < 10) state.unreadCount += 3;
        updateTitleUnread();
        playMsgSound();
      }
      return;
    }

    if (data.error) {
      addChatMessage(null, t("* 错误: ") + data.error);
    } else if (data.system) {
      addChatMessage(null, "* " + data.system);
    } else if (data.joined) {
      console.log('[ws] joined msg:', data.joined, 'tag:', data.tag, 'color:', data.tagColor, 'border:', data.tagBorder);
      let p = document.createElement("p");
      p.dataset.name = data.joined;
      p.style.cursor = "pointer";
      p.title = t("点击操作");
      p.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(data.joined, e.clientX, e.clientY); });
      if (data.tag) {
        let badge = createColoredTag(data.tag, data.tagColor, data.tagBorder, false);
        p.appendChild(badge);
        let vb = createVipBadge(getVipLevel(data.tag));
        if (vb) p.appendChild(vb);
        p.appendChild(document.createTextNode(" " + data.joined));
      } else {
        p.textContent = data.joined;
      }
      state.roster.appendChild(p);
      if (state.wroteWelcomeMessages || data.joined === state.username) {
        let joinText = "* " + data.joined + t(" 进入了聊天室");
        if (data.tag) joinText = "* [" + data.tag + "]" + data.joined + t(" 进入了聊天室");
        addChatMessage(null, joinText);
        console.log('[banner] calling showWelcomeBanner', data.joined, data.tagColor, data.tagBorder);
        showWelcomeBanner(data.joined, data.tagColor, data.tagBorder);
      }
      updateRosterCount();
    } else if (data.quit) {
      for (let child of state.roster.children) {
        if ((child.dataset.name || child.innerText) == data.quit) { state.roster.removeChild(child); break; }
      }
      updateRosterCount();
    } else if (data.kicked) {
      for (let child of state.roster.children) {
        if ((child.dataset.name || child.innerText) == data.kicked) { state.roster.removeChild(child); break; }
      }
      addChatMessage(null, "* " + data.kicked + t(" 已被踢出房间"));
      updateRosterCount();
    } else if (data.ready) {
      if (!state.wroteWelcomeMessages) {
        state.wroteWelcomeMessages = true;
        updateRosterCount();
        updatePointsDisplay();
        addChatMessage(null, t("* 这是一个网页聊天室，无需注册即可畅聊。"));
        addChatMessage(null, t("* 提示: 聊天室参与者是互联网上的匿名用户，名称未经认证，任何人都可以使用相同名称，请仔细甄别信息；请勿随意相信陌生人的链接或与陌生人交易"));
        if (state.roomname.length == 64) addChatMessage(null, t("* 这是一个私人房间。你可以通过分享URL邀请他人加入。"));
        else addChatMessage(null, t("* 欢迎来到 #") + state.roomname + t(" 房间！打个招呼吧！"));
        state.chatlog.scrollBy(0, 1e8);
      }
    } else if (data.type === "schedule-confirm") {
      addChatMessage(null, t("* 定时消息已设置（ID: ") + data.id + "）");
    } else if (data.type === "schedule-cancel-confirm") {
      addChatMessage(null, t("* 定时消息已取消"));
    } else if (data.type === "poll") {
      renderPoll(data);
    } else if (data.type === "poll-update") {
      let pollEl = state.chatlog.querySelector('[data-poll-id="' + data.pollId + '"]');
      if (pollEl) {
        let resultsEl = pollEl.querySelector(".poll-results");
        if (resultsEl) {
          let total = data.totalVoters || 1;
          resultsEl.innerHTML = "";
          data.options.forEach(opt => {
            let pct = Math.round((opt.count / total) * 100);
            let row = document.createElement("div");
            row.className = "poll-option";
            row.innerHTML = '<span class="poll-opt-text">' + escapeHtml(opt.text) + '</span>'
              + '<span class="poll-opt-count">' + opt.count + '票</span>'
              + '<div class="poll-opt-bar-wrap"><div class="poll-opt-bar" style="width:' + pct + '%"></div></div>';
            resultsEl.appendChild(row);
          });
        }
      }
    } else if (data.type === "announcement") {
      let banner = document.getElementById("announcement-banner");
      let textEl = document.getElementById("announcement-text");
      if (data.text) { textEl.textContent = data.text; banner.style.display = "flex"; }
      else { banner.style.display = "none"; }
    } else if (data.type === "pinned") {
      let bar = document.getElementById("pinned-bar");
      let textEl = document.getElementById("pinned-text");
      let cancelBtn = document.getElementById("pinned-cancel");
      if (data.pinned) {
        textEl.textContent = data.pinned.name + ": " + data.pinned.text;
        bar.style.display = "flex";
        bar.onclick = () => {
          let el = state.chatlog.querySelector('[data-timestamp="' + data.pinned.timestamp + '"]');
          if (el) { el.scrollIntoView({behavior: "smooth", block: "center"}); el.classList.add("msg-ref-highlight"); setTimeout(() => el.classList.remove("msg-ref-highlight"), 2000); }
        };
        if (cancelBtn) {
          cancelBtn.style.display = document.cookie.indexOf("admin_logged=1") !== -1 ? "inline" : "none";
          cancelBtn.onclick = (e) => {
            e.stopPropagation();
            if (state.currentWebSocket) {
              state.currentWebSocket.send(JSON.stringify({type: "pin", unpin: true}));
              bar.style.display = "none";
            }
          };
        }
      } else {
        bar.style.display = "none";
      }
    } else if (data.type === "reaction-update") {
      let msgEl = state.chatlog.querySelector('[data-timestamp="' + data.msgTimestamp + '"]');
      if (!msgEl) return;
      let container = msgEl.querySelector(".reactions-container");
      if (!container) {
        container = document.createElement("div");
        container.className = "reactions-container";
        container.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;";
        msgEl.appendChild(container);
      }
      container.innerHTML = "";
      for (let [emoji, users] of Object.entries(data.reactions)) {
        if (!users || users.length === 0) continue;
        let chip = document.createElement("span");
        chip.className = "reaction-chip";
        chip.style.cssText = "display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:10px;font-size:12px;background:var(--bg);border:1px solid var(--border);cursor:pointer;user-select:none;";
        chip.textContent = emoji + " " + users.length;
        chip.dataset.reacted = users.includes(state.username) ? "1" : "0";
        if (chip.dataset.reacted === "1") chip.style.background = "var(--primary-alpha, rgba(74,108,247,0.1))";
        chip.title = users.join(", ");
        chip.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!state.currentWebSocket) return;
          let isReacted = chip.dataset.reacted === "1";
          state.currentWebSocket.send(JSON.stringify({type: "reaction", msgTimestamp: data.msgTimestamp, emoji, action: isReacted ? "remove" : "add"}));
        });
        container.appendChild(chip);
      }
    } else if (data.type === "image") {
      if (state.blockedUsers.has(data.name)) return;
      let imgCh = data.channel || "general";
      if (imgCh !== state.currentChannel) { pushToChannelCache(imgCh, data); bumpChannelUnread(imgCh); return; }
      if (data.timestamp > state.lastSeenTimestamp) {
        addChatImage(data.name, data.data, data.tag, data.tagColor, data.timestamp, data.tagBorder, data.reply, data.id, data.avatar);
        state.lastSeenTimestamp = data.timestamp;
        if (data.name !== state.username) playMsgSound();
        if (data.name && data.name !== state.username && document.hidden) { state.unreadCount++; updateTitleUnread(); }
      }
    } else if (data.type === "file") {
      if (state.blockedUsers.has(data.name)) return;
      let fileCh = data.channel || "general";
      if (fileCh !== state.currentChannel) { pushToChannelCache(fileCh, data); bumpChannelUnread(fileCh); return; }
      if (data.timestamp > state.lastSeenTimestamp) {
        addChatFile(data.name, data.data, data.fileName, data.fileSize, data.tag, data.tagColor, data.timestamp, data.tagBorder, data.reply, data.id, data.avatar);
        state.lastSeenTimestamp = data.timestamp;
        checkAtMention(data.fileName || "", data.name);
        if (data.name !== state.username) playMsgSound();
        if (data.name && data.name !== state.username && document.hidden) { state.unreadCount++; updateTitleUnread(); }
      }
    } else if (data.type === "voice") {
      if (state.blockedUsers.has(data.name)) return;
      let voiceCh = data.channel || "general";
      if (voiceCh !== state.currentChannel) { pushToChannelCache(voiceCh, data); bumpChannelUnread(voiceCh); return; }
      if (data.timestamp > state.lastSeenTimestamp) {
        addChatVoice(data.name, data.data, data.duration, data.tag, data.tagColor, data.timestamp, data.tagBorder, data.reply, data.id, data.avatar);
        state.lastSeenTimestamp = data.timestamp;
        if (data.name !== state.username) playMsgSound();
        if (data.name && data.name !== state.username && document.hidden) { state.unreadCount++; updateTitleUnread(); }
      }
    } else if (data.type === "gh-card") {
      if (state.blockedUsers.has(data.name)) return;
      let ghCh = data.channel || "general";
      if (ghCh !== state.currentChannel) { pushToChannelCache(ghCh, data); bumpChannelUnread(ghCh); return; }
      if (data.timestamp > state.lastSeenTimestamp) {
        addChatGhCard(data.name, data, data.tag, data.tagColor, data.timestamp, data.tagBorder, data.id, data.avatar);
        state.lastSeenTimestamp = data.timestamp;
        if (data.name !== state.username) playMsgSound();
        if (data.name && data.name !== state.username && document.hidden) { state.unreadCount++; updateTitleUnread(); }
      }
    } else if (data.type === "room-cleared") {
      addChatMessage(null, t("* 聊天记录已被管理员清空，即将刷新..."));
      setTimeout(() => document.location.reload(), 200);
    } else if (data.type === "highlights-update") {
      state._highlights = data.highlights || [];
    } else if (data.type === "scheduled-list") {
      if (typeof window._showScheduledList === "function") window._showScheduledList(data.list);
    } else if (data.type === "recalled") {
      if (data.timestamp) {
        let recalledMsgEl = state.chatlog.querySelector('[data-timestamp="' + data.timestamp + '"]');
        if (recalledMsgEl) {
          let bubble = recalledMsgEl.querySelector(".bubble");
          if (bubble) bubble.textContent = data.name === state.username ? "你撤回了一条消息" : t("消息已撤回");
          let extraBtns = recalledMsgEl.querySelectorAll(".reply-btn, .recall-btn");
          extraBtns.forEach(b => b.remove());
          recalledMsgEl.classList.add("recalled");
        } else if (data.channel) {
          // 跨频道缓存也标记撤回
          updateCachedMessage(data.channel, data.timestamp, m => { m.recalled = true; m.message = "消息已撤回"; });
        }
      }
    } else if (data.type === "edit") {
      let editEl = state.chatlog.querySelector('[data-msg-id="' + data.id + '"]');
      if (!editEl && data.channel) {
        // 跨频道缓存也同步编辑
        updateCachedMessage(data.channel, data.timestamp, m => { m.message = data.message; });
      }
      if (editEl && !editEl.classList.contains("recalled")) {
        let bubble = editEl.querySelector(".bubble");
        if (bubble) {
          bubble.innerHTML = markdownToHtml(data.message);
          bubble.querySelectorAll("pre").forEach(pre => {
            let copyBtn = document.createElement("button");
            copyBtn.className = "code-copy-btn";
            copyBtn.textContent = t("复制");
            pre.style.position = "relative";
            pre.appendChild(copyBtn);
          });
        }
      }
    } else if (data.type === "typing") {
      if (!data.channel || data.channel === state.currentChannel) {
        if (data.name && data.name !== state.username) showTyping(data.name);
      }
    } else if (data.type === "relay-new") {
      state.currentRelayId = data.relayId;
      addChatMessage(null, "* [接龙] 主题: " + data.topic + t(" (发起: ") + data.startedBy + ")");
    } else if (data.type === "relay-update") {
      addChatMessage(null, "* [#" + data.entry.number + "] " + data.entry.user + ": " + data.entry.content);
    } else if (data.type === "relay-ended") {
      addChatMessage(null, t("* [接龙结束] 共 ") + data.totalCount + t(" 条，由 ") + data.endedBy + t(" 结束"));
      state.currentRelayId = null;
    } else if (data.type === "relay-list-result") {
      if (data.relays && data.relays.length > 0) {
        addChatMessage(null, t("* 当前进行中的接龙:"));
        data.relays.forEach(r => addChatMessage(null, "*   [" + r.id.slice(0,8) + "] " + r.topic + " - " + r.entryCount + t("条 (发起: ") + r.startedBy + ")"));
      } else { addChatMessage(null, t("* 当前没有进行中的接龙")); }
    } else if (data.type === "effect") {
      if (data.effect === "wave") applyWaveEffect();
      else if (data.effect === "crash") applyCrashEffect();
    } else if (data.type === "redpacket") {
      if (data.action === "new") {
        // 新红包（按频道隔离）
        let rpCh = data.channel || "general";
        if (rpCh !== state.currentChannel) { pushToChannelCache(rpCh, data); bumpChannelUnread(rpCh); return; }
        let wrapper = document.createElement("p");
        wrapper.className = "chat-msg other";
        if (data.timestamp) wrapper.dataset.timestamp = data.timestamp;
        let header = document.createElement("span");
        header.className = "msg-header";
        if (data.tag) {
          let badge = document.createElement("span");
          badge.className = "tag";
          badge.textContent = data.tag;
          if (data.tagColor && TAG_COLORS[data.tagColor]) badge.style.backgroundColor = TAG_COLORS[data.tagColor];
          if (data.tagBorder && TAG_COLORS[data.tagBorder]) { badge.style.outline = "2px solid " + TAG_COLORS[data.tagBorder]; badge.style.outlineOffset = "-1px"; }
          header.appendChild(badge);
        }
        header.appendChild(document.createTextNode(" " + (data.creator || "?")));
        wrapper.appendChild(header);
        let bubble = document.createElement("span");
        bubble.className = "bubble redpacket-bubble";
        let modeText = data.mode === "fixed" ? "固定金额" : t("拼手气");
        bubble.innerHTML = '<span style="font-size:28px">🧧</span>' +
          '<div style="font-size:14px;font-weight:700;margin:4px 0">红包</div>' +
          '<div style="font-size:12px;color:#888">' + escapeHtml(data.creator) + t(' 发了 ') + modeText + ' 红包</div>' +
          '<div style="font-size:13px;color:#e74c3c;font-weight:700;margin:4px 0">💰 ' + data.total + t(' 积分 · ') + data.count + ' 份</div>' +
          '<button class="rp-grab-btn" data-rp-id="' + data.id + '" style="padding:6px 20px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">开</button>';
        bubble.querySelector(".rp-grab-btn").addEventListener("click", function() {
          if (state.currentWebSocket) {
            state.currentWebSocket.send(JSON.stringify({type: "redpacket", action: "grab", id: data.id}));
            this.textContent = t("已抢");
            this.disabled = true;
            this.style.opacity = "0.6";
          }
        });
        wrapper.appendChild(bubble);
        if (data.timestamp) {
          let ts = document.createElement("span");
          ts.className = "msg-time";
          ts.textContent = formatTime(data.timestamp);
          wrapper.appendChild(ts);
        }
        state.chatlog.appendChild(wrapper);
        state.chatlog.scrollBy(0, 1e8);
        playMsgSound();
      } else if (data.action === "grabbed") {
        // 更新红包按钮状态
        let btns = state.chatlog.querySelectorAll('.rp-grab-btn[data-rp-id="' + data.id + '"]');
        btns.forEach(btn => {
          if (btn.dataset.rpGrabbed) return;
          if (data.remainingCount <= 0) {
            btn.textContent = t("已抢完");
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.style.background = "#999";
          }
        });
        if (data.user === state.username) {
          addChatMessage(null, "* 🧧 你抢到了 " + data.amount + " 积分" + (data.isFinished ? "（红包已抢完）" : ""));
        }
        playMsgSound();
      } else if (data.action === "info") {
        // 查询结果
      }
    } else if (data.type === "zifu") {
      let zifuCh = data.channel || "general";
      if (zifuCh !== state.currentChannel) { pushToChannelCache(zifuCh, data); bumpChannelUnread(zifuCh); return; }
      if (data.timestamp > state.lastSeenTimestamp) {
        let wrapper = document.createElement("p");
        wrapper.className = "chat-msg other";
        let header = document.createElement("span");
        header.className = "msg-header";
        if (data.tag) {
          let badge = document.createElement("span");
          badge.className = "tag";
          badge.textContent = data.tag;
          if (data.tagColor && TAG_COLORS[data.tagColor]) badge.style.backgroundColor = TAG_COLORS[data.tagColor];
          if (data.tagBorder && TAG_COLORS[data.tagBorder]) { badge.style.outline = "2px solid " + TAG_COLORS[data.tagBorder]; badge.style.outlineOffset = "-1px"; }
          header.appendChild(badge);
        }
        header.appendChild(document.createTextNode(" " + (data.name || "BOT")));
        wrapper.appendChild(header);
        let bubble = document.createElement("span");
        bubble.className = "bubble";
        bubble.style.fontFamily = "'Courier New', Consolas, 'Liberation Mono', monospace";
        bubble.style.fontSize = "11px";
        bubble.style.lineHeight = "1.15";
        bubble.style.whiteSpace = "pre";
        bubble.style.maxWidth = "none";
        bubble.textContent = data.message;
        wrapper.appendChild(bubble);
        if (data.timestamp) {
          let ts = document.createElement("span");
          ts.className = "msg-time";
          ts.textContent = formatTime(data.timestamp);
          wrapper.appendChild(ts);
        }
        state.chatlog.appendChild(wrapper);
        state.chatlog.scrollBy(0, 1e8);
        state.lastSeenTimestamp = data.timestamp;
      }
    } else if (data.type === "tag-update") {
      for (let child of state.roster.children) {
        if ((child.dataset.name || child.innerText) == data.name) {
          let ptsBadge = child.querySelector(".points-badge");
          let ptsText = ptsBadge ? ptsBadge.textContent : null;
          child.innerHTML = "";
          child.dataset.name = data.name;
          if (data.tag) {
            let badge = document.createElement("span");
            badge.className = "tag";
            badge.textContent = data.tag;
            if (data.tagColor && TAG_COLORS[data.tagColor]) badge.style.backgroundColor = TAG_COLORS[data.tagColor];
            if (data.tagBorder && TAG_COLORS[data.tagBorder]) { badge.style.outline = "2px solid " + TAG_COLORS[data.tagBorder]; badge.style.outlineOffset = "-1px"; }
            child.appendChild(badge);
            let vb = createVipBadge(getVipLevel(data.tag));
            if (vb) child.appendChild(vb);
            child.appendChild(document.createTextNode(" " + data.name));
          } else {
            child.textContent = data.name;
          }
          if (ptsText !== null) {
            let badge = document.createElement("span");
            badge.className = "points-badge";
            badge.textContent = ptsText;
            child.appendChild(badge);
          }
          break;
        }
      }
    } else if (data.type === "whisper") {
      if (data.to) {
        addChatMessage(null, "* 私聊给 " + data.to + ": " + data.message);
      } else {
        if (state.blockedUsers.has(data.from)) return;
        addToDMCache(data.from, {from: data.from, message: data.message, timestamp: data.timestamp}, false);
        if (state.dmTarget !== data.from) {
          state.dmUnread++;
          if (state.dmUnreadTimer) clearTimeout(state.dmUnreadTimer);
          state.dmUnreadTimer = setTimeout(() => { state.dmUnreadTimer = null; updateDmBadge(); }, 100);
          updateDmBadge();
          flashTitle("💬 " + data.from + t(" 发来私信"));
        }
        let wrapper = document.createElement("p");
        wrapper.className = "chat-msg other whisper";
        wrapper.innerHTML = '<span class="msg-header"><span class="username" style="cursor:pointer"></span></span><span class="bubble">🔒 </span>';
        wrapper.querySelector(".username").textContent = data.from;
        wrapper.querySelector(".bubble").textContent = "🔒 " + data.message;
        wrapper.querySelector(".username").addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(data.from, e.clientX, e.clientY); });
        attachSignature(wrapper.querySelector(".username"), data.from); // 个人签名：私聊消息旁展示 + 悬停
        if (data.timestamp) {
          let ts = document.createElement("span");
          ts.className = "msg-time";
          ts.textContent = formatTime(data.timestamp);
          wrapper.appendChild(ts);
        }
        state.chatlog.appendChild(wrapper);
        state.chatlog.scrollBy(0, 1e8);
        playMsgSound();
      }
    } else {
      if (state.blockedUsers.has(data.name)) return;
      if (data.timestamp > state.lastSeenTimestamp) {
        if (!state.isAtBottom && !state._newMsgDividerAdded) {
          state._newMsgDividerAdded = true;
          let div = document.createElement("div");
          div.className = "new-msg-divider";
          div.style.cssText = "text-align:center;font-size:11px;color:var(--text-secondary);padding:4px 0;user-select:none;border-top:1px solid var(--primary);margin:6px 0;";
          div.textContent = t("─ 以下是新消息 ─");
          state.chatlog.appendChild(div);
        }
        checkKeywords(data.message, data.name);
        // 日期分组由 renderers.addChatMessage 统一处理
        // 频道体系：非当前频道消息入缓存，不渲染
        let txtCh = data.channel || "general";
        if (txtCh !== state.currentChannel) { pushToChannelCache(txtCh, data); bumpChannelUnread(txtCh); return; }
        addChatMessage(data.name, data.message, data.tag, data.tagColor, data.color, data.timestamp, data.reply, data.tagBorder, data.id, data.atAll, data.avatar);
        state.lastSeenTimestamp = data.timestamp;
        if (data.atAll && data.name !== state.username) {
          let banner = document.getElementById("announcement-banner");
          let textEl = document.getElementById("announcement-text");
          if (banner && textEl) { textEl.textContent = "📢 @" + data.name + t("  @了全体成员"); banner.style.display = "flex"; }
          flashTitle("📢 " + data.name + t("  @了全体成员"));
          if (state.unreadCount < 10) state.unreadCount += 3;
          updateTitleUnread();
        }
        if (!data.name || data.name !== state.username) playMsgSound();
        if (data.name && data.name !== state.username && document.hidden) { state.unreadCount++; updateTitleUnread(); }
      }
    }
  });

  ws.addEventListener("close", event => {
    if (event.reason === "kicked") { addChatMessage(null, t("* 你已被踢出房间，即将刷新页面...")); setTimeout(() => document.location.reload(), 200); return; }
    if (event.reason === "destroyed") { addChatMessage(null, t("* 房间已销毁，正在离开...")); setTimeout(() => document.location.href = "/", 500); return; }
    rejoin();
  });
  ws.addEventListener("error", event => {
    if (event.reason === "kicked") { addChatMessage(null, t("* 你已被踢出房间，即将刷新页面...")); setTimeout(() => document.location.reload(), 200); return; }
    if (event.reason === "destroyed") { addChatMessage(null, t("* 房间已销毁，正在离开...")); setTimeout(() => document.location.href = "/", 500); return; }
    rejoin();
  });
}

