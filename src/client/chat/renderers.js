// 消息渲染 - addChatMessage, addChatImage, addChatFile, 投票, markdown 等
import { state, t, getUserBio } from './state.js';
import { TAG_COLORS, getVipLevel, createVipBadge } from './vip.js';
import { modifyOwnTag, startReply, recallMessage, deleteMessage, checkAtMention, showLightbox, getAdminKey } from './ui.js';
import { showUserMenu } from './menu.js';
import { isFavorited, toggleFavorite } from './favorites.js';
import { showToast, showSuccess, showError, showInfo } from './state.js';

// ⭐ 等级徽章（纯展示）：level>0 时显示 Lv.N；支持房间自定义样式（颜色/图标/文字）
// 🏅 样式来自 WS 推送的 state.levelStyles[level] = {color, icon, text}，渲染走 createElement+textContent 防 XSS
const LV_LIGHT_COLORS = new Set(["yellow", "lime", "gold", "amber", "turquoise", "cyan", "mediumseagreen", "seagreen"]);
export function createLevelBadge(level) {
  level = parseInt(level) || 0;
  if (level < 1) return null;
  let badge = document.createElement("span");
  badge.className = "lv-badge";
  let st = (state.levelStyles && state.levelStyles[String(level)]) || null;
  let text = "Lv." + level;
  let icon = "";
  if (st) {
    if (st.icon) icon = String(st.icon);
    if (st.text) text = String(st.text);
  }
  badge.textContent = (icon ? icon + " " : "") + text;
  // 颜色白名单查表兜底（查不到保持默认渐变紫）；浅色用深字保证可读
  if (st && st.color && TAG_COLORS[st.color]) {
    badge.style.background = TAG_COLORS[st.color];
    badge.style.color = LV_LIGHT_COLORS.has(st.color) ? "#333" : "#fff";
  }
  badge.title = t("等级 ") + level;
  return badge;
}

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

// —— 日期分组：跨天插入日期分隔线（统一适用于文本/图片/文件/历史加载）——
let _lastMsgDate = null;
export function resetMsgDate() { _lastMsgDate = null; }
function maybeDateDivider(ts) {
  if (!ts) return;
  let d = new Date(ts);
  let dateStr = d.getFullYear() + "/" + (d.getMonth()+1) + "/" + d.getDate();
  if (_lastMsgDate && _lastMsgDate !== dateStr) {
    let div = document.createElement("div");
    div.className = "date-divider";
    div.style.cssText = "text-align:center;font-size:11px;color:var(--text-secondary);padding:6px 0 4px;user-select:none;border-bottom:1px solid var(--border);margin:4px 0 6px;";
    div.textContent = "—— " + dateStr + " ——";
    (_batchTarget || state.chatlog).appendChild(div);
  }
  _lastMsgDate = dateStr;
}

export function escapeHtml(str) {
  let div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// v1.56 内容沉淀 markdown 重写：块级状态机 + 逐段 escape + inline 占位符
// 根治三类误伤：(a) fence 内代码被块级处理 (b) 列表 * 被斜体正则吃掉 (c) 块级生成的 HTML 标签内被行内正则扫入
// 新增块级语法：标题 # / 引用 > / 列表 - * 1. / 表格 | / 水平线 --- / 删除线 ~~ / 知识库引用 [[docId:标题]]
// 附带修复现有 bug：fence 内内容不再被后续 bold/url 二次处理；行内代码 `**x**` 不再被误加粗

// 行内处理器：入参已是 escape 后的文本。①先占位保护行内代码/katex，②文本级转换，③还原占位符。
function inlineRenderer(escaped) {
  const tokens = [];
  // ① 占位保护：行内代码 / katex 的内容绝不能被后续 bold/italic/url 改动
  escaped = escaped.replace(/`([^`]+)`/g, (m, c) => {
    const i = tokens.push({ html: '<code>' + c + '</code>' }) - 1;
    return ' T' + i + ' ';
  });
  if (typeof katex !== 'undefined') {
    escaped = escaped.replace(/\$\$([\s\S]*?)\$\$/g, (m, tex) => {
      let html = m;
      try { html = katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); } catch (e) {}
      const i = tokens.push({ html }) - 1;
      return ' T' + i + ' ';
    });
    escaped = escaped.replace(/\$([^$\n]+?)\$/g, (m, tex) => {
      let html = m;
      try { html = katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }); } catch (e) {}
      const i = tokens.push({ html }) - 1;
      return ' T' + i + ' ';
    });
  }
  // ② 文本级转换（占位符  T<n>  不含这些语法字符，天然免疫；先加粗后斜体防交叉）
  escaped = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(\s|^)\*([^*\s][^*]*?)\*(\s|$)/g, '$1<em>$2</em>$3')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[\[([a-z0-9_\-]{8,48}):([^\]]{1,80})\]\]/g, (m, docId, title) =>
      '<span class="doc-ref" data-docid="' + docId + '" title="' + title + '">📄 ' + title + '</span>')
    .replace(/https?:\/\/[^\s<"]+/g, '<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>')
    .replace(/@([\w一-鿿\-_]+)/g, '<span class="mention" data-mention="$1">@$1</span>');
  // 自定义 emoji :name:
  if (state.customEmoji) {
    escaped = escaped.replace(/:([a-zA-Z0-9_一-鿿]+):/g, (match, name) => {
      let dataUrl = state.customEmoji[name];
      if (dataUrl) {
        // 🔒 安全修复（LD6）：图片 src 一并转义引号，防属性逃逸注入 on* 事件
        return '<img src="' + dataUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') + '" class="custom-emoji" alt=":' + escapeHtml(name) + ':" title=":' + escapeHtml(name) + ':" style="width:20px;height:20px;vertical-align:middle;display:inline-block;object-fit:contain;">';
      }
      return match;
    });
  }
  // ③ 还原占位符
  return escaped.replace(/ T(\d+) /g, (m, i) => tokens[i].html);
}

// 块级状态机：跑在【原始文本】上，逐行扫描；围栏内跳过所有块级/行内处理
function parseBlocks(text) {
  const lines = String(text).split('\n');
  const segs = [];
  let para = [];   // 普通段落缓冲（kind:'inline'，逐段 escape 后走 inlineRenderer）
  let bq = [];     // 引用行缓冲
  let list = null; // {ordered, items[]}
  const flushPara = () => { if (para.length) { segs.push({ kind: 'inline', text: para.join('\n') }); para = []; } };
  const flushBq = () => {
    if (!bq.length) return;
    segs.push({ kind: 'raw', html: '<blockquote>' + bq.map(l => '<p>' + inlineRenderer(escapeHtml(l)) + '</p>').join('') + '</blockquote>' });
    bq = [];
  };
  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    segs.push({ kind: 'raw', html: '<' + tag + '>' + list.items.map(it => '<li>' + inlineRenderer(escapeHtml(it)) + '</li>').join('') + '</' + tag + '>' });
    list = null;
  };
  const flushAll = () => { flushPara(); flushBq(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 围栏代码块 ```lang：内行原样，整体 escape，跳过所有块级/行内
    const fm = line.match(/^\s*```(\w*)\s*$/);
    if (fm) {
      flushAll();
      const lang = fm[1];
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
      segs.push({ kind: 'raw', html: '<pre><code' + (lang ? ' class="language-' + lang + '"' : '') + '>' + escapeHtml(code.join('\n')) + '</code></pre>' });
      continue;
    }
    // 标题 # ## ###
    const hm = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (hm) {
      flushAll();
      const n = hm[1].length;
      segs.push({ kind: 'raw', html: '<h' + n + '>' + inlineRenderer(escapeHtml(hm[2])) + '</h' + n + '>' });
      continue;
    }
    // 水平线 --- *** ___
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      segs.push({ kind: 'raw', html: '<hr>' });
      continue;
    }
    // 引用 > 连续行合并
    const bm = line.match(/^\s{0,3}>\s?(.*)$/);
    if (bm) {
      flushPara(); flushList();
      bq.push(bm[1]);
      continue;
    }
    // 列表 - * + / 1. 1)（块级先剥离标记，斜体正则不再吃到 *）
    const lm = line.match(/^\s{0,3}([-*+]|\d{1,3}[.)])\s+(.*)$/);
    if (lm) {
      flushPara(); flushBq();
      const ordered = /\d/.test(lm[1]);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(lm[2]);
      continue;
    }
    // 表格：当前行含 | 且下一行是分隔行
    if (line.indexOf('|') !== -1 && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].indexOf('-') !== -1) {
      flushAll();
      const tableLines = [line];
      i++;
      while (i < lines.length && lines[i].indexOf('|') !== -1) { tableLines.push(lines[i]); i++; }
      i--; // 回退到最后一个表格行（for 循环 i++ 会继续）
      const cells = row => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
      const header = cells(tableLines[0]);
      const body = tableLines.slice(2).filter(r => r.trim()).map(cells);
      let h = '<table><thead><tr>' + header.map(c => '<th>' + inlineRenderer(escapeHtml(c)) + '</th>').join('') + '</tr></thead>';
      h += '<tbody>' + body.map(r => '<tr>' + r.map(c => '<td>' + inlineRenderer(escapeHtml(c)) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
      segs.push({ kind: 'raw', html: h });
      continue;
    }
    // 空行 flush 当前块
    if (!line.trim()) { flushPara(); flushBq(); flushList(); continue; }
    // 普通段落行
    flushList(); flushBq();
    para.push(line);
  }
  flushAll();
  return segs;
}

export function markdownToHtml(text) {
  if (text == null) text = '';
  return parseBlocks(text).map(s => s.kind === 'raw' ? s.html : inlineRenderer(escapeHtml(s.text))).join('');
}

// v1.56 超长折叠：原始 markdown 源码 >1500 字折叠为 420px + 渐变遮罩 + "展开全部 N 字"按钮
// 放在 hljs 之后执行（高亮不干扰高度计算）；按钮 click 需 stopPropagation 不触发 bubble 整条复制
const MSG_COLLAPSE_LEN = 1500;
function applyCollapse(bubble, len) {
  if (len <= MSG_COLLAPSE_LEN) return;
  bubble.classList.add("msg-collapsed");
  const btn = document.createElement("button");
  btn.className = "msg-fold-btn";
  btn.textContent = t("展开全部 ") + len + t(" 字");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    bubble.classList.remove("msg-collapsed");
    btn.remove();
  });
  bubble.appendChild(btn);
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
  if (data.channel && state.currentChannel && data.channel !== state.currentChannel) return;
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

// 个人签名展示 — 在用户名后追加签名标签，并设置悬停 tooltip
export function attachSignature(nameSpan, name) {
  if (!nameSpan || !name || name === state.username) return;
  let sigEl = null;
  getUserBio(name).then(bio => {
    if (!bio || !nameSpan.isConnected) return;
    sigEl = document.createElement("span");
    sigEl.className = "msg-signature";
    sigEl.textContent = bio.length > 12 ? bio.slice(0, 12) + "…" : bio;
    sigEl.title = bio; // 完整签名悬停显示
    nameSpan.appendChild(sigEl);
  });
  nameSpan.addEventListener("mouseenter", () => {
    getUserBio(name).then(bio => {
      if (!bio || !nameSpan.isConnected) return;
      if (!sigEl) {
        sigEl = document.createElement("span");
        sigEl.className = "msg-signature";
        sigEl.textContent = bio.length > 12 ? bio.slice(0, 12) + "…" : bio;
        sigEl.title = bio;
        nameSpan.appendChild(sigEl);
      }
    });
  });
}

// ===== 话题线程回复：统一引用条渲染（ID 精确跳转 + 模糊回退）=====
function buildReplyQuote(reply) {
  let quote = document.createElement("div");
  quote.className = "reply-quote";
  quote.style.cursor = "pointer";
  if (reply && reply.id) quote.dataset.replyId = reply.id;
  let replyLabel = document.createTextNode("回复 @" + (reply.name || "") + ": ");
  quote.appendChild(replyLabel);
  let replyContent = document.createElement("span");
  replyContent.textContent = reply.text || "";
  quote.appendChild(replyContent);
  quote.title = t("点击跳转到原文");
  quote.addEventListener("click", (e) => {
    e.stopPropagation();
    let target = null;
    if (reply && reply.id) {
      try { target = state.chatlog.querySelector('[data-msgid="' + reply.id + '"]'); } catch (err) {}
    }
    if (!target) {
      let msgEls = state.chatlog.querySelectorAll(".chat-msg");
      for (let el of msgEls) {
        let nameEl = el.querySelector(".username");
        if (nameEl && nameEl.textContent === reply.name) {
          let bubble = el.querySelector(".bubble");
          if (bubble && bubble.textContent.includes(reply.text || "")) { target = el; break; }
        }
      }
    }
    if (target) {
      target.scrollIntoView({behavior: "smooth", block: "center"});
      target.classList.add("msg-ref-highlight");
      setTimeout(() => target.classList.remove("msg-ref-highlight"), 2000);
    } else {
      showError(t("未找到引用的原始消息（可能已被清除）"));
    }
  });
  return quote;
}

// 话题线程：统计每条消息被回复的次数，在原消息尾部显示 "💬 N" 徽章，点击滚到最近一条回复
export function refreshReplyCounts() {
  let counts = {};
  state.chatlog.querySelectorAll(".reply-quote").forEach(q => {
    let rid = q.dataset.replyId;
    if (rid) counts[rid] = (counts[rid] || 0) + 1;
  });
  state.chatlog.querySelectorAll(".chat-msg").forEach(w => {
    let rid = w.dataset.msgId;
    let old = w.querySelector(".reply-count-badge");
    if (old) old.remove();
    if (rid && counts[rid]) {
      let badge = document.createElement("span");
      badge.className = "reply-count-badge";
      badge.textContent = "💬 " + counts[rid];
      badge.title = counts[rid] + t(" 条回复");
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        let last = null;
        state.chatlog.querySelectorAll(".reply-quote").forEach(q => {
          if (q.dataset.replyId === rid) last = q;
        });
        if (last) {
          let msgEl = last.closest(".chat-msg");
          if (msgEl) { msgEl.scrollIntoView({behavior: "smooth", block: "center"}); msgEl.classList.add("msg-ref-highlight"); setTimeout(() => msgEl.classList.remove("msg-ref-highlight"), 2000); }
        }
      });
      w.appendChild(badge);
    }
  });
}

// v1.40 Hacknet 主题：系统消息分流 hook。
// Hacknet 布局注册后，系统指令/命令结果（name==null 的 addChatMessage）改道进右侧命令终端，
// 不再在 chatlog 重复显示；非 Hacknet 主题下 hook 为 null，行为完全不变。
export let systemMessageHook = null;
export function setSystemMessageHook(fn) { systemMessageHook = fn; }

// v1.40 Hacknet IRC 化：聊天消息按 IRC 客户端渲染（无气泡文本行 + 彩色昵称）
export let hacknetIRC = false;
export function setHacknetIRC(v) { hacknetIRC = !!v; }

// Hacknet IRC 用户色板（IRCSystem UserColors，昵称按名字哈希取色）
const IRC_PALETTE = ["#00A6EB", "#5FDC53", "#DEC918", "#FFC729", "#FF8E5E", "#FF5EA8", "#5EE8C0", "#C08BFF", "#8FBFE8", "#FFB45E"];
function ircNameColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return IRC_PALETTE[h % IRC_PALETTE.length];
}

// IRC 消息行：`[昵称] 消息`（昵称彩色，消息白色，等宽无气泡）
function renderIrcMessage(name, text, isSelf, timestamp) {
  maybeDateDivider(timestamp);
  let p = document.createElement("p");
  p.className = "chat-msg irc-msg" + (isSelf ? " self" : "");
  if (timestamp) p.dataset.timestamp = timestamp;
  p.dataset.msgName = name || "";
  let nick = document.createElement("span");
  nick.className = "irc-name";
  nick.textContent = "[" + name + "]";
  nick.style.color = ircNameColor(name);
  nick.style.cursor = "pointer";
  nick.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
  p.appendChild(nick);
  let body = document.createElement("span");
  body.className = "irc-text";
  body.innerHTML = markdownToHtml(text);
  p.appendChild(body);
  trimChatlog();
  state.chatlog.appendChild(p);
  state.chatlog.scrollBy(0, 1e8);
}

// ---- 消息渲染公共助手（模块化去重）----
// 统一绑定"点击用户菜单"（头像/昵称）
function attachUserClick(el, name) {
  el.addEventListener("click", (e) => { e.stopPropagation(); showUserMenu(name, e.clientX, e.clientY); });
}

// 创建消息 wrapper：chat-msg 容器 + 时间戳/消息ID/全员提醒 data 属性
function createMsgWrapper(name, isSelf, timestamp, msgId, atAll) {
  let wrapper = document.createElement("p");
  wrapper.className = "chat-msg" + (isSelf ? " self" : " other");
  if (timestamp) wrapper.dataset.timestamp = timestamp;
  wrapper.dataset.msgName = name || "";
  if (msgId) wrapper.dataset.msgId = msgId;
  if (atAll) wrapper.classList.add("ping-all");
  return wrapper;
}

// 构建消息头部：tag徽章 + VIP徽章 + 头像 + 昵称 + 等级徽章 + 回复引用
function buildMsgHeader(wrapper, { name, tag, tagColor, tagBorder, isSelf, avatar, level, reply }) {
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
    attachUserClick(av, name);
    wrapper.appendChild(av);
  }
  if (!isSelf) {
    let nameSpan = document.createElement("span");
    nameSpan.className = "username";
    nameSpan.textContent = name;
    nameSpan.style.cursor = "pointer";
    attachUserClick(nameSpan, name);
    header.appendChild(nameSpan);
    attachSignature(nameSpan, name); // 个人签名：消息旁展示 + 悬停
  }
  let lb = createLevelBadge(level);
  if (lb) header.appendChild(lb);
  wrapper.appendChild(header);
  if (reply) wrapper.appendChild(buildReplyQuote(reply));
  return header;
}

// 追加消息时间戳
function appendMsgTime(wrapper, timestamp) {
  if (timestamp) {
    let timeSpan = document.createElement("span");
    timeSpan.className = "msg-time";
    timeSpan.textContent = formatTime(timestamp);
    wrapper.appendChild(timeSpan);
  }
}

// 打开消息操作菜单（公共参数集：是否管理员/有无 WS 统一由这里判定）
function openMsgActions(wrapper, { name, text, timestamp, msgId, tag, tagColor, tagBorder, isSelf }) {
  buildActionMenu(wrapper, {
    name, text, timestamp, msgId, tag, tagColor, tagBorder,
    isSelf,
    isAdmin: document.cookie.indexOf("admin_logged=1") !== -1,
    hasWs: !!state.currentWebSocket,
    roomname: state.roomname
  });
}

// v1.53 批4 消息流批量：连续渲染多条消息先攒进 DocumentFragment，一次上屏 + 一次滚动（取代逐条 appendChild+scrollBy）
// beginBatch/endBatch 之间 finishMsg/日期分隔线/系统消息全部改入 fragment；上屏 + 滚动由调用方统一完成
let _batchTarget = null;
export function beginBatch() { _batchTarget = document.createDocumentFragment(); return _batchTarget; }
export function endBatch() { const f = _batchTarget; _batchTarget = null; return f; }

// 公共收尾：裁剪 + 上屏 + 滚动到底（批量模式下仅入 fragment，裁剪/滚动由批量调用方统一做）
function finishMsg(wrapper) {
  if (_batchTarget) { _batchTarget.appendChild(wrapper); return; }
  trimChatlog();
  state.chatlog.appendChild(wrapper);
  state.chatlog.scrollBy(0, 1e8);
}

export function addChatMessage(name, text, tag, tagColor, msgColor, timestamp, reply, tagBorder, msgId, atAll, avatar, level) {
  if (!name) {
    if (systemMessageHook) { systemMessageHook(text); return; }
    let p = document.createElement("p");
    p.className = "system-msg";
    p.textContent = text;
    if (_batchTarget) { _batchTarget.appendChild(p); return; }
    trimChatlog();
    state.chatlog.appendChild(p);
    state.chatlog.scrollBy(0, 1e8);
    return;
  }
  let isSelf = name === state.username;
  if (hacknetIRC) { renderIrcMessage(name, text, isSelf, timestamp); return; }
  maybeDateDivider(timestamp); // 日期分组：跨天插入分隔线
  let wrapper = createMsgWrapper(name, isSelf, timestamp, msgId, atAll);
  buildMsgHeader(wrapper, { name, tag, tagColor, tagBorder, isSelf, avatar, level, reply });
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
  applyCollapse(bubble, text.length); // v1.56 超长折叠（>1500 字）
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
  openMsgActions(wrapper, { name, text, timestamp, msgId, tag, tagColor, tagBorder, isSelf });
  appendMsgTime(wrapper, timestamp);
  if (isSelf) {
    initReadObserver();
    let ri = document.createElement("span");
    ri.className = "read-indicator";
    ri.textContent = "";
    ri.style.cssText = "font-size:10px;color:#888;margin-left:4px;vertical-align:middle;user-select:none;";
    wrapper.appendChild(ri);
  }
  finishMsg(wrapper);
  if (window._readObserver) window._readObserver.observe(wrapper);
  if (!isSelf && name && timestamp && name !== "AI" && name !== "Bot") {
    let prev = wrapper.previousElementSibling;
    if (prev && prev.classList && prev.classList.contains("chat-msg") && prev.dataset.msgName === name) wrapper.classList.add("grouped");
  }
}

export function addChatImage(name, data, tag, tagColor, timestamp, tagBorder, reply, msgId, avatar, level) {
  if (!name) return;
  maybeDateDivider(timestamp); // 日期分组：跨天插入分隔线
  let isSelf = name === state.username;
  let wrapper = createMsgWrapper(name, isSelf, timestamp, msgId);
  buildMsgHeader(wrapper, { name, tag, tagColor, tagBorder, isSelf, avatar, level, reply });
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
  openMsgActions(wrapper, { name, text: t("[图片]"), timestamp, msgId, tag, tagColor, tagBorder, isSelf });
  appendMsgTime(wrapper, timestamp);
  finishMsg(wrapper);
}

export function addChatVoice(name, data, duration, tag, tagColor, timestamp, tagBorder, reply, msgId, avatar, level) {
  if (!name) return;
  maybeDateDivider(timestamp); // 日期分组：跨天插入分隔线
  let isSelf = name === state.username;
  let wrapper = createMsgWrapper(name, isSelf, timestamp, msgId);
  buildMsgHeader(wrapper, { name, tag, tagColor, tagBorder, isSelf, avatar, level, reply });
  let bubble = document.createElement("span");
  bubble.className = "bubble voice-bubble";
  if (!data) {
    bubble.innerHTML = '<span class="voice-msg"><span class="voice-icon">🎤</span><span class="voice-duration">' + (duration || "") + 's</span> <span style="color:#999;font-size:85%">[语音已过期]</span></span>';
  } else {
    let voiceWrap = document.createElement("span");
    voiceWrap.className = "voice-msg";
    let icon = document.createElement("span");
    icon.className = "voice-icon";
    icon.textContent = "🎤";
    voiceWrap.appendChild(icon);
    let audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = data;
    audio.style.cssText = "height:32px;max-width:200px;vertical-align:middle;";
    voiceWrap.appendChild(audio);
    if (duration) {
      let durSpan = document.createElement("span");
      durSpan.className = "voice-duration";
      durSpan.textContent = duration + "s";
      voiceWrap.appendChild(durSpan);
    }
    bubble.appendChild(voiceWrap);
  }
  wrapper.appendChild(bubble);
  openMsgActions(wrapper, { name, text: t("[语音]"), timestamp, msgId, tag, tagColor, tagBorder, isSelf });
  appendMsgTime(wrapper, timestamp);
  finishMsg(wrapper);
}

export function addChatGhCard(name, data, tag, tagColor, timestamp, tagBorder, msgId, avatar, level) {
  if (!name) return;
  maybeDateDivider(timestamp); // 日期分组：跨天插入分隔线
  let isSelf = name === state.username;
  let wrapper = createMsgWrapper(name, isSelf, timestamp, msgId);
  buildMsgHeader(wrapper, { name, tag, tagColor, tagBorder, isSelf, avatar, level, reply: null });
  let bubble = document.createElement("span");
  bubble.className = "bubble gh-card";
  bubble.style.cssText = "display:block;padding:0;overflow:hidden;cursor:pointer;max-width:360px;";
  let inner = document.createElement("span");
  inner.style.cssText = "display:block;";
  let repo = data && data.repo || "";
  inner.innerHTML =
    '<span style="display:flex;align-items:center;gap:8px;padding:10px 12px;">' +
      (data && data.avatar ? '<img src="' + escapeHtml(data.avatar) + '" alt="" style="width:32px;height:32px;border-radius:6px;flex:0 0 32px;">' : '<span style="width:32px;height:32px;border-radius:6px;background:#24292e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;flex:0 0 32px;">🐙</span>') +
      '<span style="display:block;overflow:hidden;">' +
        '<span style="display:block;font-weight:700;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(repo) + '</span>' +
        (data && data.language ? '<span style="display:block;font-size:11px;color:var(--text-secondary);">' + escapeHtml(data.language) + '</span>' : '') +
      '</span>' +
      '<span style="margin-left:auto;flex:0 0 auto;font-size:12px;color:var(--text-secondary);white-space:nowrap;">⭐ ' + (data && data.stars || 0) + (data && data.forks ? ' · 🍴 ' + data.forks : '') + '</span>' +
    '</span>' +
    (data && data.description ? '<span style="display:block;padding:0 12px 10px;font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + escapeHtml(data.description) + '</span>' : '') +
    '<span style="display:block;padding:6px 12px;font-size:11px;color:var(--primary);border-top:1px solid var(--border);">🔗 ' + escapeHtml(data && data.repoUrl || "") + '</span>';
  bubble.appendChild(inner);
  bubble.addEventListener("click", (e) => {
    e.stopPropagation();
    if (data && data.repoUrl) window.open(data.repoUrl, "_blank", "noopener");
  });
  wrapper.appendChild(bubble);
  openMsgActions(wrapper, { name, text: "[" + repo + "] ", timestamp, msgId, tag, tagColor, tagBorder, isSelf });
  appendMsgTime(wrapper, timestamp);
  finishMsg(wrapper);
}

export function addChatFile(name, data, fileName, fileSize, tag, tagColor, timestamp, tagBorder, reply, msgId, avatar, level) {
  if (!name) return;
  maybeDateDivider(timestamp); // 日期分组：跨天插入分隔线
  let isSelf = name === state.username;
  let wrapper = createMsgWrapper(name, isSelf, timestamp, msgId);
  buildMsgHeader(wrapper, { name, tag, tagColor, tagBorder, isSelf, avatar, level, reply });
  let bubble = document.createElement("span");
  bubble.className = "bubble";
  // 文件未缓存时（历史消息），不显示下载链接
  if (!data) {
    bubble.innerHTML = '<span class="file-msg"><span class="file-icon">📎</span><span class="file-name">' + escapeHtml(fileName) + '</span> <span style="color:#999;font-size:85%">[文件已过期]</span></span>';
  } else {
    // 📄 文件内联预览：视频直接内嵌播放、PDF 内嵌预览（过大降级为纯下载链接）
    let isVideo = /^data:video\//i.test(data);
    let isPdf = /^data:application\/pdf/i.test(data);
    if ((isVideo && data.length < 8 * 1024 * 1024) || (isPdf && data.length < 5 * 1024 * 1024)) {
      if (isVideo) {
        let preview = document.createElement("video");
        preview.className = "file-preview-media";
        preview.controls = true;
        preview.preload = "metadata";
        preview.src = data;
        preview.addEventListener("click", (e) => e.stopPropagation());
        bubble.appendChild(preview);
      } else {
        let preview = document.createElement("iframe");
        preview.className = "file-preview-pdf";
        preview.src = data;
        preview.addEventListener("click", (e) => e.stopPropagation());
        bubble.appendChild(preview);
      }
    }
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
  openMsgActions(wrapper, { name, text: t("[文件]"), timestamp, msgId, tag, tagColor, tagBorder, isSelf });
  appendMsgTime(wrapper, timestamp);
  finishMsg(wrapper);
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
    addItem(t("💬 回复"), () => startReply(name, text, msgId));
  }

  // Forward to room
  if (!isSelf && name && timestamp) {
    addItem(t("↗️ 转房间"), () => {
      if (document.cookie.indexOf("admin_logged=1") === -1) {
        showError(t("转发需要管理权限，请先登录后台"));
        return;
      }
      let targetRoom = prompt("转发到哪个房间？\n（输入房间名，如: 闲聊）");
      if (!targetRoom || !targetRoom.trim()) return;
      let fwdText = (text || "").length > 200 ? text.slice(0, 200) + "..." : (text || "");
      let adminKey = "";
      fetch("/api/admin/send-message/" + encodeURIComponent(targetRoom.trim()) + "?key=" + encodeURIComponent(adminKey) + "&text=" + encodeURIComponent("📨 " + name + t(" 转发: ") + fwdText) + "&sender=" + encodeURIComponent(state.username || t("系统"))).then(r => {
        if (r.ok) showSuccess(t("已转发消息到 ") + targetRoom.trim());
        else showError(t("转发失败，房间不存在？"));
      }).catch(() => showError(t("转发失败")));
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

  // v1.56 内容沉淀：任意文本消息一键存入房间知识库
  if (text && timestamp && hasWs) {
    addItem(t("📚 存入知识库"), () => {
      const raw = text || "";
      const title = prompt(t("文档标题（留空用消息前 20 字）"), raw.slice(0, 20));
      if (title === null) return;
      const finalTitle = (title || "").trim() || raw.slice(0, 20);
      if (!finalTitle) { showError(t("标题不能为空")); return; }
      state.currentWebSocket.send(JSON.stringify({ type: "doc", action: "create", title: finalTitle, content: raw }));
      showSuccess(t("已存入知识库"));
    });
  }

  // Pin (admin) — v1.35 按频道置顶（后端以 session.channel 为准，带上 channel 防多开错频）
  if (timestamp && isAdmin && hasWs) {
    addItem(t("📌 置顶"), () => {
      state.currentWebSocket.send(JSON.stringify({type: "pin", text, timestamp, name: name || state.username, channel: state.currentChannel}));
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

  // 🗑️ 永久删除：本人可删自己的消息（不限时间）；管理员可删任意单条
  if (timestamp && (isSelf || isAdmin)) {
    addItem(t("🗑️ 删除"), () => deleteMessage(timestamp), true);
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
      body: JSON.stringify({text, target: t("中文"), name: state.username, token: localStorage.getItem("chat_token") || ""}),
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
