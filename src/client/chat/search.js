// 搜索系统 — 服务端全文搜索历史消息（支持关键词/频道过滤 + 点击跳转定位）
import { state, t } from './state.js';
import { resetMsgDate, refreshReplyCounts, escapeHtml } from './renderers.js';
import { renderChannelMessage } from './channels.js';

export function toggleSearch() {
  let bar = document.getElementById("search-bar");
  let opened = bar.classList.toggle("show");
  if (opened) {
    document.getElementById("search-input").focus();
    document.getElementById("search-input").value = "";
    state.searchResults = [];
    state.searchIndex = -1;
    document.getElementById("search-count").textContent = "";
    closeResultsPanel();
    clearHighlights();
  }
}

function closeResultsPanel() {
  let panel = document.getElementById("search-results");
  if (panel) panel.style.display = "none";
}

function clearHighlights() {
  document.querySelectorAll(".search-highlight").forEach(el => {
    let parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    }
  });
}

function getResultsPanel() {
  let panel = document.getElementById("search-results");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "search-results";
    panel.style.cssText = "position:fixed;left:12px;right:12px;bottom:56px;max-height:40vh;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);z-index:45;font-size:13px;display:none;";
    document.body.appendChild(panel);
  }
  return panel;
}

// M20：防抖（300ms），快速连续输入不反复打服务端；请求序号丢弃过期响应
let _searchTimer = null;
let _searchSeq = 0;

// 回车搜索：走服务端全文搜索
export function doSearch() {
  clearHighlights();
  let query = document.getElementById("search-input").value.trim();
  if (!query) {
    state.searchResults = [];
    state.searchIndex = -1;
    document.getElementById("search-count").textContent = "";
    closeResultsPanel();
    return;
  }
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => serverSearch(query), 300);
}

async function serverSearch(q) {
  let my = ++_searchSeq;
  let url = "/api/room/" + encodeURIComponent(state.roomname) + "/search?q=" + encodeURIComponent(q) + "&limit=50";
  if (state.currentChannel) url += "&channel=" + encodeURIComponent(state.currentChannel);
  if (state.roomPassword) url += "&password=" + encodeURIComponent(state.roomPassword);
  let panel = getResultsPanel();
  panel.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px;">' + t("搜索中...") + '</div>';
  panel.style.display = "block";
  try {
    let r = await fetch(url);
    if (my !== _searchSeq) return; // 过期响应丢弃
    let data = await r.json();
    if (my !== _searchSeq) return;
    if (!Array.isArray(data)) {
      panel.innerHTML = '<div style="padding:8px;color:#e74c3c;font-size:12px;">' + escapeHtml((data && data.error) || t("搜索失败")) + '</div>';
      return;
    }
    state.searchResults = data;
    state.searchIndex = -1;
    document.getElementById("search-count").textContent = data.length > 0 ? t("历史找到 ") + data.length + t(" 条") : "";
    panel.innerHTML = "";
    if (data.length === 0) {
      panel.innerHTML = '<div style="padding:8px;color:var(--text-secondary);font-size:12px;">' + t("无匹配结果") + '</div>';
      return;
    }
    data.forEach((m, i) => {
      let row = document.createElement("div");
      row.className = "search-result-row";
      row.dataset.index = i;
      let timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
      let nameSpan = document.createElement("strong");
      nameSpan.textContent = m.name || "?";
      nameSpan.style.cssText = "flex-shrink:0;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      let msgSpan = document.createElement("span");
      msgSpan.textContent = m.message || "";
      msgSpan.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      row.innerHTML = "";
      let timeEl = document.createElement("span");
      timeEl.textContent = timeStr;
      timeEl.style.cssText = "color:var(--text-secondary);font-size:11px;flex-shrink:0;";
      row.appendChild(timeEl);
      row.appendChild(nameSpan);
      row.appendChild(msgSpan);
      row.addEventListener("click", () => jumpToResult(m));
      panel.appendChild(row);
    });
  } catch (e) {
    if (my !== _searchSeq) return;
    panel.innerHTML = '<div style="padding:8px;color:#e74c3c;font-size:12px;">' + t("搜索失败: ") + escapeHtml(e.message) + '</div>';
  }
}

// M19：返回实时视图（历史定位后可一键回到跳转前的实时界面）
export function backToLive() {
  if (state._savedView) {
    state.chatlog.innerHTML = state._savedView.html;
    state.lastSeenTimestamp = state._savedView.lastSeen;
    state._savedView = null;
    resetMsgDate();
    refreshReplyCounts();
  }
  let btn = document.getElementById("back-to-live-btn");
  if (btn) btn.style.display = "none";
}

function showBackToLiveButton() {
  let btn = document.getElementById("back-to-live-btn");
  if (!btn) {
    btn = document.createElement("div");
    btn.id = "back-to-live-btn";
    btn.textContent = "⬅ " + t("返回实时");
    btn.style.cssText = "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:60;background:var(--primary);color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);";
    btn.addEventListener("click", () => backToLive());
    document.body.appendChild(btn);
  }
  btn.style.display = "block";
}

// 点击结果：优先 DOM 定位；不在 DOM 则加载该时间附近历史替换聊天区再定位
async function jumpToResult(item) {
  let el = state.chatlog.querySelector('[data-timestamp="' + item.timestamp + '"]');
  if (el) {
    el.scrollIntoView({behavior: "smooth", block: "center"});
    el.classList.add("msg-ref-highlight");
    setTimeout(() => el.classList.remove("msg-ref-highlight"), 2000);
    return;
  }
  let url = "/api/room/" + encodeURIComponent(state.roomname) + "/history?before=" + (item.timestamp + 1) + "&limit=60";
  if (state.currentChannel) url += "&channel=" + encodeURIComponent(state.currentChannel);
  if (state.roomPassword) url += "&password=" + encodeURIComponent(state.roomPassword);
  try {
    let r = await fetch(url);
    let msgs = await r.json();
    if (!Array.isArray(msgs)) return;
    // M19：保存跳转前的实时视图，加载历史定位后提供"返回实时"
    if (!state._savedView) {
      state._savedView = { html: state.chatlog.innerHTML, lastSeen: state.lastSeenTimestamp };
    }
    state.chatlog.innerHTML = '<div id="spacer"></div>';
    state.lastSeenTimestamp = 0;
    resetMsgDate();
    msgs.forEach(m => renderChannelMessage(m));
    refreshReplyCounts();
    showBackToLiveButton();
    let target = state.chatlog.querySelector('[data-timestamp="' + item.timestamp + '"]');
    if (target) {
      target.scrollIntoView({behavior: "smooth", block: "center"});
      target.classList.add("msg-ref-highlight");
      setTimeout(() => target.classList.remove("msg-ref-highlight"), 2000);
    }
  } catch (e) {}
}

export function searchPrev() { moveInResults(-1); }
export function searchNext() { moveInResults(1); }

function moveInResults(dir) {
  if (!state.searchResults || state.searchResults.length === 0) return;
  let panel = getResultsPanel();
  let rows = panel.querySelectorAll(".search-result-row");
  if (state.searchIndex < 0) state.searchIndex = 0;
  state.searchIndex = (state.searchIndex + dir + state.searchResults.length) % state.searchResults.length;
  rows.forEach((r, i) => r.classList.toggle("active", i === state.searchIndex));
  let target = state.searchResults[state.searchIndex];
  let el = state.chatlog.querySelector('[data-timestamp="' + target.timestamp + '"]');
  if (el) el.scrollIntoView({behavior: "smooth", block: "center"});
  let activeRow = rows[state.searchIndex];
  if (activeRow) activeRow.scrollIntoView({behavior: "smooth", block: "nearest"});
  document.getElementById("search-count").textContent = (state.searchIndex + 1) + "/" + state.searchResults.length;
}
