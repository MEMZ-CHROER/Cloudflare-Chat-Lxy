// FileBucket Durable Object — 分布式文件存储
// 文件分块存储（绕过 DO 单值 128KB 限制），自动过期清理
// 配合多个 bucket 实例做分布式桶存储

const FILE_TTL = 7 * 24 * 3600 * 1000; // 文件保留 7 天
const CHUNK_SIZE = 96000; // 每块 ~96KB base64

export class FileBucket {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    let url = new URL(request.url);

    switch (url.pathname) {
      case "/upload": {
        let fid = url.searchParams.get("fid");
        if (!fid) return new Response("缺少文件ID", {status: 400});

        let body = await request.arrayBuffer();
        let b64 = btoa(new Uint8Array(body).reduce((s, b) => s + String.fromCharCode(b), ""));
        let chunks = [];
        for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
          chunks.push(b64.slice(i, i + CHUNK_SIZE));
        }

        let info = { fid, size: body.byteLength, chunkCount: chunks.length, storedAt: Date.now() };
        let puts = [this.storage.put("f:" + fid + ":info", JSON.stringify(info))];
        for (let i = 0; i < chunks.length; i++) {
          puts.push(this.storage.put("f:" + fid + ":c:" + i, chunks[i]));
        }
        await Promise.all(puts);

        // 设置过期定时器
        let ttl = parseInt(url.searchParams.get("ttl")) || FILE_TTL;
        await this.state.storage.setAlarm(Date.now() + ttl);

        return new Response(JSON.stringify({ok: true, fid, size: body.byteLength, chunks: chunks.length}), {
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
    // 🔒 安全修复（L10）：清理后按剩余文件最早过期时间重设闹钟，防过期清理永不再次执行；
    // 无剩余文件则不设闹钟（下次上传时 /upload 会重新设置）
    if (minStoredAt !== Infinity) {
      try { await this.state.storage.setAlarm(minStoredAt + FILE_TTL); } catch (e) {}
    }
  }
}
