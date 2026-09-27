// v2 voice record override — voice message recording
import { state } from "../store.js";
import { showToast, showError } from "./toast.override.js";
import { attachReply } from "../upload.override.js";

export function initVoiceRecord() {
  const inputArea = document.getElementById("chatroom");
  if (!inputArea) return;

  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStart = 0;
  let voiceTimer = null;

  // Create voice button
  const voiceBtn = document.createElement("button");
  voiceBtn.id = "v2-voice-btn";
  voiceBtn.className = "v2-voice-btn";
  voiceBtn.textContent = "🎤";
  voiceBtn.title = "录音";
  voiceBtn.addEventListener("mousedown", startRecording);
  voiceBtn.addEventListener("mouseup", stopRecording);
  voiceBtn.addEventListener("touchstart", e => { e.preventDefault(); startRecording(); });
  voiceBtn.addEventListener("touchend", e => { e.preventDefault(); stopRecording(); });
  inputArea.insertBefore(voiceBtn, inputArea.firstChild);

  // Voice status indicator
  const voiceStatus = document.createElement("div");
  voiceStatus.id = "v2-voice-status";
  voiceStatus.style.cssText = "display:none;position:fixed;bottom:80px;left:16px;font-size:12px;color:#e74c3c;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:6px 12px;z-index:30;";
  voiceStatus.textContent = "正在录音... 点击 🎤 结束";
  document.body.appendChild(voiceStatus);

  function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("浏览器不支持录音", "error");
      return;
    }
    if (mediaRecorder) return;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
      mediaRecorder.start();
      recordingStart = Date.now();
      voiceBtn.classList.add("recording");
      voiceStatus.style.display = "block";
      voiceTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - recordingStart) / 1000);
        voiceStatus.textContent = `正在录音... ${sec}s`;
        if (sec >= 60) stopRecording();
      }, 1000);
    }).catch(e => {
      showToast("无法访问麦克风: " + e.message, "error");
    });
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    clearInterval(voiceTimer);
    voiceBtn.classList.remove("recording");
    voiceStatus.style.display = "none";

    const mr = mediaRecorder;
    mediaRecorder = null;
    mr.onstop = () => {
      const duration = Math.round((Date.now() - recordingStart) / 1000);
      if (recordedChunks.length === 0) return;
      if (duration < 1) { showToast("录音太短（至少1秒）", "error"); return; }
      const blob = new Blob(recordedChunks, { type: mr.mimeType || "audio/webm" });
      recordedChunks = [];

      if (blob.size > 8 * 1024 * 1024) { showToast("录音过长，请分段发送", "error"); return; }

      const reader = new FileReader();
      reader.onload = () => {
        if (state.ws?.readyState === WebSocket.OPEN) {
          const msg = attachReply({ type: "voice", data: reader.result, duration, channel: state.currentChannel || "general" });
          state.ws.send(JSON.stringify(msg));
        }
      };
      reader.readAsDataURL(blob);
    };
    try { mr.stop(); } catch {}
  }
}

window.__v2_initVoiceRecord = initVoiceRecord;
