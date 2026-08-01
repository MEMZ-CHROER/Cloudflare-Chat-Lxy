// 多语言 i18n — 词典 + 切换 + 页面文案刷新
// 使用：HTML 元素加 data-i18n="key"；JS 动态文案用 t("key")

export const LANG_KEY = "lang";

const dict = {
  zh: {
    login: "登录",
    register: "注册",
    skipLogin: "跳过，直接进入聊天",
    send: "发送",
    settings: "设置",
    checkingAuth: "正在验证登录状态...",
    loginIng: "登录中...",
    loginOk: "登录成功",
    loginFailed: "登录失败",
    registerIng: "注册中...",
    registerMinLen: "密码至少6个字符",
    networkError: "网络错误",
    pleaseFill: "请填写用户名和密码",
    username: "用户名",
    password: "密码",
    language: "语言",
    close: "关闭",
    save: "保存",
    cancel: "取消",
    confirm: "确认",
    apply: "应用",
    enterRoom: "进入聊天室",
    roomPlaceholder: "输入房间名，回车进入",
    // 设置面板
    bgOpacity: "背景透明度",
    bgBlur: "磨砂程度",
    uiColor: "界面色调",
    customWallpaper: "自定义壁纸",
    videoWallpaper: "视频壁纸",
    restoreRandom: "恢复随机",
    cancelWallpaper: "取消壁纸",
    restoreDefault: "恢复默认",
    wallpaperHint: "设置自定义图片壁纸，点击\"恢复随机\"返回随机背景。",
    videoHint: "设置视频动态壁纸，视频将循环静音播放。",
    wallpaperUrl: "图片 URL",
    videoUrl: "视频 URL",
    uploadImage: "上传本地图片",
    uploadVideo: "上传本地视频",
  },
  en: {
    login: "Login",
    register: "Register",
    skipLogin: "Skip, enter as guest",
    send: "Send",
    settings: "Settings",
    checkingAuth: "Verifying login...",
    loginIng: "Logging in...",
    loginOk: "Login successful",
    loginFailed: "Login failed",
    registerIng: "Registering...",
    registerMinLen: "Password must be at least 6 characters",
    networkError: "Network error",
    pleaseFill: "Please enter username and password",
    username: "Username",
    password: "Password",
    language: "Language",
    close: "Close",
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    apply: "Apply",
    enterRoom: "Enter chat room",
    roomPlaceholder: "Type a room name, press Enter",
    bgOpacity: "Background opacity",
    bgBlur: "Frosted blur",
    uiColor: "UI tint",
    customWallpaper: "Custom wallpaper",
    videoWallpaper: "Video wallpaper",
    restoreRandom: "Restore random",
    cancelWallpaper: "Cancel wallpaper",
    restoreDefault: "Restore default",
    wallpaperHint: "Set a custom image wallpaper. Click \"Restore random\" to go back.",
    videoHint: "Set a looping muted video wallpaper.",
    wallpaperUrl: "Image URL",
    videoUrl: "Video URL",
    uploadImage: "Upload local image",
    uploadVideo: "Upload local video",
  }
};

export function getLang() {
  return localStorage.getItem(LANG_KEY) || "zh";
}

export function setLang(l) {
  l = l === "en" ? "en" : "zh";
  localStorage.setItem(LANG_KEY, l);
  applyI18n();
  document.documentElement.setAttribute("lang", l);
}

export function t(key) {
  const lang = getLang();
  const d = dict[lang] || dict.zh;
  return d[key] !== undefined ? d[key] : (dict.zh[key] !== undefined ? dict.zh[key] : key);
}

// 刷新页面中所有 [data-i18n] 元素的文案
export function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  // 占位符支持 data-i18n-placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  // title 支持 data-i18n-title
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  document.documentElement.setAttribute("lang", getLang());
}
