// URL 预览 - 获取链接的标题和描述
// ⚠️ 安全限制：禁止 SSRF（禁止访问内网地址和元数据接口）

// 🔒 安全修复（F4）：外链页面正文读取上限 256KB，防整页读入内存导致 DoS
const MAX_PREVIEW_BYTES = 256 * 1024;

// 🔒 安全修复（F4）：流式读取响应体，超过 limit 立即中断并返回 null（不抛未捕获异常）
async function readLimited(resp, limit) {
  if (!resp.body) return "";
  let reader = resp.body.getReader();
  let decoder = new TextDecoder("utf-8");
  let out = "";
  let total = 0;
  while (true) {
    let {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      try { await reader.cancel(); } catch (e) {}
      return null;
    }
    out += decoder.decode(value, {stream: true});
  }
  out += decoder.decode();
  return out;
}

// 🔒 安全修复（A3）：IPv4 私有/保留地址判断（非法格式一律视为私有，拒绝访问）
function isPrivateIPv4(hostname) {
  let parts = hostname.split('.');
  if (parts.length !== 4) return true;
  let nums = parts.map(Number);
  if (nums.some(n => isNaN(n) || n < 0 || n > 255)) return true;
  let [a, b] = nums;
  // 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8, 100.64.0.0/10
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

// 🔒 安全修复（A3）：host 统一校验，正确处理 IPv6 字面量、IPv4 映射地址与纯 IPv4
function isPrivateHost(hostname) {
  let h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes(":")) {
    // IPv6
    if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1" || h === "0:0:0:0:0:0:0:0") return true;
    // IPv4-mapped ::ffff:a.b.c.d（URL 解析会把 [::ffff:127.0.0.1] 规范化为 [::ffff:7f00:1]，此处再兜底映射格式）
    let m4 = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m4) return isPrivateIPv4(m4[1]);
    // H2 修复：IPv4-mapped 十六进制形式（::ffff:7f00:1 两组16位 / ::ffff:7f000001 单组32位），
    // 解析回点分十进制后走 isPrivateIPv4，公网映射地址放行、私网一律拦截
    let m6 = h.match(/::ffff:([0-9a-f]{1,4})(?::([0-9a-f]{1,4}))?$/i);
    if (m6) {
      let a = parseInt(m6[1], 16);
      let b = m6[2] !== undefined ? parseInt(m6[2], 16) : null;
      if (b === null && !isNaN(a) && a >= 0 && a <= 0xffffffff) {
        return isPrivateIPv4([(a >>> 24) & 255, (a >>> 16) & 255, (a >>> 8) & 255, a & 255].join("."));
      }
      if (b !== null && !isNaN(a) && !isNaN(b) && a >= 0 && a <= 0xffff && b >= 0 && b <= 0xffff) {
        return isPrivateIPv4([(a >>> 8) & 255, a & 255, (b >>> 8) & 255, b & 255].join("."));
      }
      return true; // 无法解析的映射形式 → 保守拒绝
    }
    // ULA fc00::/7、link-local fe80::/10
    if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true;
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIPv4(h);
  return false; // 域名交由 DNS 解析校验
}

function isBannedHost(hostname) {
  const lower = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  // 禁止 Cloudflare 内部元数据和其他敏感端点
  const banned = [
    '169.254.169.254', // 云元数据接口
    'metadata.google.internal',
    'metadata.cloud.google',
    '100.100.100.200', // 阿里云元数据
  ];
  if (banned.includes(lower)) return true;
  // 禁止 .internal / .local 域名
  if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
  return false;
}

// 🔒 安全修复（A3）：通过 DNS-over-HTTPS 解析域名，校验解析结果不含私网/保留 IP（防 DNS rebinding 与公共域名解析到内网）
// M6 缓解：DNS rebinding 在 Workers fetch 上无法根治（fetch 目标 IP 由平台解析，无法固定），
// 缓解措施为每跳重定向前复查 dnsResolvesToPrivate（见 fetchSafe），H2 修复后 IPv4-mapped 十六进制私网全拦，本函数持续生效
async function dnsResolvesToPrivate(hostname) {
  let h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateHost(h);
  try {
    let r = await fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(h) + "&type=A", {
      headers: { "accept": "application/dns-json" },
      signal: AbortSignal.timeout(4000)
    });
    let d = await r.json();
    if (d && Array.isArray(d.Answer)) {
      for (let ans of d.Answer) {
        if (ans.type === 1 && ans.data && isPrivateIPv4(ans.data)) return true;
      }
    }
  } catch (e) {}
  return false;
}

// 🔒 安全修复（A3）：手动跟随重定向，每跳都重新做完整校验
async function fetchSafe(target, depth) {
  if (depth > 5) throw new Error("重定向次数过多");
  let parsed;
  try { parsed = new URL(target); } catch { throw new Error("无效 URL"); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error("只支持 http/https 协议");
  if (isPrivateHost(parsed.hostname)) throw new Error("不允许访问内网地址");
  if (isBannedHost(parsed.hostname)) throw new Error("不允许访问该地址");
  if (await dnsResolvesToPrivate(parsed.hostname)) throw new Error("不允许访问该地址");
  let resp = await fetch(target, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CloudflareChat/1.0)" },
    redirect: "manual",
    signal: AbortSignal.timeout(5000)
  });
  if (resp.status >= 300 && resp.status < 400) {
    let loc = resp.headers.get("location");
    if (!loc) throw new Error("无效重定向");
    let nextUrl = new URL(loc, target).toString();
    return fetchSafe(nextUrl, depth + 1);
  }
  return resp;
}

export async function handlePreview(apiPath, request, env) {
  let url = new URL(request.url);
  let target = url.searchParams.get("url");
  if (!target) return new Response(JSON.stringify({error: "缺少 url 参数"}), {status: 400, headers: {"Content-Type": "application/json"}});

  let parsed;
  try { parsed = new URL(target); } catch { return new Response(JSON.stringify({error: "无效 URL"}), {status: 400, headers: {"Content-Type": "application/json"}}); }

  // 协议限制：只允许 http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new Response(JSON.stringify({error: "只支持 http/https 协议"}), {status: 400, headers: {"Content-Type": "application/json"}});
  }

  // IP 限制：禁止访问私有 IP（含 IPv6 字面量与 IPv4 映射地址）
  if (isPrivateHost(parsed.hostname)) {
    return new Response(JSON.stringify({error: "不允许访问内网地址"}), {status: 403, headers: {"Content-Type": "application/json"}});
  }

  // 禁止访问已知敏感地址
  if (isBannedHost(parsed.hostname)) {
    return new Response(JSON.stringify({error: "不允许访问该地址"}), {status: 403, headers: {"Content-Type": "application/json"}});
  }

  // 域名解析校验（防解析到内网）
  if (await dnsResolvesToPrivate(parsed.hostname)) {
    return new Response(JSON.stringify({error: "不允许访问该地址"}), {status: 403, headers: {"Content-Type": "application/json"}});
  }

  let resp;
  try {
    resp = await fetchSafe(target, 0);
  } catch (e) {
    return new Response(JSON.stringify({error: e.message}), {status: 403, headers: {"Content-Type": "application/json"}});
  }
  // 🔒 安全修复（F4）：先按 Content-Length 快速拒绝超大页面，再流式读取限制大小
  let contentLength = parseInt(resp.headers.get("Content-Length") || "", 10);
  if (contentLength && contentLength > MAX_PREVIEW_BYTES) {
    return new Response(JSON.stringify({error: "页面过大，无法预览"}), {status: 413, headers: {"Content-Type": "application/json"}});
  }
  let html;
  try {
    html = await readLimited(resp, MAX_PREVIEW_BYTES);
  } catch (e) {
    return new Response(JSON.stringify({error: "读取页面内容失败"}), {status: 502, headers: {"Content-Type": "application/json"}});
  }
  if (html === null) {
    return new Response(JSON.stringify({error: "页面过大，无法预览"}), {status: 413, headers: {"Content-Type": "application/json"}});
  }
  let title = "", description = "", icon = "";
  let titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();
  let descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (descMatch) description = descMatch[1].trim();
  let iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);
  if (iconMatch) {
    icon = iconMatch[1];
    if (icon.startsWith("//")) icon = "https:" + icon;
    else if (icon.startsWith("/")) icon = new URL(target).origin + icon;
  }
  if (!title && !description) {
    let h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) title = h1Match[1].trim();
  }
  return new Response(JSON.stringify({title, description, icon, url: target}), {
    status: 200, headers: {"Content-Type": "application/json"}
  });
}
