// v2 keywords override — sensitive word filtering (client-side preview)
import { state } from "../store.js";

const BLOCKED_PATTERNS = [
  /傻逼/i, /草泥马/i, /操你妈/i, /日你娘/i, /干你妹/i,
  /他妈的/i, /操/i, /肏/i, /屌/i, /jb/i, /j8/i,
  /tmd/i, /tm/i, /cnm/i,
];

export function filterMessage(text) {
  if (!text) return { filtered: false, text };

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { filtered: true, text: "[消息包含违规内容]" };
    }
  }
  return { filtered: false, text };
}

export function shouldBlock(text) {
  return filterMessage(text).filtered;
}

window.__v2_filterMessage = filterMessage;
