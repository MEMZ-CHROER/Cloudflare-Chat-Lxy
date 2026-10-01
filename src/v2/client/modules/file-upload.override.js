// v2 file upload — simplified standalone implementation
import { state } from "../store.js";
import { showToast } from "./toast.override.js";

export function initFileUpload() {
  const filePicker = document.getElementById("file-picker");
  const fileBtn = document.getElementById("files-btn");
  
  if (fileBtn) {
    fileBtn.addEventListener("click", () => {
      if (filePicker) filePicker.click();
    });
  }

  if (filePicker) {
    filePicker.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
      
      if (file.size > 15 * 1024 * 1024) {
        showToast("文件过大，上限 15MB", "error");
        filePicker.value = "";
        return;
      }

      showToast("正在上传: " + file.name, "info");
      
      try {
        // Read file as base64
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          // Send via WebSocket
          state.ws.send(JSON.stringify({
            type: "file",
            name: file.name,
            size: file.size,
            data: dataUrl
          }));
          showToast("文件发送成功: " + file.name, "success");
        };
        reader.onerror = () => {
          showToast("文件读取失败", "error");
        };
        reader.readAsDataURL(file);
      } catch (err) {
        showToast("上传失败: " + err.message, "error");
      }
      
      e.target.value = "";
    });
  }
}

window.__v2_initFileUpload = initFileUpload;
