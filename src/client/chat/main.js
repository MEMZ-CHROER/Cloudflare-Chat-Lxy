// 入口模块 — 只导入首屏必需模块，重模块延迟加载
import { state, t } from './state.js';
import { escapeHtml } from './renderers.js';
import { startNameChooser } from './auth.js';
import { startRoomList } from './rooms.js';
import { cancelReply, hideLightbox, galleryPrev, galleryNext, exportChatLog, updateTitleUnread } from './ui.js';
import { hideUserMenu, handleMenuAction, showUserMenu, hideProfile } from './menu.js';
import { sendDM, closeDM } from './dm.js';
import { toggleSearch, doSearch, searchPrev, searchNext } from './search.js';
import { toggleFavoritesPanel } from './favorites.js';
import { openSettings, closeSettings, initSettings, isSafeMediaUrl } from './settings.js';
import { openMusic, closeMusic, initMusic } from './music.js';
import { showSuccess, showInfo, showError } from './state.js';

// Window 兼容 — 重模块用延迟加载存根
function lazyMod(name, fnName) {
  return function(...args) {
    import('./' + name + '.js').then(m => {
      if (m[fnName]) try { m[fnName](...args); } catch(e) { showError(t("模块错误: ") + e.message); }
    }).catch(e => showError(t("加载模块失败: ") + e.message));
  };
}
const lazyMods = {
  openShop: ['shop', 'openShop'], closeShop: ['shop', 'closeShop'],
  switchShopTab: ['shop', 'switchShopTab'], buyItem: ['shop', 'buyItem'],
  equipItem: ['shop', 'equipItem'], unequipItem: ['shop', 'unequipItem'],
  openLottery: ['lottery', 'openLottery'], closeLottery: ['lottery', 'closeLottery'],
  doDraw: ['lottery', 'doDraw'],
  openTasks: ['tasks', 'openTasks'], closeTasks: ['tasks', 'closeTasks'],
  claimTask: ['tasks', 'claimTask'], completeTask: ['tasks', 'completeTask'],
  openGames: ['games', 'openGames'], closeGames: ['games', 'closeGames'],
  switchGame: ['games', 'switchGame'],
};
for (let [k, v] of Object.entries(lazyMods)) window[k] = lazyMod(v[0], v[1]);

window.toggleSearch = toggleSearch;
window.closeDM = closeDM;
window.sendDM = sendDM;
window.hideProfile = hideProfile;
window.exportChatLog = exportChatLog;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.openMusic = openMusic;
window.closeMusic = closeMusic;

// 设置按钮
document.getElementById("settings-toggle").addEventListener("click", openSettings);

// 音乐播放器
initMusic();

// 用户菜单
document.getElementById("user-menu").addEventListener("click", (e) => {
  let item = e.target.closest(".user-menu-item");
  if (item) handleMenuAction(item.dataset.action);
});
document.body.addEventListener("click", (e) => {
  if (!e.target.closest("#user-menu")) hideUserMenu();
});

// 回复取消
document.body.addEventListener("click", (e) => {
  if (e.target.closest(".reply-cancel")) cancelReply();
});

// @提及点击
document.body.addEventListener("click", (e) => {
  let mention = e.target.closest(".mention");
  if (mention) { e.preventDefault(); let name = mention.dataset.mention; if (name) showUserMenu(name, e.clientX, e.clientY); }
});

// 代码复制
document.body.addEventListener("click", (e) => {
  let btn = e.target.closest(".code-copy-btn");
  if (!btn) return;
  let code = btn.parentNode.querySelector("code");
  if (code) {
    navigator.clipboard.writeText(code.textContent).then(() => {
      btn.textContent = t("已复制"); btn.classList.add("copied");
      setTimeout(() => { btn.textContent = t("复制"); btn.classList.remove("copied"); }, 2000);
    }).catch(() => {});
  }
});

// 收藏 - fav-close still exists, favorites-btn was moved to more-menu
document.getElementById("fav-close")?.addEventListener("click", toggleFavoritesPanel);

// 房间信息 - moved to more-menu
// 精华消息 - moved to more-menu
// 定时消息管理 - moved to more-menu

// 跨频道未读数也更新浏览器标题（channels.bumpChannelUnread 依赖）
window.updateTitleUnread = updateTitleUnread;

window._showScheduledList = function(list) {
  if (!list || list.length === 0) { showInfo(t("当前没有定时消息")); return; }
  let existing = document.getElementById("sched-list-panel");
  if (existing) { existing.remove(); return; }
  let overlay = document.createElement("div");
  overlay.id = "sched-list-panel";
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:150;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  let panel = document.createElement("div");
  panel.style.cssText = "background:var(--surface);border-radius:12px;padding:16px;min-width:320px;max-width:420px;max-height:70vh;box-shadow:0 8px 32px rgba(0,0,0,0.2);color:var(--text);font-size:13px;display:flex;flex-direction:column;overflow:hidden;";
  panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><strong style="font-size:15px;">⏰ 定时消息 (' + list.length + ')</strong><span style="cursor:pointer;font-size:20px;line-height:1;color:var(--text-secondary);" id="sl-close">&times;</span></div>';
  let listDiv = document.createElement("div");
  listDiv.style.cssText = "flex:1;overflow-y:auto;";
  list.forEach(s => {
    let row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:4px;margin-bottom:3px;background:var(--bg);";
    let timeStr = new Date(s.time).toLocaleString();
    let msgShort = s.message || "";
    row.innerHTML = '<div style="flex:1;overflow:hidden;"><div style="font-size:12px;font-weight:600;">' + escapeHtml(s.name) + '</div><div style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(msgShort) + '</div><div style="font-size:10px;color:#888;">' + timeStr + '</div></div>' +
      '<span style="cursor:pointer;color:#e74c3c;font-size:16px;flex-shrink:0;" data-sched-id="' + escapeHtml(s.id) + '">&times;</span>';
    row.querySelector("[data-sched-id]").addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.currentWebSocket) {
        state.currentWebSocket.send(JSON.stringify({type: "schedule-cancel", id: s.id}));
        row.remove();
        if (listDiv.children.length === 0) { overlay.remove(); showSuccess(t("所有定时消息已取消")); }
      }
    });
    listDiv.appendChild(row);
  });
  panel.appendChild(listDiv);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.getElementById("sl-close").onclick = () => overlay.remove();
};

// 搜索
document.getElementById("search-toggle").addEventListener("click", toggleSearch);
document.getElementById("search-input").addEventListener("input", doSearch);
document.getElementById("search-prev").addEventListener("click", searchPrev);
document.getElementById("search-next").addEventListener("click", searchNext);
document.getElementById("search-close").addEventListener("click", toggleSearch);
document.getElementById("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) searchPrev(); else searchNext(); }
  if (e.key === "Escape") toggleSearch();
});

// Lightbox
document.getElementById("lightbox").addEventListener("click", (e) => {
  if (e.target === e.currentTarget || e.target.classList.contains("lb-close")) hideLightbox();
});
document.getElementById("gallery-prev").addEventListener("click", (e) => { e.stopPropagation(); galleryPrev(); });
document.getElementById("gallery-next").addEventListener("click", (e) => { e.stopPropagation(); galleryNext(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideLightbox();
  if (e.key === "ArrowLeft") galleryPrev();
  if (e.key === "ArrowRight") galleryNext();
});

// 声音切换
document.getElementById("sound-toggle").addEventListener("click", () => {
  state.soundMuted = !state.soundMuted;
  document.getElementById("sound-toggle").textContent = state.soundMuted ? "🔇" : "🔊";
  document.getElementById("sound-toggle").classList.toggle("muted", state.soundMuted);
});

// 暗色模式 - 优先 localStorage，其次跟随系统设置
let savedDark = localStorage.getItem("darkMode");
if (savedDark === "1") {
  document.body.classList.add("dark");
  document.getElementById("dark-toggle").textContent = "☀️";
} else if (savedDark === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.body.classList.add("dark");
  document.getElementById("dark-toggle").textContent = "☀️";
  localStorage.setItem("darkMode", "1");
}
document.getElementById("dark-toggle").addEventListener("click", () => {
  let on = document.body.classList.toggle("dark");
  localStorage.setItem("darkMode", on ? "1" : "0");
  document.getElementById("dark-toggle").textContent = on ? "☀️" : "🌙";
});

// Service Worker
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

// Firefly 背景图加载 + fallback
// 优先 api.elaina.cat，失败则切换到 picsum 随机图，再失败则使用纯渐变（已是 body::before 默认）
// 若已设置自定义壁纸或视频壁纸，则恢复并跳过随机加载
(function setupBackground() {
  // 恢复自定义壁纸（URL 白名单校验）
  const savedWp = localStorage.getItem("customWallpaper");
  if (savedWp && isSafeMediaUrl(savedWp)) {
    document.documentElement.style.setProperty("--site-bg-image", `url("${savedWp}")`);
    return;
  }
  // 恢复视频壁纸（URL 白名单校验）
  const savedVideo = localStorage.getItem("customVideo");
  if (savedVideo && isSafeMediaUrl(savedVideo)) {
    const video = document.getElementById("video-wallpaper");
    if (video) {
      video.src = savedVideo;
      video.style.display = "";
      document.body.classList.add("video-bg");
      video.play().catch(() => {});
    }
    return;
  }
  const sources = [
    "https://api.elaina.cat/random/pc",
    "https://picsum.photos/1920/1080",
    "https://bing.ioli.s.cn/v1/rand?w=1920&h=1080"
  ];
  const setBg = (url) => document.documentElement.style.setProperty("--site-bg-image", `url("${url}")`);
  const tryLoad = (url) => new Promise(res => {
    const img = new Image();
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = url;
    // 4 秒超时视为失败
    setTimeout(() => res(false), 4000);
  });
  (async () => {
    // 缓存 2 小时内的随机图，避免每次刷新都换
    const cached = localStorage.getItem("ff-bg-url");
    const cachedAt = +localStorage.getItem("ff-bg-ts") || 0;
    if (cached && isSafeMediaUrl(cached) && Date.now() - cachedAt < 2 * 60 * 60 * 1000) {
      setBg(cached);
      return;
    }
    for (const url of sources) {
      const ok = await tryLoad(url);
      if (ok) {
        setBg(url);
        localStorage.setItem("ff-bg-url", url);
        localStorage.setItem("ff-bg-ts", String(Date.now()));
        return;
      }
    }
    // 全部失败，留 CSS 默认值（仍可能为空），不影响 ::before 渐变背景
  })();
})();

// 可见性变化 - 未读计数重置
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { state.unreadCount = 0; document.title = state.originalDocTitle; }
});

// 私信回车发送
document.addEventListener("keydown", function(e) {
  if (e.target && e.target.id === "dm-input" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); }
});

// 全局 Escape
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeShop(); closeTasks(); closeGames(); closeSettings(); closeMusic(); } });

// 启动登录界面
initSettings();
startNameChooser();
