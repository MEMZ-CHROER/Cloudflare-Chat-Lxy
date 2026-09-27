// v2 mention override — @mention system with notification
import { state } from "./store.js";

export function extractMentions(text) {
  const mentions = [];
  const regex = /@(\w+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

export function checkMention(msg) {
  if (!state.user?.name) return false;
  const text = msg.message || msg.content || "";
  return text.includes("@" + state.user.name);
}

export function renderMentionBadge(msg) {
  if (!checkMention(msg)) return null;
  const badge = document.createElement("span");
  badge.className = "v2-mention-badge";
  badge.textContent = "@";
  badge.title = "提醒消息";
  return badge;
}

// Voice recording (placeholder — needs MediaRecorder API)
export function initVoiceRecord() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.log("[v2] Voice recording not supported");
    return null;
  }

  let mediaRecorder = null;
  let audioChunks = [];

  return {
    start: async function() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.start();
      return stream;
    },
    stop: function() {
      return new Promise(resolve => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: "audio/webm" });
          mediaRecorder.stream.getTracks().forEach(t => t.stop());
          resolve(blob);
        };
        mediaRecorder.stop();
      });
    },
  };
}

window.__v2_extractMentions = extractMentions;
window.__v2_checkMention = checkMention;
