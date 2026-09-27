// v2 upload override — file/image upload via WebSocket or API
import { state } from "./store.js";
import { showToast } from "./tost.override.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "audio/webm", "audio/mpeg", "video/mp4"];

export async function uploadFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    showToast("文件过大（最大10MB）", "error");
    return null;
  }

  if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|gif|webp|mp3|wav|mp4|webm)$/i)) {
    showToast("不支持的文件类型", "error");
    return null;
  }

  const token = localStorage.getItem("chat_token") || "";
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Cookie": `token=${token}` },
      body: formData,
    });
    const data = await res.json();
    if (data.url) {
      showToast("上传成功", "success");
      return data.url;
    } else {
      showToast(data.error || "上传失败", "error");
      return null;
    }
  } catch (e) {
    showToast("上传失败: " + e.message, "error");
    return null;
  }
}

export function triggerFileUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,audio/*,video/*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadFile(file);
    if (url && state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: "image", url }));
    }
  };
  input.click();
}

window.__v2_uploadFile = uploadFile;
window.__v2_triggerFileUpload = triggerFileUpload;
