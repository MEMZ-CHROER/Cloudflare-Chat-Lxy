// v2 toast override — notification toasts
const TOASTS = [];
const TOAST_DURATION = 4000;

export function showToast(message, type = "info", duration = TOAST_DURATION) {
  let container = document.getElementById("v2-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "v2-toast-container";
    container.className = "v2-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `v2-toast v2-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  TOASTS.push(toast);

  setTimeout(() => {
    toast.classList.add("v2-toast-hide");
    setTimeout(() => {
      toast.remove();
      const idx = TOASTS.indexOf(toast);
      if (idx >= 0) TOASTS.splice(idx, 1);
    }, 300);
  }, duration);
}

export function showSuccess(msg) { showToast(msg, "success"); }
export function showInfo(msg) { showToast(msg, "info"); }
export function showError(msg) { showToast(msg, "error"); }
export function showWarning(msg) { showToast(msg, "warning"); }

window.__v2_showToast = showToast;
window.__v2_showSuccess = showSuccess;
window.__v2_showError = showError;
