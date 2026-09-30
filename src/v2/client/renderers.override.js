/**
 * v2 Renderers — message rendering utilities (ported from v1 renderers.js)
 * Self-contained — no dependency on v1 core modules.
 */

const TAG_COLOR_MAP = {
  blue: "#3b82f6", red: "#ef4444", green: "#22c55e",
  yellow: "#eab308", purple: "#a855f7", pink: "#ec4899",
  orange: "#f97316", cyan: "#06b6d4", white: "#ffffff",
  black: "#1e293b", gold: "#f59e0b",
};

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function markdownToHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

export function createTagBadge(tag, tagColor, tagBorder) {
  if (!tag) return null;
  const badge = document.createElement("span");
  badge.className = "v2-tag";
  const defaultBg = tagColor && TAG_COLOR_MAP[tagColor] ? TAG_COLOR_MAP[tagColor] : "#64748b";
  badge.style.backgroundColor = defaultBg;
  if (tagBorder && TAG_COLOR_MAP[tagBorder]) {
    badge.style.outline = `2px solid ${TAG_COLOR_MAP[tagBorder]}`;
    badge.style.outlineOffset = "-1px";
  }
  badge.style.color = "#fff";
  badge.style.padding = "1px 5px";
  badge.style.borderRadius = "3px";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "600";
  badge.style.marginRight = "4px";
  badge.textContent = tag;
  return badge;
}

export function createMsgWrapper(name, isSelf, timestamp, msgId) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-msg" + (isSelf ? " self" : " other");
  if (timestamp) wrapper.dataset.timestamp = String(timestamp);
  if (msgId) wrapper.dataset.msgId = String(msgId);
  return wrapper;
}

export function buildMsgHeader(wrapper, { name, tag, tagColor, tagBorder, isSelf }) {
  const header = document.createElement("div");
  header.className = "msg-header";

  const tagBadge = createTagBadge(tag, tagColor, tagBorder);
  if (tagBadge) header.appendChild(tagBadge);

  const nameSpan = document.createElement("span");
  nameSpan.className = "username";
  nameSpan.textContent = name;
  if (!isSelf) {
    nameSpan.style.cursor = "pointer";
    nameSpan.title = "点击查看用户信息";
  }
  header.appendChild(nameSpan);

  wrapper.appendChild(header);
  return header;
}

export function appendMsgTime(wrapper, timestamp) {
  if (timestamp) {
    const timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = formatTime(timestamp);
    wrapper.appendChild(timeSpan);
  }
}

export function renderMarkdownBubble(text, type) {
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (type === "image") {
    const img = document.createElement("img");
    img.src = text;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.style.display = "block";
    bubble.appendChild(img);
  } else if (type === "gh-card") {
    bubble.innerHTML = `<div style="padding:8px;background:rgba(0,0,0,0.3);border-radius:6px;border-left:3px solid #3b82f6;font-size:13px;">📦 <strong>GitHub</strong><br>${escapeHtml(text)}</div>`;
  } else {
    bubble.innerHTML = markdownToHtml(text);
  }
  return bubble;
}

/**
 * Full message render — creates a complete message element from v1/v2 data.
 * Returns the DOM element or null for system messages.
 */
export function renderChatMessage(msg, isSelf) {
  // System message (no name)
  if (!msg.name) {
    const p = document.createElement("p");
    p.className = "system-msg";
    p.textContent = msg.content || msg.message || "";
    return p;
  }

  const wrapper = createMsgWrapper(msg.name, isSelf, msg.timestamp, msg.id);
  buildMsgHeader(wrapper, {
    name: msg.name,
    tag: msg.tag,
    tagColor: msg.tagColor,
    tagBorder: msg.tagBorder,
    isSelf,
  });

  const text = msg.content || msg.message || "";
  const bubble = renderMarkdownBubble(text, msg.type || "msg");
  wrapper.appendChild(bubble);

  appendMsgTime(wrapper, msg.timestamp);

  return wrapper;
}

/**
 * Batch message rendering — returns a DocumentFragment for efficient DOM updates.
 */
export function beginBatch(container) {
  container._batch = document.createDocumentFragment();
  return container._batch;
}

export function endBatch(container) {
  const frag = container._batch;
  container._batch = null;
  if (frag) {
    container.appendChild(frag);
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Render a batch of messages at once (for initial load / history).
 */
export function renderMessageBatch(container, messages, isSelfFn) {
  const frag = document.createDocumentFragment();
  for (const msg of messages) {
    const el = renderChatMessage(msg, isSelfFn ? isSelfFn(msg.name) : false);
    if (el) frag.appendChild(el);
  }
  container.appendChild(frag);
  container.scrollTop = container.scrollHeight;
}
