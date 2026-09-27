// v2 vip override — VIP feature checks and UI
import { state } from "../store.js";

export function isVip() {
  return state.user?.vip || false;
}

export function getVipFeatures() {
  if (!isVip()) return [];
  return ["long-msg", "custom-avatar", "priority-send", "no-ads"];
}

export function getMaxMsgLen() {
  return isVip() ? 10000 : 5000;
}

export function checkVipFeature(feature) {
  if (!isVip()) return false;
  const features = getVipFeatures();
  return features.includes(feature);
}

export function renderVipBadge() {
  if (!isVip()) return null;
  const badge = document.createElement("span");
  badge.className = "v2-vip-badge";
  badge.textContent = "VIP";
  badge.style.cssText = "background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px;";
  return badge;
}

export function initVipUI() {
  const userInfo = document.getElementById("v2-user-info");
  if (!userInfo) return;
  const badge = renderVipBadge();
  if (badge) userInfo.appendChild(badge);
}

window.__v2_isVip = isVip;
window.__v2_getMaxMsgLen = getMaxMsgLen;
