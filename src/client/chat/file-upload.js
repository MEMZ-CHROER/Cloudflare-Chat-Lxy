// 文件上传：按钮 + 选择器 + 读取进度（v1.41 模块化拆分自 core.js）
import { state, t, showError } from './state.js';
import { showUploadProgress, hideUploadProgress, attachReply } from './upload.js';

export function initFileUpload() {
  let filePicker = document.querySelector("#file-picker");
  document.querySelector("#file-btn").addEventListener("click", () => filePicker.click());

  filePicker.addEventListener("change", async () => {
    let file = filePicker.files[0];
    if (!file || !state.currentWebSocket) return;
    if (file.size > 15 * 1024 * 1024) { showError(t("文件过大，上限 15MB")); filePicker.value = ""; return; }
    let reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) { let pct = Math.round((e.loaded / e.total) * 100); showUploadProgress(pct, t("正在读取文件... ") + pct + "%"); }
    };
    reader.onload = () => {
      showUploadProgress(100, t("正在上传..."));
      let fileMsg = attachReply({ type: "file", data: reader.result, fileName: file.name, fileType: file.type || "application/octet-stream", fileSize: file.size, channel: state.currentChannel });
      state.currentWebSocket.send(JSON.stringify(fileMsg));
      hideUploadProgress();
      filePicker.value = "";
    };
    reader.onerror = () => { showError(t("文件读取失败")); hideUploadProgress(); filePicker.value = ""; };
    reader.readAsDataURL(file);
  });
}
