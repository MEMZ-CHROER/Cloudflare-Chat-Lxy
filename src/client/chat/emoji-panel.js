// 表情面板：内置 emoji + 自定义表情（v1.41 模块化拆分自 core.js）
import { state, t } from './state.js';

const EMOJIS = [
  "😀","😂","🤣","😃","😄","😅","😆","😉","😊","😋",
  "😎","😍","🥰","😘","🤗","🤩","🤔","🤨","😐","😑",
  "😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫",
  "😴","😌","😛","😜","😝","🤤","😒","😓","😔","😕",
  "🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢",
  "😭","😦","😧","😨","😩","🤯","😬","😰","😱","🥵",
  "🥶","😳","🤪","😵","😡","😠","🤬",
  "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👋","🤚",
  "✋","🖐️","🖖","👏","🙌","🤲","🤝","🙏","✍️","💪",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💕",
  "💞","💓","💗","💖","💘","💝","💋","👀","🔥","⭐",
  "🎉","🎊","🎈","🎁","✨","🌟","💡","📌","✅","❌"
];

export function initEmojiPanel() {
  let emojiPanel = document.querySelector("#emoji-panel");
  EMOJIS.forEach(e => {
    let span = document.createElement("span");
    span.className = "emoji-item";
    span.textContent = e;
    span.title = e;
    span.addEventListener("click", () => {
      if (state.currentWebSocket) { state.currentWebSocket.send(JSON.stringify({ message: e, channel: state.currentChannel })); state.chatlog.scrollBy(0, 1e8); }
      emojiPanel.classList.remove("show");
    });
    emojiPanel.appendChild(span);
  });
  document.querySelector("#emoji-btn").addEventListener("click", event => { event.stopPropagation(); emojiPanel.classList.toggle("show"); });
  document.body.addEventListener("click", () => emojiPanel.classList.remove("show"), false);
  emojiPanel.addEventListener("click", event => event.stopPropagation());

  // 添加自定义表情到表情面板
  if (state.customEmoji) {
    let names = Object.keys(state.customEmoji);
    if (names.length > 0) {
      let divider = document.createElement("div");
      divider.style.cssText = "padding:4px 8px;font-size:11px;color:var(--text-secondary);border-top:1px solid var(--border);margin-top:4px;";
      divider.textContent = t("自定义");
      emojiPanel.appendChild(divider);
      names.forEach(name => {
        let span = document.createElement("span");
        span.className = "emoji-item";
        let img = document.createElement("img");
        img.src = state.customEmoji[name];
        img.style.cssText = "width:24px;height:24px;vertical-align:middle;object-fit:contain;";
        img.title = ":" + name + ":";
        span.appendChild(img);
        span.addEventListener("click", () => {
          if (state.currentWebSocket) {
            let inp = state.chatInput;
            let cursorPos = inp.selectionStart || inp.value.length;
            let textBefore = inp.value.substring(0, cursorPos);
            let textAfter = inp.value.substring(cursorPos);
            inp.value = textBefore + ":" + name + ":" + textAfter;
            inp.focus();
            inp.setSelectionRange(cursorPos + name.length + 2, cursorPos + name.length + 2);
          }
          emojiPanel.classList.remove("show");
        });
        emojiPanel.appendChild(span);
      });
    }
  }
}
