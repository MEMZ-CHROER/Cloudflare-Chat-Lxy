// v2 lottery override — simple random draw (backup if API not available)
import { state } from "./store.js";
import { showToast, showSuccess, showError } from "./toast.override.js";
import { escapeHtml } from "../renderers.override.js";

const PRIZES = [
  { name: "空气", icon: "💨", rarity: "common", weight: 40 },
  { name: "小积分", icon: "🪙", rarity: "common", weight: 30 },
  { name: "中积分", icon: "💰", rarity: " uncommon", weight: 20 },
  { name: "大积分", icon: "💎", rarity: "rare", weight: 8 },
  { name: "超级积分", icon: "👑", rarity: "epic", weight: 1.5 },
  { name: "传说积分", icon: "🌟", rarity: "legendary", weight: 0.5 },
];

export function simpleLottery() {
  const totalWeight = PRIZES.reduce((s, p) => s + p.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const prize of PRIZES) {
    rand -= prize.weight;
    if (rand <= 0) return prize;
  }
  return PRIZES[0];
}

window.__v2_simpleLottery = simpleLottery;
