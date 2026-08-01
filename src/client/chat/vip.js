// VIP/TAG 系统
export const TAG_COLORS = {
  red: "#e74c3c", blue: "#3498db", green: "#2ecc71",
  purple: "#9b59b6", pink: "#e91e63", cyan: "#00bcd4",
  gray: "#95a5a6", orange: "#e67e22",
  yellow: "#ffc107", teal: "#009688", indigo: "#3f51b5",
  brown: "#795548", lime: "#cddc39", deeporange: "#ff5722",
  rose: "#ff80ab", crimson: "#dc143c", coral: "#ff7043",
  gold: "#ffd700", amber: "#ffbf00", forest: "#228b22",
  seagreen: "#2e8b57", turquoise: "#40e0d0", steel: "#4682b4",
  royalblue: "#4169e1", mediumpurple: "#9370db", darkviolet: "#9400d3",
  chocolate: "#d2691e", olive: "#808000", firebrick: "#b22222",
  slateblue: "#6a5acd", darkcyan: "#008b8b", mediumseagreen: "#3cb371",
  indianred: "#cd5c5c", cadetblue: "#5f9ea0"
};

export function getVipLevel(tag) {
  if (!tag) return null;
  var m = tag.match(/^[Vv][Ii][Pp](\d+)$/);
  if (m) {
    var n = parseInt(m[1], 10);
    if (n >= 1 && n <= 10) return { id: "vip" + n, tier: n, label: "VIP" + n };
  }
  var lower = tag.toLowerCase();
  if (lower === "vip+") return { id: "vip+", tier: 11, label: "VIP+" };
  if (lower === "mvp")  return { id: "mvp",  tier: 12, label: "MVP" };
  return null;
}

export function getVipColor(vip) {
  if (!vip) return null;
  if (vip.tier <= 3) return "#e67e22";
  if (vip.tier <= 6) return "#3498db";
  if (vip.tier <= 9) return "#9b59b6";
  if (vip.tier === 10) return "#e74c3c";
  return "#f1c40f";
}

export function createVipBadge(vip) {
  if (!vip) return null;
  var badge = document.createElement("span");
  badge.className = "vip-badge";
  badge.textContent = vip.label;
  var c = getVipColor(vip);
  if (c) badge.style.background = c;
  badge.title = vip.label + t(" 用户");
  return badge;
}
