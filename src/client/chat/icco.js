// 全屏 "INCOMING CONNECTION" 入侵警告覆盖层动画
// 逐行复刻 icco.exe（cooitest/OverlayForm.cs DrawFrame + Settings.cs 默认值，源自《Hacknet》）
// 使用真实素材（icco-assets.js）：CautionIcon/CautionIconBG/StripePattern 贴图 + Kremlin 字体
// 时间轴：6s 总时长 / 0.2s 淡入淡出 / 开场收尾各 0.5s 闪烁（100ms 周期 50% 占空比，整帧消失）
import {
  ICCO_ICON, ICCO_ICONBG, ICCO_STRIPE, ICCO_FONT,
  ICCO_ICON_W, ICCO_ICON_H, ICCO_STRIPE_W,
} from './icco-assets.js';

// ---- 常量（对应 cooitest Settings.cs 默认值，1080p 基准） ----
const ICCO_DURATION = 6;          // 动画总时长（秒）
const ICCO_FADE = 0.2;            // 淡入/淡出时长（秒）
const ICCO_BAR_MAX = 120;         // 黑条最大高度（px，1080p 基准）
const ICCO_CENTER_W = 700;        // 中央排版区宽（px）
const ICCO_STRIPE_H = 24;         // 斜纹高度（px）
const ICCO_STRIPE_SPEED = 1.0;    // 斜纹滚动速度（贴图宽/秒）
const ICCO_BLINK_PERIOD = 0.1;    // 闪烁周期（秒）
const ICCO_BLINK_ON = 0.5;        // 闪烁占空比
const ICCO_TITLE = "INCOMING CONNECTION";
const ICCO_DETAIL = "External unsyndicated UDP traffic on port 22\nLogging all activity to ~/log";
const ICCO_SCALE_BASE = 1080;     // 分辨率缩放基准（屏幕高度 px）

let _iccoActive = false;
let _assets = null;
let _assetsLoading = null;

// ================= 素材加载 + 乘法 tint（复刻 DrawTinted：输出 = 源色 × tint/255，alpha 保留） =================
async function loadAssets() {
  if (_assets) return _assets;
  if (_assetsLoading) return _assetsLoading;
  _assetsLoading = (async () => {
    try {
      const f = new FontFace("Kremlin", "url(" + ICCO_FONT + ")");
      await f.load();
      document.fonts.add(f);
    } catch (e) { /* 字体加载失败用 fallback */ }
    const icon = await loadImg(ICCO_ICON);
    const iconBg = await loadImg(ICCO_ICONBG);
    const stripe = await loadImg(ICCO_STRIPE);
    _assets = {
      // 原版：Lerp(Red, DrawColor, 0.95+0.05*rand)，DrawColor 默认纯红 → 恒红
      iconRed: tintToDataUrl(icon, 255, 0, 0),
      // 原版：CautionSignBG tint Color.Black → 黑底板
      bgBlack: tintToDataUrl(iconBg, 0, 0, 0),
      // 原版：StripePattern tint patternColor=DrawColor → 红黑斜纹 tile
      stripeRed: tintToDataUrl(stripe, 255, 0, 0),
    };
    return _assets;
  })();
  return _assetsLoading;
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load fail"));
    img.src = src;
  });
}

function tintToDataUrl(img, r, g, b) {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (d[i] * r / 255) | 0;
      d[i + 1] = (d[i + 1] * g / 255) | 0;
      d[i + 2] = (d[i + 2] * b / 255) | 0;
    }
    ctx.putImageData(id, 0, 0);
    return c.toDataURL("image/png");
  } catch (e) {
    return null;
  }
}

// ================= 文本等比缩放（复刻 DrawLabel：min(rect.W/txtW, rect.H/txtH)，cap 2.5，左对齐垂直居中） =================
let _measureCtx = null;
function measureText(text, fontSize, fontFamily) {
  try {
    if (!_measureCtx) {
      const c = document.createElement("canvas");
      _measureCtx = c.getContext("2d");
    }
    _measureCtx.font = fontSize + "px " + fontFamily;
    return { w: _measureCtx.measureText(text).width, h: fontSize * 1.2 };
  } catch (e) {
    return { w: text.length * fontSize * 0.62, h: fontSize * 1.2 };
  }
}

function placeText(el, text, fontFamily, x, y, w, h, opacity) {
  if (w <= 0 || h <= 0) return;
  const base = fontFamily.indexOf("Consolas") >= 0 ? 10 : 24;
  const m = measureText(text, base, fontFamily);
  let scale = Math.min(w / m.w, h / m.h);
  if (scale > 2.5) scale = 2.5;
  if (scale < 0.05) scale = 0.05;
  const fs = Math.round(base * scale);
  el.style.left = x + "px";
  el.style.top = (y + (h - m.h * scale) / 2) + "px";
  el.style.fontSize = fs + "px";
  el.style.lineHeight = ((m.h * scale) / fs).toFixed(2);
  el.style.opacity = String(opacity);
}

// ================= 主入口 =================
export function applyIccoEffect() {
  if (_iccoActive) return;
  _iccoActive = true;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 分辨率自适应：s = clamp(屏幕高/1080, 0.5, 3)，所有尺寸 ×s
  const s = Math.max(0.5, Math.min(3, vh / ICCO_SCALE_BASE));
  const barMax = ICCO_BAR_MAX * s;
  const stripeMax = ICCO_STRIPE_H * s;

  // ---- DOM 骨架（黑条 → 上下斜纹 + 底板图标 + 三角图标 + 标题 + 详情） ----
  const overlay = document.createElement("div");
  overlay.id = "icco-overlay";
  overlay.style.opacity = "0";

  const bar = document.createElement("div");
  bar.className = "icco-bar";

  const stripeT = document.createElement("div");
  stripeT.className = "icco-stripe icco-stripe-top";
  const stripeB = document.createElement("div");
  stripeB.className = "icco-stripe icco-stripe-bottom";

  const mkImg = () => (typeof Image !== "undefined" ? new Image() : document.createElement("img"));
  const iconBg = mkImg();
  iconBg.className = "icco-icon-bg";
  const iconFg = mkImg();
  iconFg.className = "icco-icon";

  const title = document.createElement("div");
  title.className = "icco-title";
  title.textContent = ICCO_TITLE;
  const detail = document.createElement("div");
  detail.className = "icco-detail";
  detail.textContent = ICCO_DETAIL;

  bar.appendChild(stripeT);
  bar.appendChild(stripeB);
  bar.appendChild(iconBg);
  bar.appendChild(iconFg);
  bar.appendChild(title);
  bar.appendChild(detail);
  overlay.appendChild(bar);
  document.body.appendChild(overlay);

  // 异步加载真实素材并填充（失败保持 CSS 占位）
  loadAssets().then(a => {
    if (a.iconRed) iconFg.src = a.iconRed;
    if (a.bgBlack) iconBg.src = a.bgBlack;
    if (a.stripeRed) {
      stripeT.style.backgroundImage = "url(" + a.stripeRed + ")";
      stripeB.style.backgroundImage = "url(" + a.stripeRed + ")";
      stripeT.classList.add("icco-stripe-real");
      stripeB.classList.add("icco-stripe-real");
    }
  }).catch(() => {});

  playIccoSound();

  // ---- 生命周期 ----
  let rafId = 0;
  function cleanup() {
    document.removeEventListener("keydown", escHandler);
    cancelAnimationFrame(rafId);
    overlay.remove();
    _iccoActive = false;
  }
  function escHandler(e) {
    if (e.key !== "Escape") return;
    cleanup();
  }
  document.addEventListener("keydown", escHandler);

  // ---- 逐帧驱动（翻译 OverlayForm.DrawFrame） ----
  const start = performance.now();
  function frame(now) {
    const t = (now - start) / 1000;

    // 闪烁：开场/收尾各 0.5s，整帧消失（JS 浮点取模减 epsilon 对齐 C# float）
    const blinkT = t > ICCO_DURATION - 0.5 ? t - (ICCO_DURATION - 0.5) : t;
    const blinkOff = blinkT <= 0.5 && (blinkT % ICCO_BLINK_PERIOD) < (ICCO_BLINK_ON * ICCO_BLINK_PERIOD - 1e-9);

    // 淡入淡出：alpha（0~1）与黑条高度（0~barMax）联动
    let alpha = 1;
    let barH = barMax;
    if (t < ICCO_FADE) {
      alpha = t / ICCO_FADE;
      barH = barMax * alpha;
    } else if (t > ICCO_DURATION - ICCO_FADE) {
      const f = 1 - (t - (ICCO_DURATION - ICCO_FADE));
      alpha = f;
      barH = barMax * f;
    }

    overlay.style.opacity = (blinkOff || barH <= 0) ? "0" : "1";

    // 黑条：全屏宽垂直居中，bg rgba(0,0,0, 0.9*alpha)
    const barTop = (vh - barH) / 2;
    bar.style.top = barTop + "px";
    bar.style.height = Math.round(barH) + "px";
    bar.style.background = "rgba(0,0,0," + (0.9 * alpha).toFixed(3) + ")";

    // 上下斜纹：高度随 alpha，滚动 = t*speed*tileW*s % tileW（tileW=40 原始尺寸，无缝平铺）
    const stripeH = Math.round(stripeMax * alpha);
    stripeT.style.height = stripeH + "px";
    stripeB.style.height = stripeH + "px";
    const scroll = (t * ICCO_STRIPE_SPEED * ICCO_STRIPE_W * s) % ICCO_STRIPE_W;
    const pos = (-scroll).toFixed(1) + "px 0";
    stripeT.style.backgroundPosition = pos;
    stripeB.style.backgroundPosition = pos;

    // 中央排版区 + 图标（iconRect 外扩 30s / iconInner 内缩 4s）
    const cw = Math.min(ICCO_CENTER_W * s, vw);
    const ax = (vw - cw) / 2;                       // area.X（黑条全宽时水平居中）
    const iconW = (ICCO_ICON_W / ICCO_ICON_H) * barH; // 图标宽 = 宽高比 × 黑条高
    const icX = ax - 30 * s, icY = barTop - 30 * s;
    const icW = iconW + 60 * s, icH = barH + 60 * s;
    const inX = icX + 4 * s, inY = icY + 4 * s;
    const inW = icW - 8 * s, inH = icH - 8 * s;
    iconBg.style.left = icX + "px"; iconBg.style.top = icY + "px";
    iconBg.style.width = icW + "px"; iconBg.style.height = icH + "px";
    iconBg.style.opacity = String(alpha);
    iconFg.style.left = inX + "px"; iconFg.style.top = inY + "px";
    iconFg.style.width = inW + "px"; iconFg.style.height = inH + "px";
    iconFg.style.opacity = String(alpha);

    // 标题（textRect，恒红不随 alpha）/ 详情（detailRect，随 alpha）
    const tx = Math.max(ax, ax + inW + 8 * s - 18 * s);
    const ty = barTop + 4 * s;
    const tw = Math.max(1, cw - (icW + 8 * s) + 20 * s);
    const th = barH * 0.8;
    placeText(title, ICCO_TITLE, "Kremlin, Impact, sans-serif", tx, ty, tw, th, 1);
    const dh = barH * 0.2;
    placeText(detail, ICCO_DETAIL, "Consolas, Menlo, monospace", tx, ty + th - 27 * s, tw, dh, alpha);

    if (t > ICCO_DURATION) {
      cleanup();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

// ================= 激活音效（WebAudio 合成）：beep 提示音 + 低频轰鸣 ⊕ 噪声冲击 =================
function playIccoSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const t0 = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // beep：880Hz 方波 0.11s（窗口显示提示音）
    const beep = ctx.createOscillator();
    beep.type = "square";
    beep.frequency.value = 880;
    const beepG = ctx.createGain();
    beepG.gain.setValueAtTime(0, t0);
    beepG.gain.linearRampToValueAtTime(0.4, t0 + 0.01);
    beepG.gain.setValueAtTime(0.4, t0 + 0.09);
    beepG.gain.linearRampToValueAtTime(0, t0 + 0.11);
    beep.connect(beepG); beepG.connect(master);
    beep.start(t0); beep.stop(t0 + 0.12);

    // doomshock ⊕ brightflash：beep 结束后叠加
    const ts = t0 + 0.11;
    const doom = ctx.createOscillator();
    doom.type = "sine";
    doom.frequency.setValueAtTime(150, ts);
    doom.frequency.exponentialRampToValueAtTime(55, ts + 0.8);
    const doomG = ctx.createGain();
    doomG.gain.setValueAtTime(0.0001, ts);
    doomG.gain.exponentialRampToValueAtTime(0.9, ts + 0.05);
    doomG.gain.exponentialRampToValueAtTime(0.001, ts + 0.9);
    doom.connect(doomG); doomG.connect(master);
    doom.start(ts); doom.stop(ts + 0.95);

    const n = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseG = ctx.createGain();
    noiseG.gain.value = 0.22;
    noise.connect(noiseG); noiseG.connect(master);
    noise.start(ts);

    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1800);
  } catch (e) { /* 音频失败不影响动画 */ }
}
