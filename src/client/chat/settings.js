// 设置面板 — 背景透明度 / 磨砂程度 / 界面色调 / 自定义壁纸 / 视频壁纸
import { showError, showInfo } from './state.js';

const BG_TINT_KEY = "bgTint";
const BG_BLUR_KEY = "bgBlur";
const UI_COLOR_KEY = "uiColor";
const WALLPAPER_KEY = "customWallpaper";
const VIDEO_KEY = "customVideo";

// ---- 背景透明度 ----
export function applyBgTint(value) {
  let n = Number(value);
  let v = isNaN(n) ? 1 : Math.max(0, Math.min(1, n));
  document.body.style.setProperty("--bg-tint", String(v));
  const valEl = document.getElementById("bg-opacity-value");
  const sliderEl = document.getElementById("bg-opacity-slider");
  if (valEl) valEl.textContent = Math.round(v * 100) + "%";
  if (sliderEl) sliderEl.value = Math.round(v * 100);
  return v;
}

// ---- 磨砂程度 ----
export function applyBgBlur(value) {
  let n = Number(value);
  let v = isNaN(n) ? 18 : Math.max(0, Math.min(30, n));
  document.body.style.setProperty("--frosted-blur", `blur(${v}px)`);
  const valEl = document.getElementById("bg-blur-value");
  const sliderEl = document.getElementById("bg-blur-slider");
  if (valEl) valEl.textContent = v + "px";
  if (sliderEl) sliderEl.value = v;
  return v;
}

// ---- 界面色调 ----
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function applyUiColor(hex) {
  if (!hex) { resetUiColor(); return; }
  const rgb = hexToRgb(hex);
  if (!rgb) { showError("无效的颜色值"); return; }
  document.body.style.setProperty("--frosted-r", String(rgb.r));
  document.body.style.setProperty("--frosted-g", String(rgb.g));
  document.body.style.setProperty("--frosted-b", String(rgb.b));
  const resetBtn = document.getElementById("color-reset-btn");
  if (resetBtn) resetBtn.style.display = "";
  localStorage.setItem(UI_COLOR_KEY, hex);
}

function resetUiColor() {
  localStorage.removeItem(UI_COLOR_KEY);
  document.body.style.removeProperty("--frosted-r");
  document.body.style.removeProperty("--frosted-g");
  document.body.style.removeProperty("--frosted-b");
  const resetBtn = document.getElementById("color-reset-btn");
  if (resetBtn) resetBtn.style.display = "none";
  // 恢复颜色选择器为当前实际值
  const colorInput = document.getElementById("ui-color-input");
  if (colorInput) {
    const cs = getComputedStyle(document.body);
    const r = cs.getPropertyValue("--frosted-r").trim();
    const g = cs.getPropertyValue("--frosted-g").trim();
    const b = cs.getPropertyValue("--frosted-b").trim();
    colorInput.value = rgbToHex(+r || 255, +g || 255, +b || 255);
  }
}

// ---- 自定义壁纸 ----
export function applyWallpaper(url) {
  if (!url) { restoreRandomWallpaper(); return; }
  document.body.style.setProperty("--site-bg-image", `url("${url}")`);
  // 取消视频壁纸（互斥）
  if (document.body.classList.contains("video-bg")) cancelVideoWallpaper();
  const cancelBtn = document.getElementById("wallpaper-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "";
  localStorage.setItem(WALLPAPER_KEY, url);
}

function restoreRandomWallpaper() {
  localStorage.removeItem(WALLPAPER_KEY);
  const cancelBtn = document.getElementById("wallpaper-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "none";
  const urlInput = document.getElementById("wallpaper-url-input");
  if (urlInput) urlInput.value = "";
  document.body.style.removeProperty("--site-bg-image");
  localStorage.removeItem("ff-bg-url");
  localStorage.removeItem("ff-bg-ts");
  window.location.reload();
}

// ---- 视频壁纸 ----
export function applyVideoWallpaper(url) {
  if (!url) { cancelVideoWallpaper(); return; }
  const video = document.getElementById("video-wallpaper");
  if (!video) return;
  video.src = url;
  video.style.display = "";
  document.body.classList.add("video-bg");
  // 互斥：取消自定义图片壁纸
  if (localStorage.getItem(WALLPAPER_KEY)) {
    localStorage.removeItem(WALLPAPER_KEY);
    const wpCancel = document.getElementById("wallpaper-cancel-btn");
    if (wpCancel) wpCancel.style.display = "none";
  }
  const cancelBtn = document.getElementById("video-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "";
  localStorage.setItem(VIDEO_KEY, url);
  video.play().catch(() => {});
}

export function cancelVideoWallpaper() {
  const video = document.getElementById("video-wallpaper");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.style.display = "none";
  }
  document.body.classList.remove("video-bg");
  const cancelBtn = document.getElementById("video-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "none";
  const urlInput = document.getElementById("video-url-input");
  if (urlInput) urlInput.value = "";
  localStorage.removeItem(VIDEO_KEY);
}

// ---- 面板开闭 ----
export function openSettings() {
  document.getElementById("settings-overlay").classList.add("show");
  // 同步当前值到控件
  const tint = getComputedStyle(document.body).getPropertyValue("--bg-tint").trim();
  applyBgTint(tint === "" ? 1 : parseFloat(tint));
  const blurVal = localStorage.getItem(BG_BLUR_KEY);
  applyBgBlur(blurVal === null ? 18 : blurVal);
  // 同步壁纸输入框
  const wpUrl = document.getElementById("wallpaper-url-input");
  if (wpUrl) wpUrl.value = localStorage.getItem(WALLPAPER_KEY) || "";
  const vidUrl = document.getElementById("video-url-input");
  if (vidUrl) vidUrl.value = localStorage.getItem(VIDEO_KEY) || "";
  // 同步颜色选择器
  const colorInput = document.getElementById("ui-color-input");
  if (colorInput) {
    const saved = localStorage.getItem(UI_COLOR_KEY);
    if (saved) colorInput.value = saved;
    else {
      const cs = getComputedStyle(document.body);
      const r = cs.getPropertyValue("--frosted-r").trim();
      const g = cs.getPropertyValue("--frosted-g").trim();
      const b = cs.getPropertyValue("--frosted-b").trim();
      colorInput.value = rgbToHex(+r || 255, +g || 255, +b || 255);
    }
  }
}

export function closeSettings() {
  document.getElementById("settings-overlay").classList.remove("show");
}

// ---- 初始化 ----
export function initSettings() {
  // 恢复透明度
  const savedTint = localStorage.getItem(BG_TINT_KEY);
  applyBgTint(savedTint === null ? 1 : savedTint);

  // 恢复磨砂程度
  const savedBlur = localStorage.getItem(BG_BLUR_KEY);
  applyBgBlur(savedBlur === null ? 18 : savedBlur);

  // 恢复界面色调
  const savedColor = localStorage.getItem(UI_COLOR_KEY);
  if (savedColor) applyUiColor(savedColor);

  // 恢复自定义壁纸
  const savedWp = localStorage.getItem(WALLPAPER_KEY);
  if (savedWp) {
    document.body.style.setProperty("--site-bg-image", `url("${savedWp}")`);
    const cancelBtn = document.getElementById("wallpaper-cancel-btn");
    if (cancelBtn) cancelBtn.style.display = "";
  }

  // 恢复视频壁纸
  const savedVideo = localStorage.getItem(VIDEO_KEY);
  if (savedVideo) {
    const video = document.getElementById("video-wallpaper");
    if (video) {
      video.src = savedVideo;
      video.style.display = "";
      document.body.classList.add("video-bg");
      const cancelBtn = document.getElementById("video-cancel-btn");
      if (cancelBtn) cancelBtn.style.display = "";
      video.play().catch(() => {});
    }
  }

  // ---- 绑定事件 ----
  // 透明度滑块
  const tintSlider = document.getElementById("bg-opacity-slider");
  if (tintSlider) {
    tintSlider.addEventListener("input", (e) => {
      const v = applyBgTint(e.target.value / 100);
      localStorage.setItem(BG_TINT_KEY, String(v));
    });
  }

  // 磨砂滑块
  const blurSlider = document.getElementById("bg-blur-slider");
  if (blurSlider) {
    blurSlider.addEventListener("input", (e) => {
      const v = applyBgBlur(e.target.value);
      localStorage.setItem(BG_BLUR_KEY, String(v));
    });
  }

  // 界面色调
  const colorInput = document.getElementById("ui-color-input");
  if (colorInput) {
    colorInput.addEventListener("input", (e) => {
      applyUiColor(e.target.value);
    });
  }
  const colorResetBtn = document.getElementById("color-reset-btn");
  if (colorResetBtn) {
    colorResetBtn.addEventListener("click", () => {
      resetUiColor();
      showInfo("已恢复默认色调");
    });
  }

  // 自定义壁纸 URL
  const wpUrlBtn = document.getElementById("wallpaper-url-btn");
  if (wpUrlBtn) {
    wpUrlBtn.addEventListener("click", () => {
      const url = document.getElementById("wallpaper-url-input").value.trim();
      if (!url) { showError("请输入图片 URL"); return; }
      applyWallpaper(url);
      showInfo("壁纸已应用");
    });
  }

  // 自定义壁纸文件
  const wpFileBtn = document.getElementById("wallpaper-file-btn");
  const wpFileInput = document.getElementById("wallpaper-file-input");
  if (wpFileBtn && wpFileInput) {
    wpFileBtn.addEventListener("click", () => wpFileInput.click());
    wpFileInput.addEventListener("change", () => {
      const file = wpFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyWallpaper(reader.result);
        showInfo("本地图片壁纸已应用");
      };
      reader.readAsDataURL(file);
    });
  }

  // 恢复随机壁纸
  const wpCancelBtn = document.getElementById("wallpaper-cancel-btn");
  if (wpCancelBtn) {
    wpCancelBtn.addEventListener("click", restoreRandomWallpaper);
  }

  // 视频壁纸 URL
  const vidUrlBtn = document.getElementById("video-url-btn");
  if (vidUrlBtn) {
    vidUrlBtn.addEventListener("click", () => {
      const url = document.getElementById("video-url-input").value.trim();
      if (!url) { showError("请输入视频 URL"); return; }
      applyVideoWallpaper(url);
      showInfo("视频壁纸已应用");
    });
  }

  // 视频壁纸文件
  const vidFileBtn = document.getElementById("video-file-btn");
  const vidFileInput = document.getElementById("video-file-input");
  if (vidFileBtn && vidFileInput) {
    vidFileBtn.addEventListener("click", () => vidFileInput.click());
    vidFileInput.addEventListener("change", () => {
      const file = vidFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyVideoWallpaper(reader.result);
        showInfo("本地视频壁纸已应用");
      };
      reader.readAsDataURL(file);
    });
  }

  // 取消视频壁纸
  const vidCancelBtn = document.getElementById("video-cancel-btn");
  if (vidCancelBtn) {
    vidCancelBtn.addEventListener("click", () => {
      cancelVideoWallpaper();
      showInfo("已取消视频壁纸");
    });
  }
}
