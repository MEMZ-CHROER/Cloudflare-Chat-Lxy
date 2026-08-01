// 音乐播放器 — 基于 Meting API（参考 Firefly 项目）
// Meting API 统一接口，支持网易云音乐等多平台，返回直接可播放的 URL
import { showError, showInfo } from './state.js';

// Meting API 地址列表（主 + 备用），按顺序尝试
const METING_APIS = [
  "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
  "https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
  "https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
];

let queue = [];
let currentIndex = -1;
let audio = null;
let seeking = false;

// ---- 工具 ----
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ---- Meting API 请求 ----
async function fetchMeting(type, id) {
  for (const apiTemplate of METING_APIS) {
    try {
      const url = apiTemplate
        .replace(":server", "netease")
        .replace(":type", type)
        .replace(":id", encodeURIComponent(id))
        .replace(":r", Math.random());
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    } catch (e) {
      console.warn("Meting API failed:", apiTemplate, e);
    }
  }
  throw new Error(t("所有音乐 API 均不可用"));
}

// ---- 搜索 ----
export async function searchMusic(keywords) {
  if (!keywords || !keywords.trim()) { showInfo(t("请输入搜索内容")); return; }
  const container = document.getElementById("music-results");
  container.innerHTML = '<div class="music-empty">搜索中...</div>';
  try {
    const data = await fetchMeting("search", keywords.trim());
    queue = data.map(item => ({
      name: item.title || item.name || t("未知"),
      artist: item.author || item.artist || t("未知"),
      url: item.url || "",
      cover: item.pic || item.cover || "",
      lrc: item.lrc || ""
    })).filter(s => s.url); // 只保留有可播放 URL 的
    if (!queue.length) {
      container.innerHTML = '<div class="music-empty">未找到可播放的歌曲</div>';
      return;
    }
    renderResults();
  } catch (e) {
    container.innerHTML = '<div class="music-empty">搜索失败：' + escapeHtml(e.message) + '</div>';
  }
}

function renderResults() {
  const container = document.getElementById("music-results");
  container.innerHTML = queue.map((s, i) => `
    <div class="music-item ${i === currentIndex ? 'playing' : ''}" data-idx="${i}">
      <div class="music-item-info">
        <div class="music-item-name">${escapeHtml(s.name)}</div>
        <div class="music-item-artist">${escapeHtml(s.artist)}</div>
      </div>
      <button class="music-item-play" data-idx="${i}" title="播放">${i === currentIndex ? '⏸' : '▶'}</button>
    </div>
  `).join("");
  container.querySelectorAll(".music-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.idx, 10);
      if (idx === currentIndex && audio && !audio.paused) pause();
      else playIndex(idx);
    });
  });
}

// ---- 播放 ----
export function playIndex(idx) {
  if (idx < 0 || idx >= queue.length) return;
  currentIndex = idx;
  const song = queue[idx];
  const player = document.getElementById("music-player");
  if (player) player.style.display = "";
  document.getElementById("music-now-name").textContent = song.name;
  document.getElementById("music-now-artist").textContent = song.artist;
  const cover = document.getElementById("music-cover");
  if (cover) {
    cover.style.visibility = song.cover ? "visible" : "hidden";
    cover.src = song.cover || "";
  }
  document.getElementById("music-time-current").textContent = "0:00";
  document.getElementById("music-time-total").textContent = "0:00";
  document.getElementById("music-progress-bar").value = 0;
  renderResults();

  const a = ensureAudio();
  a.src = song.url;
  a.play().catch(() => showError(t("自动播放被浏览器拦截，请点击播放按钮")));
}

export function togglePlay() {
  const a = ensureAudio();
  if (!a.src) { if (queue.length) playIndex(currentIndex < 0 ? 0 : currentIndex); return; }
  if (a.paused) a.play(); else a.pause();
}

export function pause() {
  const a = ensureAudio();
  if (a.src && !a.paused) a.pause();
}

export function next() {
  if (!queue.length) return;
  playIndex((currentIndex + 1) % queue.length);
}

export function prev() {
  if (!queue.length) return;
  playIndex((currentIndex - 1 + queue.length) % queue.length);
}

// ---- Audio 元素 ----
function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.addEventListener("timeupdate", () => {
    if (seeking) return;
    const bar = document.getElementById("music-progress-bar");
    const cur = document.getElementById("music-time-current");
    if (bar && audio.duration) bar.value = (audio.currentTime / audio.duration) * 100;
    if (cur) cur.textContent = fmtTime(audio.currentTime);
  });
  audio.addEventListener("loadedmetadata", () => {
    const total = document.getElementById("music-time-total");
    if (total) total.textContent = fmtTime(audio.duration);
  });
  audio.addEventListener("ended", () => next());
  audio.addEventListener("play", () => {
    const btn = document.getElementById("music-play");
    if (btn) btn.textContent = "⏸";
  });
  audio.addEventListener("pause", () => {
    const btn = document.getElementById("music-play");
    if (btn) btn.textContent = "▶";
  });
  audio.addEventListener("error", () => {
    showError(t("播放失败，尝试下一首"));
    setTimeout(() => next(), 1500);
  });
  return audio;
}

// ---- 面板开闭 ----
export function openMusic() {
  document.getElementById("music-overlay").classList.add("show");
  setTimeout(() => {
    const input = document.getElementById("music-search-input");
    if (input) input.focus();
  }, 50);
}

export function closeMusic() {
  document.getElementById("music-overlay").classList.remove("show");
}

// ---- 初始化 ----
export function initMusic() {
  document.getElementById("music-toggle").addEventListener("click", openMusic);
  document.getElementById("music-search-btn").addEventListener("click", () => {
    searchMusic(document.getElementById("music-search-input").value);
  });
  document.getElementById("music-search-input").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") searchMusic(e.target.value);
  });
  document.getElementById("music-play").addEventListener("click", togglePlay);
  document.getElementById("music-next").addEventListener("click", next);
  document.getElementById("music-prev").addEventListener("click", prev);
  const bar = document.getElementById("music-progress-bar");
  bar.addEventListener("input", () => { seeking = true; });
  bar.addEventListener("change", () => {
    const a = ensureAudio();
    if (a.duration) a.currentTime = (bar.value / 100) * a.duration;
    seeking = false;
  });
}
