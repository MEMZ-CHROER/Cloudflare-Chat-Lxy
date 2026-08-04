// 附件发送共享工具：上传进度条 + 回复引用附加（v1.41 模块化拆分自 core.js）
import { state } from './state.js';
import { cancelReply } from './ui.js';

// 上传进度条（图片/文件共用）
export function showUploadProgress(pct, statusText) {
  let bar = document.getElementById("upload-progress");
  let fill = document.getElementById("upload-progress-bar");
  let st = document.getElementById("upload-status");
  if (!bar || !fill || !st) return;
  bar.style.display = "block";
  fill.style.width = Math.min(100, pct) + "%";
  st.style.display = "block";
  st.textContent = statusText || "";
}

export function hideUploadProgress() {
  setTimeout(() => {
    let bar = document.getElementById("upload-progress");
    let st = document.getElementById("upload-status");
    if (bar) bar.style.display = "none";
    if (st) st.style.display = "none";
  }, 500);
}

// 给附件消息附加回复引用（有回复目标时）并清除回复状态
export function attachReply(msg) {
  if (state.replyTarget) {
    msg.reply = { name: state.replyTarget, text: state.replyText || "", id: state.replyId || "" };
    cancelReply();
  }
  return msg;
}
