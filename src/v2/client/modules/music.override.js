// v2 music override — inline music player
import { state } from "../store.js";

let currentAudio = null;
let musicQueue = [];
let queueIndex = 0;

export function playMusic(url) {
  if (!url || !url.match(/\.(mp3|wav|ogg|m4a|webm)$/i)) {
    console.log("[v2] Invalid music URL");
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  currentAudio = new Audio(url);
  currentAudio.volume = state.musicVolume || 0.5;
  currentAudio.play().catch(e => console.log("[v2] Play failed:", e));

  const btn = document.getElementById("v2-music-btn");
  if (btn) {
    btn.textContent = "⏸";
    btn.title = "暂停";
  }
}

export function pauseMusic() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const btn = document.getElementById("v2-music-btn");
  if (btn) {
    btn.textContent = "▶";
    btn.title = "播放";
  }
}

export function toggleMusic() {
  if (currentAudio) {
    if (currentAudio.paused) playMusic(currentAudio.src);
    else pauseMusic();
  }
}

export function setMusicVolume(vol) {
  if (currentAudio) currentAudio.volume = vol;
  state.musicVolume = vol;
  localStorage.setItem("v2_music_volume", String(vol));
}

export function addToQueue(url) {
  musicQueue.push(url);
  showToast(`已添加到播放队列: ${url.substring(url.lastIndexOf("/") + 1)}`, "info");
}

export function nextTrack() {
  if (musicQueue.length === 0) return;
  queueIndex = (queueIndex + 1) % musicQueue.length;
  playMusic(musicQueue[queueIndex]);
}

export function initMusic() {
  const vol = parseFloat(localStorage.getItem("v2_music_volume") || "0.5");
  state.musicVolume = vol;

  // Create music control button
  const header = document.querySelector(".v2-header");
  if (header) {
    const btn = document.createElement("button");
    btn.id = "v2-music-btn";
    btn.className = "v2-music-btn";
    btn.textContent = "▶";
    btn.title = "音乐播放器";
    btn.addEventListener("click", toggleMusic);
    header.appendChild(btn);
  }
}

window.__v2_playMusic = playMusic;
window.__v2_pauseMusic = pauseMusic;
window.__v2_toggleMusic = toggleMusic;
