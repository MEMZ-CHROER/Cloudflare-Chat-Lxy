// v2 ICCO overlay — INCOMING CONNECTION animation effect
import { state } from "../store.js";

let _active = false;
let _animFrame = null;
let _canvas = null;
let _ctx = null;

export function triggerIccoEffect() {
  if (_active) return;
  _active = true;
  document.body.style.overflow = "hidden";
  showOverlay();
}

function showOverlay() {
  // Remove existing
  const existing = document.getElementById("v2-icco-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "v2-icco-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;";

  const canvas = document.createElement("canvas");
  canvas.id = "v2-icco-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = "width:100%;height:100%;";
  overlay.appendChild(canvas);

  // Scanline bars
  const topBar = document.createElement("div");
  topBar.id = "v2-icco-top-bar";
  topBar.style.cssText = "position:absolute;top:0;left:0;right:0;height:0;background:#000;z-index:1;";
  overlay.appendChild(topBar);

  const bottomBar = document.createElement("div");
  bottomBar.id = "v2-icco-bottom-bar";
  bottomBar.style.cssText = "position:absolute;bottom:0;left:0;right:0;height:0;background:#000;z-index:1;";
  overlay.appendChild(bottomBar);

  document.body.appendChild(overlay);
  _canvas = canvas;
  _ctx = canvas.getContext("2d");

  // Draw title
  _ctx.fillStyle = "#fff";
  _ctx.font = "bold 48px monospace";
  _ctx.textAlign = "center";
  _ctx.fillText("INCOMING CONNECTION", canvas.width / 2, canvas.height / 2 - 40);

  _ctx.font = "18px monospace";
  _ctx.fillStyle = "#aaa";
  _ctx.fillText("External unsyndicated UDP traffic on port 22", canvas.width / 2, canvas.height / 2 + 20);
  _ctx.fillText("Logging all activity to ~/log", canvas.width / 2, canvas.height / 2 + 50);

  // Blink effect
  let blinkOn = true;
  let blinkCount = 0;
  const blinkInterval = setInterval(function() {
    if (blinkCount >= 10) {
      clearInterval(blinkInterval);
      blinkInterval = null;
    }
    blinkOn = !blinkOn;
    overlay.style.opacity = blinkOn ? "1" : "0.3";
    blinkCount++;
  }, 100);

  // Animate bars
  let barHeight = 0;
  const maxBarHeight = 60;
  _animFrame = requestAnimationFrame(function animate() {
    if (!_active) return;
    if (barHeight < maxBarHeight) {
      barHeight += 3;
      topBar.style.height = barHeight + "px";
      bottomBar.style.height = barHeight + "px";
      _animFrame = requestAnimationFrame(animate);
    } else {
      // Fade out after 6 seconds
      setTimeout(function() {
        fadeOut(overlay);
      }, 6000);
    }
  });
  _animFrame = requestAnimationFrame(animate);
}

function fadeOut(overlay) {
  let opacity = 1;
  const fadeInterval = setInterval(function() {
    opacity -= 0.05;
    if (opacity <= 0) {
      clearInterval(fadeInterval);
      removeOverlay();
    } else {
      overlay.style.opacity = opacity;
    }
  }, 20);
}

function removeOverlay() {
  const overlay = document.getElementById("v2-icco-overlay");
  if (overlay) overlay.remove();
  _active = false;
  _canvas = null;
  _ctx = null;
  document.body.style.overflow = "";
}

export function closeIcco() {
  if (!_active) return;
  _active = false;
  if (_animFrame) cancelAnimationFrame(_animFrame);
  removeOverlay();
}

window.__v2_triggerIcco = triggerIccoEffect;
