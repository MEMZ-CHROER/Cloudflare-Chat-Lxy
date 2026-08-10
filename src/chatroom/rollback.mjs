// v1.57 拆分：应急回滚（_doRollback + multipart/zip 帮助函数）搬移至此
// 原 chatroom.mjs 1240-1277（_doRollback）+ 1356-1441（帮助函数）
// 仅依赖 room.env（CF_ACCOUNT_ID/CF_API_TOKEN/archive/CF_SCRIPT_NAME），与 DO 状态无耦合
// 范式：_doRollbackImpl(room, version, webSocket)；类上 _doRollback 委托

// 应急回滚：从 archive 下载指定版本代码 → 解压 → 用 Cloudflare API 重新部署当前 worker
// 仅改线上部署，不触碰 GitHub 仓库代码
export async function _doRollbackImpl(room, version, webSocket) {
  const send = (obj) => { try { webSocket.send(JSON.stringify(obj)); } catch (_) {} };
  if (!room.env.CF_ACCOUNT_ID || !room.env.CF_API_TOKEN) {
    send({error: "回滚功能未配置：缺少 CF_ACCOUNT_ID / CF_API_TOKEN 环境变量"});
    return;
  }
  let archiveId = room.env.archive.idFromName("archive");
  let archive = room.env.archive.get(archiveId);
  let dl = await archive.fetch("https://dummy-url/download?name=" + encodeURIComponent(version));
  if (!dl.ok) {
    send({error: "版本 " + version + " 不存在。请先运行 scripts/archive-latest.mjs 完成自动存档"});
    return;
  }
  let zipData = new Uint8Array(await dl.arrayBuffer());
  let files;
  try { files = unzipStore(zipData); } catch (e) {
    send({error: "版本存档解析失败（可能不是本项目 zip）"}); return;
  }
  if (!files["src/index.mjs"]) {
    send({error: "版本存档缺少入口 src/index.mjs"}); return;
  }
  let mime = buildRollbackMultipart(files, room.env);
  let scriptName = room.env.CF_SCRIPT_NAME || "cloudflare-workers-chat";
  let apiUrl = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(room.env.CF_ACCOUNT_ID) + "/workers/scripts/" + encodeURIComponent(scriptName);
  send({system: "正在回滚部署 " + scriptName + " 到版本 " + version + " ..."});
  let resp = await fetch(apiUrl, {
    method: "PUT",
    headers: { "Authorization": "Bearer " + room.env.CF_API_TOKEN, "Content-Type": mime.contentType },
    body: mime.data
  });
  let result;
  try { result = await resp.json(); } catch (e) { result = {}; }
  if (!resp.ok || !result.success) {
    send({error: "回滚部署失败: " + JSON.stringify(result.errors || result).slice(0, 300)});
    return;
  }
  send({system: "✅ 已回滚部署到版本 " + version + "，线上正在切换，稍后生效"});
}

// —— 应急回滚：构建 Cloudflare multipart 上传体 ——
// 与 wrangler 相同的 multipart 格式：metadata part + 每个模块一个 part
function buildRollbackMetadata(env) {
  let bindings = [
    {type: "durable_object_namespace", name: "rooms", class_name: "ChatRoom"},
    {type: "durable_object_namespace", name: "registry", class_name: "RoomRegistry"},
    {type: "durable_object_namespace", name: "archive", class_name: "VersionArchive"},
    {type: "durable_object_namespace", name: "filebucket", class_name: "FileBucket"},
  ];
  const vars = ["ADMIN_SECRET_KEY", "ADMIN_KEY", "AI_BASE_URL", "AI_MODEL", "AI_SYSTEM_PROMPT", "CF_ACCOUNT_ID", "CF_SCRIPT_NAME"];
  for (const v of vars) {
    if (env[v] != null) bindings.push({type: "plain_text", name: v, text: String(env[v])});
  }
  // CF_API_TOKEN 等敏感项用 secret_text 类型，避免明文进 vars
  for (const s of ["AI_API_KEY", "AI_SECRET", "CF_API_TOKEN"]) {
    if (env[s] != null) bindings.push({type: "secret_text", name: s, text: String(env[s])});
  }
  return { main_module: "src/index.mjs", compatibility_date: "2024-01-01", bindings };
}

function buildRollbackMultipart(files, env) {
  const boundary = "----cloudchat-rb-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const CRLF = "\r\n";
  const enc = new TextEncoder();
  const chunks = [];
  const push = (s) => chunks.push(enc.encode(s));
  const pushU8 = (u) => chunks.push(u);

  // metadata part
  push("--" + boundary + CRLF);
  push('Content-Disposition: form-data; name="metadata"' + CRLF);
  push("Content-Type: application/json" + CRLF + CRLF);
  push(JSON.stringify(buildRollbackMetadata(env)) + CRLF);

  // 模块 parts（.mjs 为代码模块，其余按 Data 模块）
  for (const [path, data] of Object.entries(files)) {
    if (!data || data.length === 0) continue;
    const ct = path.endsWith(".mjs") ? "application/javascript+module" : "application/octet-stream";
    push("--" + boundary + CRLF);
    push('Content-Disposition: form-data; name="' + path + '"; filename="' + path + '"' + CRLF);
    push("Content-Type: " + ct + CRLF + CRLF);
    pushU8(data);
    push(CRLF);
  }
  push("--" + boundary + "--" + CRLF);

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return { data: out, contentType: "multipart/form-data; boundary=" + boundary };
}

// 最小 zip 解压器（仅支持 store 无压缩格式 — scripts/archive-latest.mjs 以 level:0 生成）
// 解析 End of Central Directory + Central Directory + Local Header，直接读取未压缩数据
function unzipStore(zipData) {
  const dv = zipData;
  let eocd = -1;
  for (let i = dv.length - 22; i >= 0; i--) {
    if (dv[i] === 0x50 && dv[i+1] === 0x4b && dv[i+2] === 0x05 && dv[i+3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("无效的 zip 存档");
  const cdCount = dv[eocd + 10] | (dv[eocd + 11] << 8);
  const cdOffset = (dv[eocd + 16] | (dv[eocd + 17] << 8) | (dv[eocd + 18] << 16) | (dv[eocd + 19] << 24)) >>> 0;
  const files = {};
  const td = new TextDecoder();
  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (dv[pos] !== 0x50 || dv[pos+1] !== 0x4b || dv[pos+2] !== 0x01 || dv[pos+3] !== 0x02) break;
    const method = dv[pos + 10] | (dv[pos + 11] << 8);
    const compSize = (dv[pos + 20] | (dv[pos + 21] << 8) | (dv[pos + 22] << 16) | (dv[pos + 23] << 24)) >>> 0;
    const nameLen = dv[pos + 28] | (dv[pos + 29] << 8);
    const extraLen = dv[pos + 30] | (dv[pos + 31] << 8);
    const commentLen = dv[pos + 32] | (dv[pos + 33] << 8);
    const lho = (dv[pos + 42] | (dv[pos + 43] << 8) | (dv[pos + 44] << 16) | (dv[pos + 45] << 24)) >>> 0;
    const name = td.decode(dv.subarray(pos + 46, pos + 46 + nameLen));
    if (method !== 0) throw new Error("不支持的压缩方式: " + method + "（请用自动存档重新生成该版本）");
    const lNameLen = dv[lho + 26] | (dv[lho + 27] << 8);
    const lExtraLen = dv[lho + 28] | (dv[lho + 29] << 8);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    files[name] = dv.slice(dataStart, dataStart + compSize);
    pos += 46 + nameLen + extraLen + commentLen;
  }
  if (!files["src/index.mjs"]) throw new Error("存档缺少入口 src/index.mjs");
  return files;
}
