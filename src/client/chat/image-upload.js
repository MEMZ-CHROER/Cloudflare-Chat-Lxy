// 图片上传：按钮 + 粘贴发图 + AI 快捷按钮（v1.41 模块化拆分自 core.js）
import { state, t } from './state.js';
import { showUploadProgress, hideUploadProgress, attachReply } from './upload.js';

// 压缩图片 → base64 → 发送（导出供图片选择/粘贴复用）
export async function compressAndSendImage(file) {
  if (!file || !state.currentWebSocket) return;
  showUploadProgress(0, t("正在处理图片..."));
  let img = await createImageBitmap(file);
  let maxSize = 800;
  let w = img.width, h = img.height;
  if (w > maxSize || h > maxSize) {
    if (w > h) { h = h * maxSize / w; w = maxSize; }
    else { w = w * maxSize / h; h = maxSize; }
  }
  let canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  let ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  let base64 = canvas.toDataURL("image/jpeg", 0.7);
  img.close();
  let imgMsg = attachReply({ type: "image", data: base64, channel: state.currentChannel });
  state.currentWebSocket.send(JSON.stringify(imgMsg));
  hideUploadProgress();
}

export function initImageUpload() {
  // 🤖 AI 快捷按钮：一键在输入框插入 /ai 命令并聚焦
  let aiBtn = document.querySelector("#ai-btn");
  if (aiBtn) {
    aiBtn.addEventListener("click", () => {
      if (!state.chatInput) return;
      state.chatInput.focus();
      let cur = state.chatInput.value || "";
      if (cur.trim().startsWith("/ai")) {
        state.chatInput.setSelectionRange(state.chatInput.value.length, state.chatInput.value.length);
      } else {
        state.chatInput.value = "/ai ";
        state.chatInput.setSelectionRange(4, 4);
      }
    });
  }

  let imagePicker = document.querySelector("#image-picker");
  document.querySelector("#image-btn").addEventListener("click", () => imagePicker.click());
  imagePicker.addEventListener("change", async () => {
    let file = imagePicker.files[0];
    if (!file || !state.currentWebSocket) return;
    await compressAndSendImage(file);
    imagePicker.value = "";
  });

  // 粘贴图片直接发送
  state.chatInput.addEventListener("paste", async (e) => {
    let items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        let file = item.getAsFile();
        if (file) await compressAndSendImage(file);
        break;
      }
    }
  });
}
