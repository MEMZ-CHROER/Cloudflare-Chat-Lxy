// VersionArchive Durable Object — 存贮版本 zip 文件（分块存储以绕过 128KB 限制）
// + 单文件资源存储：POST /file-put（上传单个文件按 path 存）、GET /file-get（浏览器按 path 拉取）、
//   /file-list（列 path）、/file-delete（删文件）—— key 前缀 "f:"，path 经 normalizeFilePath 防穿越

/** 路径规范化：去开头斜杠/反斜杠、拒绝 .. 段、只允许安全字符（防路径穿越） */
function normalizeFilePath(raw) {
  if (!raw) return "";
  let p = String(raw).trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (p === "" || p.length > 200) return "";
  if (p.split("/").some((s) => s === ".." || s === ".")) return "";
  if (!/^[A-Za-z0-9._+ /-]+$/.test(p)) return "";
  return p;
}

const FILE_MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", flac: "audio/flac",
  mp4: "video/mp4", webm: "video/webm",
  json: "application/json", xml: "application/xml", xnb: "application/octet-stream",
  txt: "text/plain;charset=UTF-8", log: "text/plain;charset=UTF-8", css: "text/css;charset=UTF-8",
  js: "application/javascript;charset=UTF-8", html: "text/html;charset=UTF-8", htm: "text/html;charset=UTF-8",
  otf: "font/otf", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2",
  dll: "application/octet-stream", bin: "application/octet-stream", dat: "application/octet-stream",
  exe: "application/octet-stream", xnb2: "application/octet-stream",
};
function mimeForPath(path) {
  let ext = path.includes(".") ? path.split(".").pop().toLowerCase() : "";
  return FILE_MIME[ext] || "application/octet-stream";
}

export class VersionArchive {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    let url = new URL(request.url);

    switch (url.pathname) {
      case "/upload": {
        let name = url.searchParams.get("name");
        let description = url.searchParams.get("description") || "";
        if (!name) return new Response("请提供版本名称", {status: 400});

        let body = await request.arrayBuffer();
        let b64 = btoa(new Uint8Array(body).reduce((s, b) => s + String.fromCharCode(b), ""));
        let chunkSize = 96000;
        let chunks = [];
        for (let i = 0; i < b64.length; i += chunkSize) {
          chunks.push(b64.slice(i, i + chunkSize));
        }

        let info = {name, description, timestamp: Date.now(), size: body.byteLength, chunkCount: chunks.length};
        await this.storage.put("v:" + name + ":info", JSON.stringify(info));

        let puts = [this.storage.put("v:" + name + ":info", JSON.stringify(info))];
        for (let i = 0; i < chunks.length; i++) {
          puts.push(this.storage.put("v:" + name + ":c:" + i, chunks[i]));
        }
        await Promise.all(puts);

        let versions = await this.storage.get("versions") || [];
        if (!versions.includes(name)) {
          versions.unshift(name);
          await this.storage.put("versions", versions);
        }

        return new Response(JSON.stringify({ok: true, name, chunks: chunks.length, size: body.byteLength}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      case "/list": {
        let versions = await this.storage.get("versions") || [];
        let result = [];
        for (let v of versions) {
          let raw = await this.storage.get("v:" + v + ":info");
          if (raw) result.push(JSON.parse(raw));
        }
        return new Response(JSON.stringify(result), {
          headers: {"Content-Type": "application/json"}
        });
      }

      case "/download": {
        let name = url.searchParams.get("name");
        if (!name) return new Response("请提供版本名称", {status: 400});
        let raw = await this.storage.get("v:" + name + ":info");
        if (!raw) return new Response("版本不存在", {status: 404});
        let info = JSON.parse(raw);

        let chunks = [];
        for (let i = 0; i < info.chunkCount; i++) {
          let c = await this.storage.get("v:" + name + ":c:" + i);
          if (c) chunks.push(c);
        }
        let b64 = chunks.join("");
        let binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

        return new Response(binary, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="' + name + '.zip"'
          }
        });
      }

      case "/delete": {
        let name = url.searchParams.get("name");
        if (!name) return new Response("请提供版本名称", {status: 400});
        let raw = await this.storage.get("v:" + name + ":info");
        if (!raw) return new Response("版本不存在", {status: 404});
        let info = JSON.parse(raw);

        let dels = [this.storage.delete("v:" + name + ":info")];
        for (let i = 0; i < info.chunkCount; i++) {
          dels.push(this.storage.delete("v:" + name + ":c:" + i));
        }
        await Promise.all(dels);

        let versions = await this.storage.get("versions") || [];
        let idx = versions.indexOf(name);
        if (idx >= 0) versions.splice(idx, 1);
        await this.storage.put("versions", versions);

        return new Response("已删除版本 " + name);
      }

      // 📦 单文件资源：POST /file-put?path= 上传（api 层 super 鉴权），GET /file-get?path= 公开拉取
      case "/file-put": {
        let path = normalizeFilePath(url.searchParams.get("path"));
        if (!path) return new Response("请提供文件路径（只允许字母数字/._+-/空格，禁止 ..）", {status: 400});
        let body = await request.arrayBuffer();
        if (body.byteLength > 50 * 1024 * 1024) return new Response("文件过大（最大50MB）", {status: 413});

        let b64 = btoa(new Uint8Array(body).reduce((s, b) => s + String.fromCharCode(b), ""));
        let chunkSize = 96000;
        let chunks = [];
        for (let i = 0; i < b64.length; i += chunkSize) chunks.push(b64.slice(i, i + chunkSize));

        let info = { path, size: body.byteLength, chunkCount: chunks.length, updatedAt: Date.now() };
        let puts = [this.storage.put("f:" + path + ":info", JSON.stringify(info))];
        for (let i = 0; i < chunks.length; i++) puts.push(this.storage.put("f:" + path + ":c:" + i, chunks[i]));
        await Promise.all(puts);

        // 维护文件索引（最新在前，上限 500）
        let fileIndex = (await this.storage.get("fileIndex")) || [];
        fileIndex = fileIndex.filter((p) => p !== path);
        fileIndex.unshift(path);
        await this.storage.put("fileIndex", fileIndex.slice(0, 500));

        return new Response(JSON.stringify({ok: true, path, size: body.byteLength, chunks: chunks.length}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      case "/file-get": {
        let path = normalizeFilePath(url.searchParams.get("path"));
        if (!path) return new Response("请提供文件路径", {status: 400});
        let raw = await this.storage.get("f:" + path + ":info");
        if (!raw) return new Response("文件不存在: " + path, {status: 404});
        let info = JSON.parse(raw);
        let chunks = [];
        for (let i = 0; i < info.chunkCount; i++) {
          let c = await this.storage.get("f:" + path + ":c:" + i);
          if (c) chunks.push(c);
        }
        let binary = Uint8Array.from(atob(chunks.join("")), (c) => c.charCodeAt(0));
        return new Response(binary, {
          headers: {
            "Content-Type": mimeForPath(path),
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*",
          }
        });
      }

      case "/file-list": {
        let fileIndex = (await this.storage.get("fileIndex")) || [];
        return new Response(JSON.stringify(fileIndex), {headers: {"Content-Type": "application/json"}});
      }

      case "/file-delete": {
        let path = normalizeFilePath(url.searchParams.get("path"));
        if (!path) return new Response("请提供文件路径", {status: 400});
        let raw = await this.storage.get("f:" + path + ":info");
        if (!raw) return new Response("文件不存在", {status: 404});
        let info = JSON.parse(raw);
        let dels = [this.storage.delete("f:" + path + ":info")];
        for (let i = 0; i < info.chunkCount; i++) dels.push(this.storage.delete("f:" + path + ":c:" + i));
        await Promise.all(dels);
        let fileIndex = ((await this.storage.get("fileIndex")) || []).filter((p) => p !== path);
        await this.storage.put("fileIndex", fileIndex);
        return new Response("已删除文件 " + path);
      }

      default:
        return new Response("未找到", {status: 404});
    }
  }
}
