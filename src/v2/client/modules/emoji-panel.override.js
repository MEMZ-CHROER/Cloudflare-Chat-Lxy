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
  let panel = document.getElementById("emoji-panel");
  if (panel && panel._emojiInitialized) {
    panel.remove();
    panel._emojiInitialized = false;
    return;
  }

  panel = document.createElement("div");
  panel.id = "emoji-panel";
  panel.className = "emoji-panel";
  panel._emojiInitialized = true;

  const grid = document.createElement("div");
  grid.className = "emoji-grid";
  EMOJI_LIST.forEach(emoji => {
    const btn = document.createElement("button");
    btn.className = "emoji-item";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      const input = document.getElementById("chat-input");
      if (input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
        input.setSelectionRange(start + emoji.length, start + emoji.length);
        input.focus();
      }
      panel.remove();
      panel._emojiInitialized = false;
    });
    grid.appendChild(btn);
  });

  panel.appendChild(grid);
  document.body.appendChild(panel);
  panel.classList.add("show");

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
