// v2 image upload override — drag & drop image upload
import { state } from "./store.js";
import { showToast } from "./toast.override.js";

export function initImageUpload() {
  const inputArea = document.getElementById("v2-input-area");
  if (!inputArea) return;

  // Drag and drop zone
  inputArea.addEventListener("dragover", e => {
    e.preventDefault();
    inputArea.classList.add("v2-drag-over");
  });
  inputArea.addEventListener("dragleave", () => {
    inputArea.classList.remove("v2-drag-over");
  });
  inputArea.addEventListener("drop", async e => {
    e.preventDefault();
    inputArea.classList.remove("v2-drag-over");
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        await handleImageDrop(file);
      }
    }
  });

  // Upload button
  const uploadBtn = document.createElement("button");
  uploadBtn.id = "v2-upload-btn";
  uploadBtn.className = "v2-upload-btn";
  uploadBtn.textContent = "📎";
  uploadBtn.title = "上传文件";
  uploadBtn.addEventListener("click", triggerUpload);
  inputArea.appendChild(uploadBtn);
}

async function handleImageDrop(file) {
  const url = await uploadToStorage(file);
  if (url && state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: "image", url }));
  }
}

async function uploadToStorage(file) {
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
    if (data.url) return data.url;
    showToast(data.error || "上传失败", "error");
    return null;
  } catch (e) {
    showToast("上传失败: " + e.message, "error");
    return null;
  }
}

function triggerUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadToStorage(file);
    if (url && state.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: "image", url }));
    }
  };
  input.click();
}

window.__v2_initImageUpload = initImageUpload;
