// v1.57 拆分：ChatRoom 的权限/敏感词/长度相关逻辑搬移至此
// 原 chatroom.mjs 1358-1530 行。类上保留薄包装方法（manage/media/doc/activity/http 都通过 room.xxx 调用）
// 纯函数（getMaxMsgLen/containsProfanity/isAdminSession/isSuperSession）不依赖 room；
// hasPerm/lpRawPerm 依赖 room.env.registry（LP stub）+ isSuperSession/isAdminSession

export function getMaxMsgLenImpl(session) {
  return (session && session.vip && session.vip.features && session.vip.features.maxMsgLen) || 5000;
}

export function containsProfanityImpl(text) {
  // 🔒 安全修复（W8）：先做 Unicode NFKC 归一化 + 全角/拉丁变体转半角，防全角字母（ｃｎｍ）、变体字母（cñm）绕过敏感词
  let s = String(text || "").normalize("NFKC");
  s = s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[àáâãäåÀÁÂÃÄÅ]/g, "a").replace(/[èéêëÈÉÊË]/g, "e").replace(/[ìíîïÌÍÎÏ]/g, "i")
       .replace(/[òóôõöÒÓÔÕÖ]/g, "o").replace(/[ùúûüÙÚÛÜ]/g, "u").replace(/[ñÑ]/g, "n").replace(/çÇ/g, "c")
       // 🔒 安全修复（M9）：希腊/异体字母映射回拉丁，堵住 fμck 等希腊字母插入绕过
       .replace(/[μµ]/g, "u").replace(/[ρ]/g, "p").replace(/[σς]/g, "s").replace(/[κ]/g, "k").replace(/[λ]/g, "l");
  // 🔒 安全修复（M9）：保留数字（不再剥离），配合下方 leetspeak 字符类匹配，堵住 sh1t/f0ck 等数字插入绕过
  const t = s.replace(/[^a-z0-9一-鿿]/gi, "").toLowerCase();
  const roots = [
    "草泥马", "草你妈", "操你妈", "操你妈", "肏你妈",
    "傻逼", "傻比", "煞笔", "沙比", "撒比",
    "你妈逼", "尼玛逼", "尼玛", "你妈",
    "死全家", "全家死", "去死",
    "废物", "垃圾", "杂种", "狗日", "狗娘",
    "操你", "日你", "干你",
    "他妈", "特么", "他娘",
    "滚蛋", "滚粗", "滚开",
    "吃屎", "放屁", "放狗屁",
    "脑残", "智障", "弱智",
    "妓女", "婊子", "贱人", "骚货",
    "cnm", "nmb", "sb", "qnmd",
    "wqnmlgb", "qnmlgb",
    "fuck", "shit", "bitch", "asshole",
  ];
  const homophones = {
    "艹": "操", "曹": "操", "草": "操",
    "吗": "妈", "骂": "妈", "麻": "妈",
    "笔": "逼", "碧": "逼", "璧": "逼", "比": "逼",
    "莎": "傻", "啥": "傻", "厦": "傻",
    "币": "逼",
  };
  let normalized = "";
  for (const ch of t) {
    normalized += homophones[ch] || ch;
  }
  // 🔒 安全修复（v1.33）：先对原文（同音映射前）做 root 匹配——homophones 把"草"→"操"会改写原文，
  // 使"草泥马"→"操泥马"反而漏检 root"草泥马"（M9 引入的回归）。原文直接匹配补上此漏检。
  for (const root of roots) {
    if (t.includes(root)) return true;
  }
  // 🔒 安全修复（M9）：leetspeak 归一化匹配 —— 对词根每个拉丁字母构建含常见数字变体的字符类，
  // 使 sh1t/f0ck 等插入数字的变体也命中（仅影响检测，不改变消息内容）
  const leetExtras = {a:"4", b:"8", e:"3", g:"69", i:"1", l:"1", o:"0", s:"5", t:"7", u:"0", z:"2"};
  const escRe = (c) => /[.*+?^${}()|[\]\\]/.test(c) ? "\\" + c : c;
  let pattern = "";
  for (const root of roots) {
    let p = "";
    for (const ch of root) {
      p += /[a-z]/.test(ch) ? "[" + ch + (leetExtras[ch] || "") + "]" : escRe(ch);
    }
    pattern += (pattern ? "|" : "") + p;
  }
  if (pattern && new RegExp(pattern, "i").test(normalized)) return true;
  for (const root of roots) {
    if (normalized.includes(root)) return true;
  }
  return false;
}

// 管理员判定：支持自定义红/青/金边超管标签（不只认 tag 字符串，"金边红大佬"等也可）
export function isAdminSessionImpl(session) {
  return session.tag === "red" || session.tag === "cyan" ||
         session.tagColor === "red" || session.tagColor === "cyan" ||
         session.tagBorder === "gold";
}

// 🧪 v1.49 超管判定：金色边框标签（区别于普通管理员红/青标签）
export function isSuperSessionImpl(session) {
  return !!(session && session.tagBorder === "gold");
}

// 🧪 v1.49 LuckPerms 权限解析（node 形如 chat.admin.kickUser / chat.admin.* / *）：
//   LP 显式结果优先（true/false 都覆盖基础层，故可给非管理员授权、也可禁真管理员）；
//   未定义 → 回退基础层：chat.super.*=金边超管、chat.admin.*=管理员标签、chat.user.*=已登录。
// 返回 Promise<boolean>。查询 registry /lp/check（内部无鉴权端点，仅 DO stub 直连，不暴露 HTTP）。
export async function hasPermImpl(room, session, node) {
  let name = session && session.name;
  if (name) {
    try {
      let rid = room.env.registry.idFromName("global");
      let stub = room.env.registry.get(rid);
      let r = await stub.fetch("https://dummy-url/lp/check?name=" + encodeURIComponent(name) + "&node=" + encodeURIComponent(node));
      let d = await r.json();
      if (d && typeof d.result === "boolean") return d.result;
    } catch (e) {}
  }
  if (node.startsWith("chat.super.")) return isSuperSessionImpl(session);
  if (node.startsWith("chat.admin.")) return isAdminSessionImpl(session);
  if (node.startsWith("chat.user.")) return !!name && !!(session && session.authenticated);
  return false;
}

// 🧪 v1.49 LP 辅助：查询用户对节点的显式权限结果（true/false/null），
// 不回退 session 基础层 —— 供 /do-kick、/do-kick-all 等无 session 上下文的管理端点
// （null = LP 未定义，由调用方决定：管理端点已做 admin 鉴权，故放行）
export async function lpRawPermImpl(room, name, node) {
  if (!name) return null;
  try {
    let rid = room.env.registry.idFromName("global");
    let stub = room.env.registry.get(rid);
    let r = await stub.fetch("https://dummy-url/lp/check?name=" + encodeURIComponent(name) + "&node=" + encodeURIComponent(node));
    let d = await r.json();
    if (d && (d.result === true || d.result === false)) return d.result;
    return null;
  } catch (e) { return null; }
}
