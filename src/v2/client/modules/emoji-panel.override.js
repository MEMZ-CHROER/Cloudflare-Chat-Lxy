// v2 emoji panel override — emoji picker for chat
import { state } from "../store.js";

const EMOJI_LIST = [
  "😀", "😃", "😄", "😁", "😆", "😅",
  "😂", "🙂", "🙃", "😔", "😬", "😢",
  "😭", "😞", "😝", "😚", "😊", "😇",
  "😉", "😍", "😘", "😗", "😟", "😣",
  "😤", "😥", "😮", "😯", "😰", "😱",
  "😲", "🤓", "🤔", "😐", "😑", "😒",
  "🙄", "😦", "😧", "😨", "😩", "😪",
  "😫", "😴", "😵", "😶", "😷", "😸",
  "😺", "😻", "😼", "😽", "🙀", "🙁",
  "🙅", "🙆", "🙇", "🙈", "🙉", "🙊",
  "👍", "👎", "👏", "👊", "👌", "👐",
  "👋", "👇", "👆", "💪", "👍️",
  "😌", "😛", "😜", "😞️", "💋",
  "💒", "💓", "💔", "💕", "💖", "💗",
  "🎉", "🎊", "🎋", "🎌", "🎍", "🎎",
  "🎏", "🎐", "🎑", "🎒", "🎓",
  "❤️", "💔", "💕", "💖", "💗", "💘",
  "💙", "💚", "💛", "💜", "💝", "💞",
  "💟", "💑", "💌",
  "🐍", "🐶", "🐱", "🐯", "🐰", "🐷",
  "🚀", "🚗", "💨", "✈️", "🚲", "🚴",
  "🎨", "🎵", "🎯", "🏀", "🎮", "🎧",
  "🎩", "🎪", "📱", "📷", "💻", "💽",
  "☀️", "🌤️", "🌥", "🌦", "🌧",
  "🌙", "🌚", "🌛", "🌜", "🌝", "🌞",
  "☀️", "☁️", "⚡", "⛄", "⛶",
  "🌅", "🌆", "🌇", "🌈", "🌊", "🌋",
  "🌌", "🌍", "🌎", "🌏", "🌐", "🌑",
  "🌒", "🌓", "🌔", "🌕", "🌖", "🌗",
  "🌘", "🌟", "🌠", "🌡", "🌢",
];

export function toggleEmojiPanel() {
  let panel = document.getElementById("v2-emoji-panel");
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement("div");
  panel.id = "v2-emoji-panel";
  panel.className = "v2-emoji-panel";

  const grid = document.createElement("div");
  grid.className = "v2-emoji-grid";
  EMOJI_LIST.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "v2-emoji-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      const input = document.getElementById("v2-msg-input");
      if (input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
        input.setSelectionRange(start + emoji.length, start + emoji.length);
        input.focus();
      }
      panel.remove();
    });
    grid.appendChild(btn);
  });

  panel.appendChild(grid);
  document.getElementById("v2-input-area")?.appendChild(panel);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener("click", function handler(e) {
      if (!panel.contains(e.target)) {
        panel.remove();
        document.removeEventListener("click", handler);
      }
    });
  }, 100);
}

window.__v2_toggleEmoji = toggleEmojiPanel;
