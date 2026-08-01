// 消息渲染 - addChatMessage, addChatImage, addChatFile, 投票, markdown 等
import { state } from './state.js';
import { TAG_COLORS, getVipLevel, createVipBadge } from './vip.js';
import { modifyOwnTag, startReply, recallMessage, checkAtMention, showLightbox } from './ui.js';
import { showUserMenu } from './menu.js';
import { isFavorited, toggleFavorite } from './favorites.js';
import { showToast, showSuccess, showError, showInfo } from './state.js';

// 防止 DOM 无限增长：超过 500 条消息时移除最早的
const MAX_VISIBLE_MSGS = 500;
function trimChatlog() {
  while (state.chatlog.childElementCount > MAX_VISIBLE_MSGS) {
    let el = state.chatlog.firstElementChild;
    if (el) state.chatlog.removeChild(el);
  }
}

// URL 预览缓存，避免同 URL 重复请求
const urlPreviewCache = new Map();

function renderPreviewCard(wrapper, data, previewUrl) {
  let card = document.createElement("div");
  card.className = "url-preview";
  card.style.cssText = "margin-top:4px;padding:6px 10px;border-radius:6px;background:var(--bg);border-left:3px solid var(--primary);font-size:12px;cursor:pointer;";
  card.innerHTML = '<div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);">' + escapeHtml(data.title) + '</div>' +
    (data.description ? '<div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">' + escapeHtml(data.description) + '</div>' : '') +
    '<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(previewUrl) + '</div>';
  card.addEventListener("click", (e) => { e.stopPropagation(); window.open(previewUrl, "_blank"); });
  wrapper.appendChild(card);
}

// 彩色标签解析 [color]text
const TAG_COLOR_MAP = {
  red: "#e74c3c", blue: "#3498db", green: "#2ecc71",
  purple: "#9b59b6", pink: "#e91e63", cyan: "#00bcd4",
  gray: "#95a5a6", orange: "#e67e22", yellow: "#ffc107",
  teal: "#009688", indigo: "#3f51b5", brown: "#795548",
  lime: "#cddc39", deeporange: "#ff5722"
};

export function createColoredTag(tag, tagColor, tagBorder, isSelf) {
  let badge = document.createElement("span");
  badge.className = "tag";
  let defaultBg = (tagColor && TAG_COLORS[tagColor]) ? TAG_COLORS[tagColor] : "";
  let borderColor = (tagBorder && TAG_COLORS[tagBorder]) ? TAG_COLORS[tagBorder] : "";

  let segs = [];
  let remaining = tag;
  let colorRegex = /^\[(\w+)\]/;
  while (remaining.length > 0) {
    let m = remaining.match(colorRegex);
    if (m) {
      let c = m[1].toLowerCase();
      remaining = remaining.slice(m[0].length);
      let nextBracket = remaining.search(/\[/);
      let text = nextBracket >= 0 ? remaining.slice(0, nextBracket) : remaining;
      remaining = nextBracket >= 0 ? remaining.slice(nextBracket) : "";
      if (text) segs.push({color: c, text});
    } else {
      segs.push({color: "", text: remaining});
      remaining = "";
    }
  }

  if (segs.length > 1) {
    // Clear default tag padding/background, use flex for seamless segments
    badge.style.padding = "0";
    badge.style.display = "inline-flex";
    badge.style.overflow = "hidden";
    badge.style.backgroundColor = defaultBg || "transparent";
    if (borderColor) { badge.style.outline = "2px solid " + borderColor; badge.style.outlineOffset = "-1px"; }

    segs.forEach((s, i) => {
      let span = document.createElement("span");
      span.textContent = s.text;
      span.style.padding = "1px 3px";
      span.style.display = "inline-block";
      span.style.color = "#fff";
      span.style.fontSize = "10px";
      span.style.fontWeight = "600";
      if (s.color && TAG_COLOR_MAP[s.color]) {
        span.style.backgroundColor = TAG_COLOR_MAP[s.color];
      } else {
        span.style.backgroundColor = defaultBg || "#888";
      }
      if (i === 0) span.style.borderRadius = "3px 0 0 3px";
      else if (i === segs.length - 1) span.style.borderRadius = "0 3px 3px 0";
      badge.appendChild(span);
    });

    if (isSelf) {
      badge.style.cursor = "pointer";
      badge.title = t("点击修改标签");
      badge.addEventListener("click", (e) => { e.stopPropagation(); modifyOwnTag(tag, tagColor); });
    }
    return badge;
  }

  // Simple tag
  badge.textContent = tag;
  if (defaultBg) badge.style.backgroundColor = defaultBg;
  if (borderColor) { badge.style.outline = "2px solid " + borderColor; badge.style.outlineOffset = "-1px"; }
  if (isSelf) {
    badge.style.cursor = "pointer";
    badge.title = t("点击修改标签");
    badge.addEventListener("click", (e) => { e.stopPropagation(); modifyOwnTag(tag, tagColor); });
  }
  return badge;
}

// 消息已读观察器
let _readObsInited = false;
function initReadObserver() {
  if (_readObsInited || !('IntersectionObserver' in window)) return;
  _readObsInited = true;
  window._readObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.target.dataset.read !== "1") {
        entry.target.dataset.read = "1";
        let indicator = entry.target.querySelector(".read-indicator");
        if (indicator) indicator.textContent = "✓";
      }
    });
  }, {threshold: 0.5});
}

export function formatTime(ts) {
  if (!ts) return "";
  let d = new Date(ts);
  return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

export function escapeHtml(str) {
  let div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function markdownToHtml(text) {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return '<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + code + '</code></pre>';
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // LaTeX: display math $$...$$ (before inline to avoid $$ being matched as two $...$)
  if (typeof katex !== 'undefined') {
    html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
      try { return katex.renderToString(tex.trim(), {displayMode: true, throwOnError: false}); }
      catch(e) { return '$$' + tex + '$$'; }
    });
    html = html.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      try { return katex.renderToString(tex.trim(), {displayMode: false, throwOnError: false}); }
      catch(e) { return '$' + tex + '$'; }
    });
  }
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(\s|^)\*([^*\s][^*]*?)\*(\s|$)/g, '$1<em>$2</em>$3');
  html = html.replace(/https?:\/\/[^\s<"]+/g, '<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>');
  html = html.replace(/@([\w一-鿿\-_]+)/g, '<span class="mention" data-mention="$1">@$1</span>');
  // Custom emoji :name:
  if (state.customEmoji) {
    html = html.replace(/:([a-zA-Z0-9_一-鿿]+):/g, (match, name) => {
      let dataUrl = state.customEmoji[name];
      if (dataUrl) {
        // 🔒 安全修复（LD6）：图片 src 一并转义引号，防属性逃逸注入 on* 事件
        return '<img src="' + dataUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '" class="custom-emoji" alt=":' + escapeHtml(name) + ':" title=":' + escapeHtml(name) + ':" style="width:20px;height:20px;vertical-align:middle;display:inline-block;object-fit:contain;">';
      }
      return match;
    });
  }
  return html;
}

export async function loadCustomEmoji() {
  try {
    let r = await fetch("/api/emoji/list");
    let data = await r.json();
    state.customEmoji = data;
  } catch (e) {
    state.customEmoji = {};
  }
}

export function renderPoll(data) {
  if (!data || !data.question) return;
  let wrapper = document.createElement("p");
  wrapper.className = "chat-msg other";
  wrapper.dataset.pollId = data.pollId;
  wrapper.dataset.timestamp = data.timestamp || 0;
  let header = document.createElement("span");
  header.className = "msg-header";
  let creatorBadge = document.createElement("span");
  creatorBadge.className = "tag";
  creatorBadge.textContent = t("投票");
  creatorBadge.style.backgroundColor = "#9b59b6";
  header.appendChild(creatorBadge);
  header.appendChild(document.createTextNode(" " + (data.creator || "")));
  wrapper.appendChild(header);
  let question = document.createElement("div");
  question.className = "poll-question";
  question.textContent = data.question;
  wrapper.appendChild(question);
  let results = document.createElement("div");
  results.className = "poll-results";
  data.options.forEach((opt, i) => {
    let row = document.createElement("div");
    row.className = "poll-option";
    row.style.cursor = "pointer";
    row.dataset.pollId = data.pollId;
    row.dataset.optIndex = i;
    row.innerHTML = '<span class="poll-opt-text">' + escapeHtml(opt.text) + '</span>';
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.currentWebSocket) state.currentWebSocket.send(JSON.stringify({type: "poll-vote", pollId: data.pollId, optionIndex: i}));
    });
    results.appendChild(row);
  });
  wrapper.appendChild(results);
  if (data.timestamp) {
    let ts = document.createElement("span");
    ts.className = "msg-time";
    ts.textContent = formatTime(data.timestamp);
    wrapper.appendChild(ts);
  }
  trimChatlog();
  state.chatlog.appendChild(wrapper);
  state.chatlog.scrollBy(0, 1e8);
}

export function addChatMessage(name, text, tag, tagColor, msgColor, timestamp, reply, tagBorder, msgId, atAll, avatar) {
  if (!name) {
    let p = document.createElement("p");
    p.className = "system-msg";
    p.textContent = text;
    trimChatlog();
    state.chatlog.appendChild(p);
    state.chatlog.scrollBy(0, 1e8);
    return;
  }
  let isSelf = name === state.username;
  let wrapper = document.createElement("p");
  wrapper.className = "chat-msg" + (isSelf ? " self" : " other");
  if (timestamp) wrapper.dataset.timestamp = timestamp;
  wrapper.dataset.msgName = name || "";
  if (msgId) wrapper.dataset.msgId = msgId;
  if (atAll) wrapper.classList.add("ping-all");
  let header = document.createElement("span");
  header.className = "msg-header";
  if (tag) {
    let badge = createColoredTag(tag, tagColor, tagBorder, isSelf);
    header.appendChild(badge);
    let cleanTag = tag.replace(/\[\w+\]/g, "");
    let vb = createVipBadge(getVipLevel(cleanTag));
    if (vb) header.appendChild(vb);
  }
  if (avatar) {
    let av = document.createElement("img");
    av.className = "msg-avatar";
    av.src = avatar;
    av.alt = "";
    av.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
    wrapper.appendChild(av);
  }
  if (!isSelf) {
    let nameSpan = document.createElement("span");
    nameSpan.className = "username";
    nameSpan.textContent = name;
    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
    header.appendChild(nameSpan);
  }
  wrapper.appendChild(header);
  if (reply) {
    let quote = document.createElement("div");
    quote.className = "reply-quote";
    quote.style.cursor = "pointer";
    let replyLabel = document.createTextNode("回复 @" + (reply.name || "") + ": ");
    quote.appendChild(replyLabel);
    let replyContent = document.createElement("span");
    replyContent.textContent = reply.text || "";
    quote.appendChild(replyContent);
    quote.title = t("点击跳转到原文");
    quote.addEventListener("click", (e) => {
      e.stopPropagation();
      let msgEls = state.chatlog.querySelectorAll(".chat-msg");
      for (let el of msgEls) {
        let nameEl = el.querySelector(".username");
        if (nameEl && nameEl.textContent === reply.name) {
          let bubble = el.querySelector(".bubble");
          if (bubble && bubble.textContent.includes(reply.text || "")) {
            el.scrollIntoView({behavior: "smooth", block: "center"});
            el.classList.add("msg-ref-highlight");
            setTimeout(() => el.classList.remove("msg-ref-highlight"), 2000);
            return;
          }
        }
      }
      showError(t("未找到引用的原始消息（可能已被清除）"));
    });
    wrapper.appendChild(quote);
  }
  let bubble = document.createElement("span");
  bubble.className = "bubble";
  if (msgColor && msgColor !== "#000000") bubble.style.color = msgColor;
  bubble.innerHTML = markdownToHtml(text);
  bubble.querySelectorAll("pre").forEach(pre => {
    let copyBtn = document.createElement("button");
    copyBtn.className = "code-copy-btn";
    copyBtn.textContent = t("复制");
    pre.style.position = "relative";
    pre.appendChild(copyBtn);
  });
  if (typeof hljs !== "undefined") bubble.querySelectorAll("pre code").forEach(el => hljs.highlightElement(el));
  bubble.classList.add("copyable");
  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      let toast = document.createElement("span");
      toast.className = "copy-toast";
      toast.textContent = t("已复制");
      bubble.appendChild(toast);
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 1200);
    }).catch(() => {});
  });
  checkAtMention(text, name);
  wrapper.appendChild(bubble);
  let urlMatch = text.match(/https?:\/\/[^\s<"']+/);
  if (urlMatch && name !== state.username) {
    let previewUrl = urlMatch[0];
    if (urlPreviewCache.has(previewUrl)) {
      let cached = urlPreviewCache.get(previewUrl);
      if (cached) renderPreviewCard(wrapper, cached, previewUrl);
    } else {
      fetch("/api/preview?url=" + encodeURIComponent(previewUrl)).then(r => r.json()).then(data => {
      if (data && data.title) {
        urlPreviewCache.set(previewUrl, data);
        renderPreviewCard(wrapper, data, previewUrl);
      } else {
        urlPreviewCache.set(previewUrl, null);
      }
    }).catch(() => { urlPreviewCache.set(previewUrl, null); });
    }
  }
  buildActionMenu(wrapper, {
    name, text, timestamp, msgId, tag, tagColor, tagBorder,
    isSelf,
    isAdmin: document.cookie.indexOf("admin_logged=1") !== -1,
    hasWs: !!state.currentWebSocket,
    roomname: state.roomname
  });
  if (timestamp) {
    let timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = formatTime(timestamp);
    wrapper.appendChild(timeSpan);
  }
  if (isSelf) {
    initReadObserver();
    let ri = document.createElement("span");
    ri.className = "read-indicator";
    ri.textContent = "";
    ri.style.cssText = "font-size:10px;color:#888;margin-left:4px;vertical-align:middle;user-select:none;";
    wrapper.appendChild(ri);
  }
  trimChatlog();
  state.chatlog.appendChild(wrapper);
  if (window._readObserver) window._readObserver.observe(wrapper);
  if (!isSelf && name && timestamp && name !== "AI" && name !== "Bot") {
    let prev = wrapper.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains("chat-msg") && prev.dataset.msgName === name) wrapper.classList.add("grouped");
  }
  state.chatlog.scrollBy(0, 1e8);
}

export function addChatImage(name, data, tag, tagColor, timestamp, tagBorder, reply, msgId, avatar) {
  if (!name) return;
  let isSelf = name === state.username;
  let wrapper = document.createElement("p");
  wrapper.className = "chat-msg" + (isSelf ? " self" : " other");
  if (timestamp) wrapper.dataset.timestamp = timestamp;
  wrapper.dataset.msgName = name || "";
  if (msgId) wrapper.dataset.msgId = msgId;
  let header = document.createElement("span");
  header.className = "msg-header";
  if (tag) {
    let badge = createColoredTag(tag, tagColor, tagBorder, isSelf);
    header.appendChild(badge);
    let cleanTag = tag.replace(/\[\w+\]/g, "");
    let vb = createVipBadge(getVipLevel(cleanTag));
    if (vb) header.appendChild(vb);
  }
  if (avatar) {
    let av = document.createElement("img");
    av.className = "msg-avatar";
    av.src = avatar;
    av.alt = "";
    av.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
    wrapper.appendChild(av);
  }
  if (!isSelf) {
    let nameSpan = document.createElement("span");
    nameSpan.className = "username";
    nameSpan.textContent = name;
    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
    header.appendChild(nameSpan);
  }
  wrapper.appendChild(header);
  if (reply) {
    let quote = document.createElement("div");
    quote.className = "reply-quote";
    quote.style.cursor = "pointer";
    let replyLabel = document.createTextNode("回复 @" + (reply.name || "") + ": ");
    quote.appendChild(replyLabel);
    let replyContent = document.createElement("span");
    replyContent.textContent = reply.text || "";
    quote.appendChild(replyContent);
    quote.title = t("点击跳转到原文");
    quote.addEventListener("click", (e) => {
      e.stopPropagation();
      let msgEls = state.chatlog.querySelectorAll(".chat-msg");
      for (let el of msgEls) {
        let nameEl = el.querySelector(".username");
        if (nameEl && nameEl.textContent === reply.name) {
          let bubble = el.querySelector(".bubble");
          if (bubble && bubble.textContent.includes(reply.text || "")) {
            el.scrollIntoView({behavior: "smooth", block: "center"});
            el.classList.add("msg-ref-highlight");
            setTimeout(() => el.classList.remove("msg-ref-highlight"), 2000);
            return;
          }
        }
      }
      showError(t("未找到引用的原始消息（可能已被清除）"));
    });
    wrapper.appendChild(quote);
  }
  let bubble = document.createElement("span");
  bubble.className = "bubble";
  if (!data) {
    bubble.textContent = t("[图片已过期]");
    bubble.style.cssText = "color:var(--text-secondary);font-size:85%;font-style:italic;";
  } else {
    let img = document.createElement("img");
    img.src = data;
    img.alt = t("图片");
    img.style.cursor = "pointer";
    img.addEventListener("click", () => showLightbox(data));
    bubble.appendChild(img);
  }
  wrapper.appendChild(bubble);
  buildActionMenu(wrapper, {
    name, text: t("[图片]"), timestamp, msgId, tag, tagColor, tagBorder,
    isSelf,
    isAdmin: document.cookie.indexOf("admin_logged=1") !== -1,
    hasWs: !!state.currentWebSocket,
    roomname: state.roomname
  });
  if (timestamp) {
    let timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = formatTime(timestamp);
    wrapper.appendChild(timeSpan);
  }
  trimChatlog();
  state.chatlog.appendChild(wrapper);
  state.chatlog.scrollBy(0, 1e8);
}

export function addChatFile(name, data, fileName, fileSize, tag, tagColor, timestamp, tagBorder, reply, msgId, avatar) {
  if (!name) return;
  let isSelf = name === state.username;
  let wrapper = document.createElement("p");
  wrapper.className = "chat-msg" + (isSelf ? " self" : " other");
  if (timestamp) wrapper.dataset.timestamp = timestamp;
  wrapper.dataset.msgName = name || "";
  if (msgId) wrapper.dataset.msgId = msgId;
  let header = document.createElement("span");
  header.className = "msg-header";
  if (tag) {
    let badge = createColoredTag(tag, tagColor, tagBorder, isSelf);
    header.appendChild(badge);
    let cleanTag = tag.replace(/\[\w+\]/g, "");
    let vb = createVipBadge(getVipLevel(cleanTag));
    if (vb) header.appendChild(vb);
  }
  if (avatar) {
    let av = document.createElement("img");
    av.className = "msg-avatar";
    av.src = avatar;
    av.alt = "";
    av.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
    wrapper.appendChild(av);
  }
  if (!isSelf) {
    let nameSpan = document.createElement("span");
    nameSpan.className = "username";
    nameSpan.textContent = name;
    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
    header.appendChild(nameSpan);
  }
  wrapper.appendChild(header);
  if (reply) {
    let quote = document.createElement("div");
    quote.className = "reply-quote";
    quote.style.cursor = "pointer";
    let replyLabel = document.createTextNode("回复 @" + (reply.name || "") + ": ");
    quote.appendChild(replyLabel);
    let replyContent = document.createElement("span");
    replyContent.textContent = reply.text || "";
    quote.appendChild(replyContent);
    quote.title = t("点击跳转到原文");
    quote.addEventListener("click", (e) => {
      e.stopPropagation();
      let msgEls = state.chatlog.querySelectorAll(".chat-msg");
      for (let el of msgEls) {
        let nameEl = el.querySelector(".username");
        if (nameEl && nameEl.textContent === reply.name) {
          let bubble = el.querySelector(".bubble");
          if (bubble && bubble.textContent.includes(reply.text || "")) {
            el.scrollIntoView({behavior: "smooth", block: "center"});
            el.classList.add("msg-ref-highlight");
            setTimeout(() => el.classList.remove("msg-ref-highlight"), 2000);
            return;
          }
        }
      }
      showError(t("未找到引用的原始消息（可能已被清除）"));
    });
    wrapper.appendChild(quote);
  }
  let bubble = document.createElement("span");
  bubble.className = "bubble";
  // 文件未缓存时（历史消息），不显示下载链接
  if (!data) {
    bubble.innerHTML = '<span class="file-msg"><span class="file-icon">📎</span><span class="file-name">' + escapeHtml(fileName) + '</span> <span style="color:#999;font-size:85%">[文件已过期]</span></span>';
  } else {
    let a = document.createElement("a");
    a.className = "file-msg";
    a.href = data;
    a.download = fileName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    let icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = "📎";
    a.appendChild(icon);
    let nameSpan = document.createElement("span");
    nameSpan.className = "file-name";
    nameSpan.textContent = fileName;
    a.appendChild(nameSpan);
    if (fileSize) {
      let sizeSpan = document.createElement("span");
      sizeSpan.className = "file-size";
      let sz = fileSize;
      if (sz < 1024) sizeSpan.textContent = sz + " B";
      else if (sz < 1024 * 1024) sizeSpan.textContent = (sz / 1024).toFixed(1) + " KB";
      else sizeSpan.textContent = (sz / (1024 * 1024)).toFixed(1) + " MB";
      a.appendChild(sizeSpan);
    }
    bubble.appendChild(a);
  }
  wrapper.appendChild(bubble);
  buildActionMenu(wrapper, {
    name, text: t("[文件]"), timestamp, msgId, tag, tagColor, tagBorder,
    isSelf,
    isAdmin: document.cookie.indexOf("admin_logged=1") !== -1,
    hasWs: !!state.currentWebSocket,
    roomname: state.roomname
  });
  if (timestamp) {
    let timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = formatTime(timestamp);
    wrapper.appendChild(timeSpan);
  }
  trimChatlog();
  state.chatlog.appendChild(wrapper);
  state.chatlog.scrollBy(0, 1e8);
}

// Close any open action menus when clicking elsewhere
document.addEventListener("click", () => {
  document.querySelectorAll(".msg-actions-dropdown.show").forEach(d => d.classList.remove("show"));
});

function buildActionMenu(wrapper, opts) {
  let { name, text, timestamp, msgId, tag, tagColor, tagBorder, isSelf, isAdmin, hasWs, roomname } = opts;
  if (!timestamp && !msgId && !isSelf) return;

  let container = document.createElement("span");
  container.className = "msg-actions";

  let btn = document.createElement("span");
  btn.className = "msg-actions-btn";
  btn.textContent = "⋮";
  btn.title = t("更多操作");
  container.appendChild(btn);

  let dropdown = document.createElement("span");
  dropdown.className = "msg-actions-dropdown";
  container.appendChild(dropdown);

  function hide() { dropdown.classList.remove("show"); }

  function addItem(label, onClick, danger) {
    let item = document.createElement("div");
    item.className = "msg-actions-item";
    if (danger) item.classList.add("danger");
    item.textContent = label;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      hide();
      onClick(e);
    });
    dropdown.appendChild(item);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("show");
  });

  // Reply
  if (!isSelf && name) {
    addItem(t("💬 回复"), () => startReply(name, text));
  }

  // Forward to room
  if (!isSelf && name && timestamp) {
    addItem(t("↗️ 转房间"), () => {
      let targetRoom = prompt("转发到哪个房间？\n（输入房间名，如: 闲聊）");
      if (!targetRoom || !targetRoom.trim()) return;
      let fwdText = (text || "").length > 200 ? text.slice(0, 200) + "..." : (text || "");
      let adminKey = "";
      if (adminKey) {
        fetch("/api/admin/send-message/" + encodeURIComponent(targetRoom.trim()) + "?key=" + encodeURIComponent(adminKey) + "&text=" + encodeURIComponent("📨 " + name + t(" 转发: ") + fwdText) + "&sender=" + encodeURIComponent(state.username || t("系统"))).then(r => {
          if (r.ok) showSuccess(t("已转发消息到 ") + targetRoom.trim());
          else showError(t("转发失败，房间不存在？"));
        }).catch(() => showError(t("转发失败")));
      } else {
        showError(t("转发需要管理权限，请先登录后台"));
      }
    });
  }

  // Copy link
  if (msgId) {
    addItem(t("🔗 复制链接"), () => {
      let link = window.location.origin + window.location.pathname + "#" + roomname + ":" + msgId;
      navigator.clipboard.writeText(link).then(() => showSuccess(t("消息链接已复制"))).catch(() => {});
    });
  }

  // Favorite
  if (timestamp) {
    let isFav = isFavorited(timestamp);
    addItem((isFav ? "★" : "☆") + t(" 收藏"), () => toggleFavorite(wrapper, name || state.username, text, timestamp, tag, tagColor, tagBorder));
  }

  // Mark
  if (timestamp) {
    let marked = wrapper.dataset.marked === "1";
    addItem(marked ? "🔖 取消标记" : t("📍 标记"), () => {
      let m = wrapper.dataset.marked === "1";
      wrapper.dataset.marked = m ? "0" : "1";
      wrapper.style.borderLeft = m ? "" : "3px solid #f39c12";
      wrapper.style.paddingLeft = m ? "" : "4px";
    });
  }

  // Translate
  if (text && timestamp) {
    addItem(t("🌐 翻译"), () => {
      showTranslation(wrapper, text, timestamp, name);
    });
  }

  // Pin (admin)
  if (timestamp && isAdmin && hasWs) {
    addItem(t("📌 置顶"), () => {
      state.currentWebSocket.send(JSON.stringify({type: "pin", text, timestamp, name: name || state.username}));
      showSuccess(t("消息已置顶"));
    });
  }

  // Highlight (admin)
  if (timestamp && isAdmin && hasWs) {
    addItem(t("⭐ 精华"), () => {
      state.currentWebSocket.send(JSON.stringify({type: "highlight", msgTimestamp: timestamp, text}));
    });
  }

  // Reactions (inline emoji row)
  if (timestamp && hasWs) {
    let row = document.createElement("div");
    row.className = "msg-actions-item";
    row.style.cssText = "display:flex;gap:2px;padding:4px 8px;cursor:default;border-top:1px solid var(--border);margin-top:2px;padding-top:6px;";
    ["👍","❤️","😂","😮","🎉","🔥","👀","💯"].forEach(emoji => {
      let e = document.createElement("span");
      e.textContent = emoji;
      e.title = t("添加 ") + emoji + t(" 回应");
      e.style.cssText = "cursor:pointer;font-size:18px;padding:1px 3px;border-radius:4px;line-height:1;transition:background 0.1s;";
      e.addEventListener("mouseenter", () => e.style.background = "var(--bg)");
      e.addEventListener("mouseleave", () => e.style.background = "");
      e.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (state.currentWebSocket) {
          state.currentWebSocket.send(JSON.stringify({type: "reaction", msgTimestamp: timestamp, emoji, action: "add"}));
        }
        hide();
      });
      row.appendChild(e);
    });
    dropdown.appendChild(row);
  }

  // Edit (self, within 2 min)
  if (isSelf && timestamp && Date.now() - timestamp < 120000) {
    addItem(t("✏️ 编辑"), () => {
      let bubble = wrapper.querySelector(".bubble");
      if (!bubble) return;
      let oldHtml = bubble.innerHTML;
      let originalText = text || "";
      let input = document.createElement("textarea");
      input.value = originalText;
      input.style.cssText = "width:100%;box-sizing:border-box;padding:4px;border:1px solid #ccc;border-radius:4px;font-family:inherit;font-size:inherit;resize:vertical;min-height:36px;";
      bubble.innerHTML = "";
      bubble.appendChild(input);
      let saveBtn = document.createElement("button");
      saveBtn.textContent = t("保存");
      saveBtn.style.cssText = "margin-top:4px;padding:2px 10px;background:var(--primary);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;";
      bubble.appendChild(saveBtn);
      let cancelBtn = document.createElement("button");
      cancelBtn.textContent = t("取消");
      cancelBtn.style.cssText = "margin-top:4px;margin-left:4px;padding:2px 10px;background:#888;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;";
      bubble.appendChild(cancelBtn);
      input.focus();
      saveBtn.onclick = () => {
        let newText = input.value.trim();
        if (!newText) return;
        if (state.currentWebSocket) state.currentWebSocket.send(JSON.stringify({type: "edit", id: msgId, message: newText, timestamp}));
      };
      cancelBtn.onclick = () => { bubble.innerHTML = oldHtml; };
    });
  }

  // Recall (self, within 2 min)
  if (isSelf && timestamp && Date.now() - timestamp < 120000) {
    addItem(t("↩️ 撤回"), () => recallMessage(timestamp), true);
  }

  if (dropdown.children.length > 0) {
    wrapper.appendChild(container);
  }
}

export async function updatePointsDisplay() {
  try {
    let r = await fetch("/api/points/all");
    let data = await r.json();
    if (!data || typeof data !== "object") return;
    for (let child of state.roster.children) {
      let name = child.dataset.name || child.innerText || "";
      name = name.replace(/[\s]*$/, "").split(" ")[0];
      let pts = data[name];
      if (pts !== undefined) {
        let oldPts = child.querySelector(".points-badge");
        if (oldPts) oldPts.remove();
        let badge = document.createElement("span");
        badge.className = "points-badge";
        badge.textContent = pts;
        child.appendChild(badge);
      }
    }
  } catch (e) {}
}

export function applyRoomBackground(room) {
  let bg = localStorage.getItem("chat_bg_" + room);
  let cl = document.querySelector("#chatlog");
  if (!cl) return;
  if (!bg || bg === "default") { cl.style.background = ""; cl.style.backgroundImage = ""; cl.style.backgroundSize = ""; cl.style.backgroundPosition = ""; return; }
  if (bg.startsWith("#") || bg.startsWith("rgb") || /^[a-zA-Z]+$/.test(bg)) {
    cl.style.background = bg; cl.style.backgroundImage = "none";
  } else {
    cl.style.backgroundImage = "url(" + bg + ")"; cl.style.backgroundSize = "cover"; cl.style.backgroundPosition = "center"; cl.style.backgroundRepeat = "no-repeat"; cl.style.background = "";
  }
}

export function updateRosterCount() {
  let countEl = document.querySelector("#roster-count");
  if (!countEl) return;
  let count = 0;
  for (let i = 0; i < state.roster.children.length; i++) {
    let child = state.roster.children[i];
    if (child.dataset && child.dataset.name) count++;
  }
  countEl.textContent = count;
}

// 消息翻译
export async function showTranslation(wrapper, text, timestamp, name) {
  if (wrapper.dataset.translating) return;
  wrapper.dataset.translating = "1";
  let bubble = wrapper.querySelector(".bubble");
  if (!bubble) return;
  let origHtml = bubble.innerHTML;
  let transEl = wrapper.querySelector(".translation-result");
  if (transEl) {
    transEl.remove();
    delete wrapper.dataset.translating;
    return;
  }
  let el = document.createElement("div");
  el.className = "translation-result";
  el.style.cssText = "font-size:12px;color:var(--text-secondary);margin-top:4px;padding-top:4px;border-top:1px dashed var(--border);";
  el.textContent = t("翻译中...");
  bubble.parentNode.insertBefore(el, bubble.nextSibling);
  try {
    let r = await fetch("/api/translate", {
      method: "POST",
      body: JSON.stringify({text, target: t("中文")}),
      headers: {"Content-Type": "application/json"}
    });
    let data = await r.json();
    if (data.translated) {
      let langLabel = data.target || t("中文");
      el.innerHTML = '<span style="font-size:10px;opacity:0.6;">🌐 ' + langLabel + '</span> <span>' + escapeHtml(data.translated) + '</span>';
    } else {
      el.textContent = t("翻译失败: ") + (data.error || t("未知错误"));
    }
  } catch (e) {
    el.textContent = t("翻译失败: ") + e.message;
  }
}
