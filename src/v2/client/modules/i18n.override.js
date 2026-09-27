// v2 i18n override — internationalization support
const TRANSLATIONS = {
  zh: {
    "welcome": "欢迎",
    "login": "登录",
    "register": "注册",
    "logout": "退出",
    "username": "用户名",
    "password": "密码",
    "send": "发送",
    "cancel": "取消",
    "save": "保存",
    "close": "关闭",
    "settings": "设置",
    "search": "搜索",
    "emoji": "表情",
    "upload": "上传",
    "room": "房间",
    "channel": "频道",
    "online": "在线",
    "message": "消息",
    "typing": "正在输入...",
    "joined": "加入了房间",
    "left": "离开了房间",
    "banned": "已被封禁",
    "muted": "已被禁言",
    "error": "错误",
    "success": "成功",
    "warning": "警告",
    "info": "提示",
    "confirm": "确认",
    "delete": "删除",
    "edit": "编辑",
    "copy": "复制",
    "pin": "置顶",
    "favorite": "收藏",
    "mention": "提醒",
    "dm": "私信",
    "reply": "回复",
    "forward": "转发",
    "report": "举报",
    "admin": "管理",
    "user": "用户",
    "room_list": "房间列表",
    "join_room": "进入房间",
    "create_room": "创建房间",
    "leave_room": "离开房间",
    "room_info": "房间信息",
    "profile": "个人资料",
    "achievements": "成就",
    "settings_title": "设置",
    "theme": "主题",
    "dark": "深色",
    "light": "浅色",
    "language": "语言",
    "notifications": "通知",
    "sound": "声音",
    "font_size": "字体大小",
    "show_time": "显示时间",
    "auto_reconnect": "自动重连",
    "clear_chat": "清空聊天",
    "export_chat": "导出聊天记录",
  },
  en: {
    "welcome": "Welcome",
    "login": "Login",
    "register": "Register",
    "logout": "Logout",
    "username": "Username",
    "password": "Password",
    "send": "Send",
    "cancel": "Cancel",
    "save": "Save",
    "close": "Close",
    "settings": "Settings",
    "search": "Search",
    "emoji": "Emoji",
    "upload": "Upload",
    "room": "Room",
    "channel": "Channel",
    "online": "Online",
    "message": "Message",
  },
};

let currentLang = "zh";

export function t(key, ...args) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.zh;
  let text = dict[key] || key;
  args.forEach((arg, i) => {
    text = text.replace(new RegExp(`\\{${i}\\}`, "g"), String(arg));
  });
  return text;
}

export function setLanguage(lang) {
  if (TRANSLATIONS[lang]) {
    currentLang = lang;
    localStorage.setItem("v2_lang", lang);
    applyLanguage();
  }
}

export function initI18n() {
  const saved = localStorage.getItem("v2_lang");
  if (saved && TRANSLATIONS[saved]) currentLang = saved;
  applyLanguage();
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  // Update all translatable elements
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
}

window.__v2_t = t;
window.__v2_setLanguage = setLanguage;
window.__v2_initI18n = initI18n;
