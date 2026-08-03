// FileBucket Durable Object — 分布式文件存储
// 文件分块存储（绕过 DO 单值 128KB 限制），自动过期清理
// 配合多个 bucket 实例做分布式桶存储

const FILE_TTL = 7 * 24 * 3600 * 1000; // 文件保留 7 天
const CHUNK_SIZE = 96000; // 每块 ~96KB base64
const FILE_BYTES_LIMIT = 20 * 1024 * 1024; // 单文件硬上限 20MB（F1）
const USER_BYTES_LIMIT = 200 * 1024 * 1024; // 每用户存储总大小上限 200MB（F1）
const USER_FILES_LIMIT = 50; // 每用户文件数上限 50（F1）

// 🔒 安全修复（F1）：从 fid 提取用户名。fid 形如 "类型_毫秒时间戳_用户名"，用户名可能含下划线
function fidUser(fid) {
  let parts = String(fid).split("_");
  if (parts.length < 3) return "";
  return parts.slice(2).join("_");
}

export class FileBucket {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
  }

  async fetch(request) {
    let url = new URL(request.url);

    // 🔒 安全修复（F2）：filebucket 为内部存储服务，所有端点必须携带内部密钥，否则拒绝
    let internalKey = request.headers.get("X-Internal-Key");
    if (internalKey !== this.env.ADMIN_SECRET_KEY) {
      return new Response("未授权", {status: 403});
    }

    switch (url.pathname) {
      case "/upload": {
        let fid = url.searchParams.get("fid");
        if (!fid) return new Response("缺少文件ID", {status: 400});

        let body = await request.arrayBuffer();
        let size = body.byteLength;

        // 🔒 安全修复（F1）：单文件硬上限 20MB，拒绝超大上传
        if (size > FILE_BYTES_LIMIT) {
          return new Response(JSON.stringify({error: "文件过大，单文件上限 " + (FILE_BYTES_LIMIT / 1024 / 1024) + "MB"}), {status: 413, headers: {"Content-Type": "application/json"}});
        }

        // 🔒 安全修复（F3）：fid 已存在时拒绝覆盖，防跨房间同毫秒同用户 fid 撞车导致数据损坏
        if (await this.storage.get("f:" + fid + ":info")) {
          return new Response(JSON.stringify({error: "文件ID已存在，拒绝覆盖"}), {status: 409, headers: {"Content-Type": "application/json"}});
        }

        // 🔒 安全修复（F1）：每用户配额兜底（单用户总大小 200MB / 50 个文件），防共享桶被单用户耗尽
        let user = fidUser(fid) || "unknown";
        let userKey = "u:" + user + ":meta";
        let userMetaRaw = await this.storage.get(userKey);
        let userMeta = {bytes: 0, count: 0};
        if (userMetaRaw) { try { userMeta = JSON.parse(userMetaRaw); } catch (e) {} }
        if (userMeta.count >= USER_FILES_LIMIT || userMeta.bytes + size > USER_BYTES_LIMIT) {
          return new Response(JSON.stringify({error: "超出存储配额"}), {status: 413, headers: {"Content-Type": "application/json"}});
        }

        let b64 = btoa(new Uint8Array(body).reduce((s, b) => s + String.fromCharCode(b), ""));
        let chunks = [];
        for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
          chunks.push(b64.slice(i, i + CHUNK_SIZE));
        }

        let info = { fid, size, chunkCount: chunks.length, storedAt: Date.now() };
        let puts = [this.storage.put("f:" + fid + ":info", JSON.stringify(info))];
        for (let i = 0; i < chunks.length; i++) {
          puts.push(this.storage.put("f:" + fid + ":c:" + i, chunks[i]));
        }
        puts.push(this.storage.put(userKey, JSON.stringify({bytes: userMeta.bytes + size, count: userMeta.count + 1})));
        await Promise.all(puts);

        // 设置过期定时器
        let ttl = parseInt(url.searchParams.get("ttl")) || FILE_TTL;
        await this.state.storage.setAlarm(Date.now() + ttl);

        return new Response(JSON.stringify({ok: true, fid, size, chunks: chunks.length}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      case "/download": {
        let fid = url.searchParams.get("fid");
        if (!fid) return new Response("缺少文件ID", {status: 400});

        let infoRaw = await this.storage.get("f:" + fid + ":info");
        if (!infoRaw) return new Response("文件不存在或已过期", {status: 404});
        let info = JSON.parse(infoRaw);

        let chunks = [];
        for (let i = 0; i < info.chunkCount; i++) {
          let c = await this.storage.get("f:" + fid + ":c:" + i);
          if (!c) return new Response("文件分块缺失", {status: 500});
          chunks.push(c);
        }
        let b64 = chunks.join("");
        let binary = atob(b64);
        let bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

        return new Response(bytes, {
          headers: {"Content-Type": "application/octet-stream", "Content-Length": String(bytes.length)}
        });
      }

      case "/info": {
        let fid = url.searchParams.get("fid");
        if (!fid) return new Response(JSON.stringify({error: "缺少文件ID"}), {status: 400});
        let infoRaw = await this.storage.get("f:" + fid + ":info");
        if (!infoRaw) return new Response(JSON.stringify({error: "文件不存在"}), {status: 404});
        return new Response(infoRaw, {headers: {"Content-Type": "application/json"}});
      }

      case "/delete": {
        let fid = url.searchParams.get("fid");
        if (!fid) return new Response("缺少文件ID", {status: 400});
        let infoRaw = await this.storage.get("f:" + fid + ":info");
        if (!infoRaw) return new Response("文件不存在", {status: 404});
        let info = JSON.parse(infoRaw);
        let keys = ["f:" + fid + ":info"];
        for (let i = 0; i < info.chunkCount; i++) {
          keys.push("f:" + fid + ":c:" + i);
        }
        await this.storage.delete(keys);
        // 🔒 安全修复（F1）：删除后扣减该用户配额计数
        let user = fidUser(fid) || "unknown";
        let userKey = "u:" + user + ":meta";
        let userMetaRaw = await this.storage.get(userKey);
        if (userMetaRaw) {
          try {
            let userMeta = JSON.parse(userMetaRaw);
            userMeta.bytes = Math.max(0, userMeta.bytes - (info.size || 0));
            userMeta.count = Math.max(0, userMeta.count - 1);
            await this.storage.put(userKey, JSON.stringify(userMeta));
          } catch (e) {}
        }
        return new Response("已删除", {status: 200});
      }

      case "/stats": {
        // 供管理面板查看桶使用情况
        let entries = await this.storage.list({prefix: "f:"});
        let files = new Set();
        let totalSize = 0;
        for (let [key, val] of entries) {
          if (key.endsWith(":info")) {
            let info = JSON.parse(val);
            files.add(info.fid);
            totalSize += info.size;
          }
        }
        return new Response(JSON.stringify({fileCount: files.size, totalSize, bucketId: this.state.id.toString()}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      default:
        return new Response("未找到", {status: 404});
    }
  }

  async alarm() {
    // 清理过期文件
    let entries = await this.storage.list({prefix: "f:"});
    let now = Date.now();
    let infoKeys = [];
    let minStoredAt = Infinity; // L10：剩余未过期文件的最早存储时间，用于重设闹钟
    for (let [key, val] of entries) {
      if (key.endsWith(":info")) {
        let info;
        try { info = JSON.parse(val); } catch (e) { continue; }
        if (now - info.storedAt > FILE_TTL) {
          infoKeys.push(key);
          let fid = info.fid;
          for (let i = 0; i < info.chunkCount; i++) {
            infoKeys.push("f:" + fid + ":c:" + i);
          }
        } else if (info.storedAt < minStoredAt) {
          minStoredAt = info.storedAt;
        }
      }
    }
    if (infoKeys.length > 0) {
      await this.storage.delete(infoKeys);
    }
    // 🔒 安全修复（F1）：清理后从剩余文件重建每用户配额计数（防计数漂移/过期文件未扣减）
    try { await this._rebuildUserMeta(); } catch (e) {}
    // 🔒 安全修复（L10）：清理后按剩余文件最早过期时间重设闹钟，防过期清理永不再次执行；
    // 无剩余文件则不设闹钟（下次上传时 /upload 会重新设置）
    if (minStoredAt !== Infinity) {
      try { await this.state.storage.setAlarm(minStoredAt + FILE_TTL); } catch (e) {}
    }
  }

  // 🔒 安全修复（F1）：全量扫描剩余文件重建每用户配额计数（供 alarm 清理后校准）
  async _rebuildUserMeta() {
    let entries = await this.storage.list({prefix: "f:"});
    let totals = new Map();
    for (let [key, val] of entries) {
      if (!key.endsWith(":info")) continue;
      let info;
      try { info = JSON.parse(val); } catch (e) { continue; }
      let user = fidUser(info.fid) || "unknown";
      let t = totals.get(user) || {bytes: 0, count: 0};
      t.bytes += info.size || 0;
      t.count += 1;
      totals.set(user, t);
    }
    let oldKeys = await this.storage.list({prefix: "u:"});
    let deletes = [];
    for (let [key] of oldKeys) deletes.push(key);
    if (deletes.length) await this.storage.delete(deletes);
    let puts = [];
    for (let [user, t] of totals) {
      puts.push(this.storage.put("u:" + user + ":meta", JSON.stringify(t)));
    }
    if (puts.length) await Promise.all(puts);
  }
}
