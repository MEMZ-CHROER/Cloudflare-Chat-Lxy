// 语音消息：点击录音，再点结束发送（v1.41 模块化拆分自 core.js）
import { state, t, showError } from './state.js';
import { attachReply } from './upload.js';

export function initVoiceRecord() {
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStart = 0;
  let voiceTimer = null;
  let voiceBtn = document.querySelector("#voice-btn");
  let voiceStatus = document.createElement("div");
  voiceStatus.id = "voice-status";
  voiceStatus.style.cssText = "display:none;position:fixed;bottom:70px;left:16px;font-size:12px;color:#e74c3c;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 12px;z-index:30;";
  voiceStatus.textContent = t("正在录音... 点击 🎤 结束");
  document.body.appendChild(voiceStatus);

  function stopRecording(send) {
    if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
    if (!mediaRecorder || mediaRecorder.state === "inactive") { mediaRecorder = null; voiceStatus.style.display = "none"; return; }
    voiceBtn.classList.remove("recording");
    let mr = mediaRecorder;
    mediaRecorder = null;
    mr.onstop = () => {
      let duration = Math.round((Date.now() - recordingStart) / 1000);
      voiceStatus.style.display = "none";
      if (!send || recordedChunks.length === 0) { recordedChunks = []; return; }
      let blob = new Blob(recordedChunks, { type: mr.mimeType || "audio/webm" });
      recordedChunks = [];
      if (duration < 1) { showError(t("录音太短（至少 1 秒）")); return; }
      if (blob.size > 8 * 1024 * 1024) { showError(t("录音过长，请分段发送")); return; }
      let reader = new FileReader();
      reader.onload = () => {
        if (state.currentWebSocket) {
          let voiceMsg = attachReply({ type: "voice", data: reader.result, duration, channel: state.currentChannel });
          state.currentWebSocket.send(JSON.stringify(voiceMsg));
        }
      };
      reader.readAsDataURL(blob);
    };
    try { mr.stop(); } catch (e) {}
  }

  voiceBtn.addEventListener("click", () => {
    if (!state.currentWebSocket) { showError(t("连接未就绪")); return; }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      stopRecording(true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showError(t("当前浏览器不支持录音")); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      recordedChunks = [];
      let mimeType = "audio/webm;codecs=opus";
      if (typeof MediaRecorder === "undefined") { showError(t("当前浏览器不支持录音")); stream.getTracks().forEach(tr => tr.stop()); return; }
      let opts = MediaRecorder.isTypeSupported(mimeType) ? { mimeType } : undefined;
      mediaRecorder = new MediaRecorder(stream, opts);
      recordingStart = Date.now();
      mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.onstop = () => { stream.getTracks().forEach(tr => tr.stop()); };
      mediaRecorder.start();
      voiceBtn.classList.add("recording");
      voiceStatus.style.display = "block";
      voiceTimer = setInterval(() => {
        let secs = Math.round((Date.now() - recordingStart) / 1000);
        voiceStatus.textContent = t("正在录音... ") + secs + "s " + t("(点击 🎤 结束)");
        if (secs >= 60) stopRecording(true); // 上限 60 秒
      }, 1000);
    }).catch(() => showError(t("麦克风权限被拒绝")));
  });
}
