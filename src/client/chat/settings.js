// 设置面板 — 背景透明度 / 磨砂程度 / 界面色调 / 自定义壁纸 / 视频壁纸
import { showError, showInfo, setLang, getLang, applyI18n, t } from './state.js';

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
  if (!rgb) { showError(t("无效的颜色值")); return; }
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

// ---- 媒体 URL 白名单校验（防 CSS 注入 / IP 泄露到第三方）----
export function isSafeMediaUrl(url) {
  if (!url) return false;
  let s = String(url).trim();
  // 仅允许 https/http（拒绝 javascript:/data:text/html 等，且不含 CSS 逃逸字符）
  if (/^https?:\/\//i.test(s)) {
    return !/["'()\\;]/.test(s);
  }
  // 允许 data:image（排除 svg+xml）/data:video/data:audio
  if (/^data:image\/(?!svg\+xml)/i.test(s)) return true;
  if (/^data:video\//i.test(s)) return true;
  if (/^data:audio\//i.test(s)) return true;
  return false;
}

// ---- 自定义壁纸 ----
export function applyWallpaper(url) {
  if (!url) { restoreRandomWallpaper(); return; }
  // 🔒 安全修复：URL 白名单校验
  if (!isSafeMediaUrl(url)) {
    showError(t("壁纸 URL 不合法，仅支持 https/http 或 data:image"));
    return;
  }
  // 同时设置 html 和 body，确保 body::before 伪元素能取到
  const bgVal = `url("${url}")`;
  document.documentElement.style.setProperty("--site-bg-image", bgVal);
  document.body.style.setProperty("--site-bg-image", bgVal);
  // 取消视频壁纸（互斥）
  if (document.body.classList.contains("video-bg")) cancelVideoWallpaper();
  const cancelBtn = document.getElementById("wallpaper-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "";
  try {
    localStorage.setItem(WALLPAPER_KEY, url);
  } catch (e) {
    showError(t("保存失败：存储空间不足（本地图片太大），请使用图片 URL"));
  }
}

function restoreRandomWallpaper() {
  localStorage.removeItem(WALLPAPER_KEY);
  const cancelBtn = document.getElementById("wallpaper-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "none";
  const urlInput = document.getElementById("wallpaper-url-input");
  if (urlInput) urlInput.value = "";
  document.documentElement.style.removeProperty("--site-bg-image");
  document.body.style.removeProperty("--site-bg-image");
  localStorage.removeItem("ff-bg-url");
  localStorage.removeItem("ff-bg-ts");
  window.location.reload();
}

// ---- 视频壁纸 ----
export function applyVideoWallpaper(url) {
  if (!url) { cancelVideoWallpaper(); return; }
  // 🔒 安全修复：URL 白名单校验
  if (!isSafeMediaUrl(url)) {
    showError(t("视频 URL 不合法，仅支持 https/http 或 data:video"));
    return;
  }
  const video = document.getElementById("video-wallpaper");
  if (!video) return;
  video.src = url;
  video.style.display = "";
  document.body.classList.add("video-bg");
  // 互斥：取消自定义图片壁纸
  if (localStorage.getItem(WALLPAPER_KEY)) {
    localStorage.removeItem(WALLPAPER_KEY);
    document.documentElement.style.removeProperty("--site-bg-image");
    document.body.style.removeProperty("--site-bg-image");
    const wpCancel = document.getElementById("wallpaper-cancel-btn");
    if (wpCancel) wpCancel.style.display = "none";
  }
  const cancelBtn = document.getElementById("video-cancel-btn");
  if (cancelBtn) cancelBtn.style.display = "";
  try {
    localStorage.setItem(VIDEO_KEY, url);
  } catch (e) {
    showError(t("保存失败：存储空间不足（本地视频太大），请使用视频 URL"));
  }
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
  if (savedWp && isSafeMediaUrl(savedWp)) {
    const bgVal = `url("${savedWp}")`;
    document.documentElement.style.setProperty("--site-bg-image", bgVal);
    document.body.style.setProperty("--site-bg-image", bgVal);
    const cancelBtn = document.getElementById("wallpaper-cancel-btn");
    if (cancelBtn) cancelBtn.style.display = "";
  }

  // 恢复视频壁纸
  const savedVideo = localStorage.getItem(VIDEO_KEY);
  if (savedVideo && isSafeMediaUrl(savedVideo)) {
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
      showInfo(t("已恢复默认色调"));
    });
  }

  // 自定义壁纸 URL
  const wpUrlBtn = document.getElementById("wallpaper-url-btn");
  if (wpUrlBtn) {
    wpUrlBtn.addEventListener("click", () => {
      const url = document.getElementById("wallpaper-url-input").value.trim();
      if (!url) { showError(t("请输入图片 URL")); return; }
      applyWallpaper(url);
      showInfo(t("壁纸已应用"));
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
        showInfo(t("本地图片壁纸已应用"));
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
      if (!url) { showError(t("请输入视频 URL")); return; }
      applyVideoWallpaper(url);
      showInfo(t("视频壁纸已应用"));
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
        showInfo(t("本地视频壁纸已应用"));
      };
      reader.readAsDataURL(file);
    });
  }

  // 取消视频壁纸
  const vidCancelBtn = document.getElementById("video-cancel-btn");
  if (vidCancelBtn) {
    vidCancelBtn.addEventListener("click", () => {
      cancelVideoWallpaper();
      showInfo(t("已取消视频壁纸"));
    });
  }

  // 语言切换（设置面板）
  const bindLangBtn = (id, lang) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => { setLang(lang); });
  };
  bindLangBtn("lang-zh", "zh");
  bindLangBtn("lang-en", "en");

  // 主题系统（v1.38）
  initTheme();
}

// ==================== 主题系统（v1.38）====================
// 预设：classic(经典/默认) / liquid(液态玻璃) / flat(扁平化) / neon(深空霓虹) / custom(自定义)
// 与明暗模式（body.dark，main.js 控制）正交：body.theme-* 覆盖 CSS 变量即可整体换肤
const THEME_KEY = "chatTheme";
const CUSTOM_KEY = "customTheme";
const PRESET_CLASSES = ["theme-liquid", "theme-flat", "theme-neon", "theme-hacknet"];

const CUSTOM_DEFAULTS = {
  primary: "#4a6cf7",
  text: "#1f2940",
  textSecondary: "#5f6f93",
  bg: "#ffffff",
  border: "#d0d6e3",
  radius: 16,
  msgSelf: "#4a6cf7",
  msgOther: "#ffffff"
};

// hex -> rgba() 字符串（alpha 0~1）
function hexToRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// 提亮/压暗：pct>0 向白，pct<0 向黑
function shadeColor(hex, pct) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = (c) => (pct >= 0 ? Math.round(c + (255 - c) * pct) : Math.round(c * (1 + pct)));
  const r = Math.max(0, Math.min(255, mix(rgb.r)));
  const g = Math.max(0, Math.min(255, mix(rgb.g)));
  const b = Math.max(0, Math.min(255, mix(rgb.b)));
  return rgbToHex(r, g, b);
}

// 读取并校验 localStorage 自定义主题（防注入：全部 hex 白名单 + radius 夹取）
function loadCustomTheme() {
  try {
    const c = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "null");
    if (!c || typeof c !== "object") return null;
    const clean = {};
    for (const key of ["primary", "text", "textSecondary", "bg", "border", "msgSelf", "msgOther"]) {
      clean[key] = hexToRgb(c[key]) ? String(c[key]) : CUSTOM_DEFAULTS[key];
    }
    clean.radius = Math.max(4, Math.min(24, Number(c.radius) || CUSTOM_DEFAULTS.radius));
    return clean;
  } catch (e) { return null; }
}

function removeCustomThemeVars() {
  const s = document.getElementById("custom-theme-vars");
  if (s) s.remove();
}

// 注入/更新 body.custom-theme 变量（style 插 head 末尾，后声明覆盖 body.dark）
export function applyCustomThemeVars(c) {
  if (!c) { removeCustomThemeVars(); return; }
  let style = document.getElementById("custom-theme-vars");
  if (!style) {
    style = document.createElement("style");
    style.id = "custom-theme-vars";
    document.head.appendChild(style);
  }
  const radius = Math.max(4, Math.min(24, Number(c.radius) || 16));
  const p = hexToRgb(c.primary) || { r: 74, g: 108, b: 247 };
  const bg = hexToRgb(c.bg) || { r: 255, g: 255, b: 255 };
  style.textContent = `body.custom-theme{
  --primary:${c.primary};
  --primary-light:${shadeColor(c.primary, 0.25)};
  --primary-dark:${shadeColor(c.primary, -0.2)};
  --primary-rgb:${p.r},${p.g},${p.b};
  --text:${c.text};
  --text-secondary:${c.textSecondary};
  --bg:${hexToRgba(c.bg, 0.45)};
  --surface:${hexToRgba(c.bg, 0.66)};
  --surface-2:${hexToRgba(c.bg, 0.82)};
  --border:${c.border};
  --radius:${radius}px;
  --radius-sm:${Math.max(4, Math.round(radius * 0.65))}px;
  --msg-self:${c.msgSelf};
  --msg-self-text:#ffffff;
  --msg-other:${hexToRgba(c.msgOther, 0.66)};
  --msg-other-text:${c.text};
  --frosted-r:${bg.r};
  --frosted-g:${bg.g};
  --frosted-b:${bg.b};
  --frosted-a:0.5;
  --frosted-strong-a:0.72;
  --frosted-border-a:0.5;
}`;
}

// 应用主题预设（classic/liquid/flat/neon/hacknet/custom）
export function applyTheme(preset) {
  preset = ["classic", "liquid", "flat", "neon", "hacknet", "custom"].includes(preset) ? preset : "classic";
  document.body.classList.remove(...PRESET_CLASSES, "custom-theme");
  // v1.40 Hacknet：布局级主题，JS 注入节点地图 + 命令终端（非 hacknet 一律清理，幂等）
  if (preset === "hacknet") {
    import('./hacknet.js').then(m => m.applyHacknetLayout()).catch(() => {});
  } else {
    import('./hacknet.js').then(m => m.removeHacknetLayout()).catch(() => {});
  }
  if (preset === "custom") {
    document.body.classList.add("custom-theme");
    const custom = loadCustomTheme();
    if (custom) { populateCustomControls(custom); applyCustomThemeVars(custom); }
    else { populateCustomControls(CUSTOM_DEFAULTS); removeCustomThemeVars(); }
  } else if (preset !== "classic") {
    document.body.classList.add("theme-" + preset);
  }
  try { localStorage.setItem(THEME_KEY, preset); } catch (e) {}
  // 同步选择器 UI
  document.querySelectorAll("#theme-picker .theme-card").forEach(el => {
    el.classList.toggle("theme-card-active", el.dataset.theme === preset);
  });
  const customSection = document.getElementById("custom-theme-section");
  if (customSection) customSection.style.display = preset === "custom" ? "" : "none";
}

// 收集自定义控件当前值
function collectCustomControls() {
  const getVal = (id) => (document.getElementById(id) || {}).value || "";
  const radiusEl = document.getElementById("ct-radius");
  const radius = radiusEl ? Math.max(4, Math.min(24, Number(radiusEl.value) || 16)) : 16;
  return {
    primary: getVal("ct-primary") || CUSTOM_DEFAULTS.primary,
    text: getVal("ct-text") || CUSTOM_DEFAULTS.text,
    textSecondary: getVal("ct-text-secondary") || CUSTOM_DEFAULTS.textSecondary,
    bg: getVal("ct-bg") || CUSTOM_DEFAULTS.bg,
    border: getVal("ct-border") || CUSTOM_DEFAULTS.border,
    radius,
    msgSelf: getVal("ct-msg-self") || CUSTOM_DEFAULTS.msgSelf,
    msgOther: getVal("ct-msg-other") || CUSTOM_DEFAULTS.msgOther
  };
}

function saveCustomTheme(c) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c)); } catch (e) { showError(t("保存失败")); }
}

// 把自定义值填回控件
function populateCustomControls(c) {
  if (!c) c = CUSTOM_DEFAULTS;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  set("ct-primary", c.primary);
  set("ct-text", c.text);
  set("ct-text-secondary", c.textSecondary);
  set("ct-bg", c.bg);
  set("ct-border", c.border);
  set("ct-msg-self", c.msgSelf);
  set("ct-msg-other", c.msgOther);
  const radiusEl = document.getElementById("ct-radius");
  if (radiusEl) radiusEl.value = c.radius;
  const radiusVal = document.getElementById("ct-radius-value");
  if (radiusVal) radiusVal.textContent = c.radius + "px";
}

function updateCustomFromControls() {
  const c = collectCustomControls();
  saveCustomTheme(c);
  applyCustomThemeVars(c);
}

function resetCustomTheme() {
  localStorage.removeItem(CUSTOM_KEY);
  removeCustomThemeVars();
  populateCustomControls(CUSTOM_DEFAULTS);
  applyTheme("classic");
}

// 初始化主题系统（initSettings 末尾调用）
export function initTheme() {
  const custom = loadCustomTheme();
  if (custom) populateCustomControls(custom);
  applyTheme(localStorage.getItem(THEME_KEY) || "classic");

  // 绑定主题卡片点击
  document.querySelectorAll("#theme-picker .theme-card").forEach(el => {
    el.addEventListener("click", () => applyTheme(el.dataset.theme));
  });

  // 绑定自定义控件（仅当处于自定义主题时实时生效）
  ["ct-primary", "ct-text", "ct-text-secondary", "ct-bg", "ct-border", "ct-msg-self", "ct-msg-other"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => {
      if (document.body.classList.contains("custom-theme")) updateCustomFromControls();
    });
  });
  const radiusEl = document.getElementById("ct-radius");
  if (radiusEl) radiusEl.addEventListener("input", () => {
    const val = document.getElementById("ct-radius-value");
    if (val) val.textContent = radiusEl.value + "px";
    if (document.body.classList.contains("custom-theme")) updateCustomFromControls();
  });
  const resetBtn = document.getElementById("ct-reset");
  if (resetBtn) resetBtn.addEventListener("click", resetCustomTheme);
}
