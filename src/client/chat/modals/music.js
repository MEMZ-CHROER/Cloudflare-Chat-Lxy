// v1.53 音乐播放器弹窗 — Vue3 重写（批2 工具域）
// 完全接管旧 #music-overlay 的 UI：搜索 / 播放列表 / 播放器控制（上一首/播放暂停/下一首/进度条）。
// 原 music.js 的播放控制函数（playIndex/togglePlay/next/prev）直接操作旧 overlay DOM
// （renderResults 写 #music-results、playIndex 写 #music-now-name/#music-cover 等），非纯逻辑无法直接复用，
// 故本组件照抄其逻辑并改为写 Vue 响应式状态；audio/queue/currentIndex 提升到本模块级，
// 关闭弹窗不中断播放（对齐旧行为：closeMusic 只隐藏 overlay，音乐继续放）。
// 文案与旧 overlay 一致（t() 复用已有 key，不新增）。
import * as Vue from '/static/chat/vendor/vue.js';
import { t, showInfo, showError } from '../state.js';
import { injectCss } from '../modal-manager.js';

injectCss('cm-style-music', `
.cm-music { display: flex; flex-direction: column; min-width: min(480px, 92vw); max-height: 85vh; }
.cm-music-search { display: flex; gap: 8px; padding: 12px 16px 0; flex-shrink: 0; }
.cm-music-search input { flex: 1; min-width: 0; padding: 9px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--input-ink); font-size: 14px; outline: none; font-family: inherit; }
.cm-music-search input:focus { border-color: var(--primary); }
.cm-music-search button { padding: 8px 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.cm-music-search button:hover { background: var(--primary-dark); }
.cm-music-results { flex: 1; min-height: 160px; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 12px 16px; }
.cm-music-empty { text-align: center; color: var(--text-secondary); font-size: 13px; padding: 30px 0; }
.cm-music-item { display: flex; align-items: center; padding: 10px 12px; margin-bottom: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: background .15s; }
.cm-music-item:hover { background: var(--surface-2); }
.cm-music-item.playing { border-color: var(--primary); background: rgba(var(--primary-rgb), 0.08); }
.cm-music-item-info { flex: 1; min-width: 0; }
.cm-music-item-name { font-size: 14px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-music-item-artist { font-size: 12px; color: var(--text-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-music-item-play { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--primary); color: #fff; font-size: 12px; cursor: pointer; flex-shrink: 0; margin-left: 10px; display: flex; align-items: center; justify-content: center; }
.cm-music-item-play:hover { background: var(--primary-dark); }
.cm-music-player { border-top: 1px solid var(--border); padding: 12px 16px; flex-shrink: 0; background: var(--surface); }
.cm-music-player-info { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.cm-music-player-info img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; flex-shrink: 0; background: var(--border); }
.cm-music-player-text { flex: 1; min-width: 0; }
.cm-music-now-name { font-size: 14px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-music-now-artist { font-size: 12px; color: var(--text-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-music-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.cm-music-progress span { font-size: 11px; color: var(--text-secondary); min-width: 32px; text-align: center; }
.cm-music-progress input[type="range"] { flex: 1; height: 4px; -webkit-appearance: none; appearance: none; background: var(--border); border-radius: 2px; outline: none; cursor: pointer; }
.cm-music-progress input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); cursor: pointer; }
.cm-music-progress input[type="range"]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--primary); border: none; cursor: pointer; }
.cm-music-controls { display: flex; align-items: center; justify-content: center; gap: 20px; }
.cm-music-controls button { width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--surface-2); color: var(--text); font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; font-family: inherit; }
.cm-music-controls button:hover { background: var(--primary); color: #fff; }
.cm-music-controls .cm-music-play { width: 48px; height: 48px; font-size: 18px; background: var(--primary); color: #fff; }
.cm-music-controls .cm-music-play:hover { background: var(--primary-dark); }
`);

// Meting API 地址列表（主 + 备用），照抄原 music.js
const METING_APIS = [
  "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
  "https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
  "https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
];

// 模块级播放状态：关闭弹窗不中断播放，重开恢复（对齐旧行为）
let queue = [];
let currentIndex = -1;
let audio = null;
let seeking = false;

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}

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

export default {
  name: 'MusicModal',
  setup() {
    const keyword = Vue.ref('');
    const loading = Vue.ref(false);
    const error = Vue.ref('');
    const results = Vue.ref([]);        // 播放列表（镜像 queue）
    const nowName = Vue.ref('');
    const nowArtist = Vue.ref('');
    const nowCover = Vue.ref('');
    const isPlaying = Vue.ref(false);
    const currentTime = Vue.ref(0);
    const duration = Vue.ref(0);
    const progress = Vue.ref(0);
    const showPlayer = Vue.ref(false);

    function syncResults() {
      results.value = queue.map((s, i) => ({ name: s.name, artist: s.artist, cover: s.cover, i }));
    }

    async function doSearch() {
      const kw = keyword.value.trim();
      if (!kw) { showInfo(t("请输入搜索内容")); return; }
      loading.value = true;
      error.value = '';
      try {
        const data = await fetchMeting("search", kw);
        queue = data.map(item => ({
          name: item.title || item.name || t("未知"),
          artist: item.author || item.artist || t("未知"),
          url: item.url || "",
          cover: item.pic || item.cover || "",
          lrc: item.lrc || ""
        })).filter(s => s.url); // 只保留有可播放 URL 的
        if (!queue.length) {
          results.value = [];
          error.value = "未找到可播放的歌曲";
          return;
        }
        error.value = '';
        syncResults();
      } catch (e) {
        results.value = [];
        error.value = "搜索失败：" + (e && e.message ? e.message : String(e));
      } finally {
        loading.value = false;
      }
    }

    function ensureAudio() {
      if (audio) return audio;
      audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.addEventListener("timeupdate", () => {
        if (seeking) return;
        if (audio && audio.duration) progress.value = (audio.currentTime / audio.duration) * 100;
        currentTime.value = audio ? audio.currentTime : 0;
      });
      audio.addEventListener("loadedmetadata", () => {
        duration.value = audio ? audio.duration : 0;
      });
      audio.addEventListener("ended", () => next());
      audio.addEventListener("play", () => { isPlaying.value = true; });
      audio.addEventListener("pause", () => { isPlaying.value = false; });
      audio.addEventListener("error", () => {
        showError(t("播放失败，尝试下一首"));
        setTimeout(() => next(), 1500);
      });
      return audio;
    }

    function playIndex(idx) {
      if (idx < 0 || idx >= queue.length) return;
      currentIndex = idx;
      const song = queue[idx];
      showPlayer.value = true;
      nowName.value = song.name;
      nowArtist.value = song.artist;
      nowCover.value = song.cover || "";
      currentTime.value = 0;
      duration.value = 0;
      progress.value = 0;
      syncResults();

      const a = ensureAudio();
      a.src = song.url;
      a.play().catch(() => showError(t("自动播放被浏览器拦截，请点击播放按钮")));
    }

    function togglePlay() {
      const a = ensureAudio();
      if (!a.src) { if (queue.length) playIndex(currentIndex < 0 ? 0 : currentIndex); return; }
      if (a.paused) a.play(); else a.pause();
    }

    function pause() {
      const a = ensureAudio();
      if (a.src && !a.paused) a.pause();
    }

    function next() {
      if (!queue.length) return;
      playIndex((currentIndex + 1) % queue.length);
    }

    function prev() {
      if (!queue.length) return;
      playIndex((currentIndex - 1 + queue.length) % queue.length);
    }

    function onItemClick(idx) {
      if (idx === currentIndex && audio && !audio.paused) pause();
      else playIndex(idx);
    }

    function onSeekDrag() { seeking = true; }
    function onSeekCommit() {
      const a = ensureAudio();
      if (a.duration) a.currentTime = (progress.value / 100) * a.duration;
      seeking = false;
    }

    // 弹窗打开时：同步模块级播放状态（重开后恢复正在播放的歌曲）+ 聚焦搜索框（对齐 openMusic）
    Vue.onMounted(() => {
      syncResults();
      if (currentIndex >= 0 && queue[currentIndex]) {
        const song = queue[currentIndex];
        showPlayer.value = true;
        nowName.value = song.name;
        nowArtist.value = song.artist;
        nowCover.value = song.cover || "";
        if (audio) {
          isPlaying.value = !audio.paused;
          currentTime.value = audio.currentTime;
          if (audio.duration) {
            duration.value = audio.duration;
            progress.value = (audio.currentTime / audio.duration) * 100;
          }
        }
      }
      setTimeout(() => {
        const input = document.getElementById("cm-music-search-input");
        if (input) input.focus();
      }, 50);
    });

    return {
      keyword, loading, error, results, nowName, nowArtist, nowCover,
      isPlaying, currentTime, duration, progress, showPlayer, currentIndex,
      doSearch, togglePlay, pause, next, prev, onItemClick, onSeekDrag, onSeekCommit, fmtTime, t,
    };
  },
  template: `
  <div class="cm-music">
    <div class="cm-header">
      <span>🎵 音乐播放器</span>
      <button class="cm-close" @click="$emit('close')" title="关闭">&times;</button>
    </div>
    <div class="cm-music-search">
      <input id="cm-music-search-input" v-model="keyword" placeholder="搜索歌曲或歌手..." autocomplete="off" @keyup.enter="doSearch">
      <button type="button" @click="doSearch">{{ t('搜索') }}</button>
    </div>
    <div class="cm-music-results">
      <div v-if="loading" class="cm-music-empty">搜索中...</div>
      <div v-else-if="error" class="cm-music-empty">{{ error }}</div>
      <div v-else-if="results.length === 0" class="cm-music-empty">输入歌曲名开始搜索</div>
      <div v-else>
        <div v-for="s in results" :key="s.i" class="cm-music-item" :class="{ playing: s.i === currentIndex }" @click="onItemClick(s.i)">
          <div class="cm-music-item-info">
            <div class="cm-music-item-name">{{ s.name }}</div>
            <div class="cm-music-item-artist">{{ s.artist }}</div>
          </div>
          <button type="button" class="cm-music-item-play" title="播放">{{ s.i === currentIndex && isPlaying ? '⏸' : '▶' }}</button>
        </div>
      </div>
    </div>
    <div v-if="showPlayer" class="cm-music-player">
      <div class="cm-music-player-info">
        <img v-if="nowCover" :src="nowCover" alt="">
        <img v-else alt="">
        <div class="cm-music-player-text">
          <div class="cm-music-now-name">{{ nowName }}</div>
          <div class="cm-music-now-artist">{{ nowArtist }}</div>
        </div>
      </div>
      <div class="cm-music-progress">
        <span>{{ fmtTime(currentTime) }}</span>
        <input type="range" min="0" max="100" step="0.1" v-model="progress" @input="onSeekDrag" @change="onSeekCommit">
        <span>{{ fmtTime(duration) }}</span>
      </div>
      <div class="cm-music-controls">
        <button type="button" title="上一首" @click="prev">⏮</button>
        <button type="button" class="cm-music-play" title="播放/暂停" @click="togglePlay">{{ isPlaying ? '⏸' : '▶' }}</button>
        <button type="button" title="下一首" @click="next">⏭</button>
      </div>
    </div>
  </div>`
};
