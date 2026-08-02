// 房间注册/更新/列表 + 密码管理 + 房间级 Webhook secret

import { safeEqual } from "../utils.mjs";

export async function handleRooms(reg, request, url) {
  switch (url.pathname) {
    case "/register": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供房间名", { status: 400 });
      if (!reg.rooms.has(name)) {
        reg.rooms.set(name, { count: 0, password: null });
      }
      return new Response("ok");
    }

    case "/update": {
      let name = url.searchParams.get("name");
      let count = parseInt(url.searchParams.get("count"), 10);
      if (!name) return new Response("请提供房间名", { status: 400 });
      let room = reg.rooms.get(name);
      if (!room) {
        reg.rooms.set(name, { count: count || 0, password: null });
      } else {
        room.count = count || 0;
      }
      await reg.save();
      return new Response("ok");
    }

    case "/list": {
      let result = {};
      for (let [name, info] of reg.rooms) {
        if (info.count > 0) {
          result[name] = { count: info.count, hasPassword: !!info.password };
        }
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/password-status": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "no name"}), {status: 400});
      let room = reg.rooms.get(name);
      return new Response(JSON.stringify({hasPassword: !!(room && room.password)}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/verify-password": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      try {
        let body = await request.json();
        let name = body.name;
        let password = body.password || "";
        let room = reg.rooms.get(name);
        if (!room || !room.password) {
          return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
        }
        if (room.password === password) {
          return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
        }
        return new Response(JSON.stringify({ok: false, error: "密码错误"}), {status: 403, headers: {"Content-Type": "application/json"}});
      } catch (e) {
        return new Response(JSON.stringify({error: "请求解析失败"}), {status: 400});
      }
    }

    case "/set-password": {
      let name = url.searchParams.get("name");
      let password = url.searchParams.get("password") || "";
      if (!name) return new Response("请提供房间名", { status: 400 });
      if (!reg.rooms.has(name)) {
        reg.rooms.set(name, { count: 0, password: null });
      }
      let room = reg.rooms.get(name);
      room.password = password || null;
      await reg.save();
      return new Response(password ? "密码已设置" : "密码已清除");
    }

    case "/room-destroy": {
      let name = url.searchParams.get("name");
      if (!name) return new Response("请提供房间名", { status: 400 });
      reg.rooms.delete(name);
      await reg.save();
      return new Response("房间 " + name + " 已从注册表中移除", { status: 200 });
    }

    // 🔗 通用 Webhook：房间级 secret 管理（list/gen/del/status）
    // 管理端点（registry.mjs adminExactPaths 已加鉴权）；入站校验走 /room/webhook-verify（公开）
    case "/room/webhook": {
      let roomName = url.searchParams.get("room");
      let action = url.searchParams.get("action") || "";
      if (action === "list") {
        let result = {};
        for (let [name, info] of reg.rooms) {
          result[name] = { hasWebhook: !!info.webhookSecret };
        }
        return new Response(JSON.stringify(result), {headers: {"Content-Type": "application/json"}});
      }
      if (!roomName) return new Response(JSON.stringify({error: "请提供房间名"}), {status: 400, headers: {"Content-Type": "application/json"}});
      if (!reg.rooms.has(roomName)) reg.rooms.set(roomName, {count: 0, password: null});
      let room = reg.rooms.get(roomName);
      if (action === "gen") {
        let buf = crypto.getRandomValues(new Uint8Array(16));
        let secret = Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
        room.webhookSecret = secret;
        await reg.save();
        return new Response(JSON.stringify({ok: true, room: roomName, secret}), {headers: {"Content-Type": "application/json"}});
      }
      if (action === "del") {
        room.webhookSecret = null;
        await reg.save();
        return new Response(JSON.stringify({ok: true, room: roomName, hasWebhook: false}), {headers: {"Content-Type": "application/json"}});
      }
      if (action === "status") {
        return new Response(JSON.stringify({ok: true, room: roomName, hasWebhook: !!room.webhookSecret}), {headers: {"Content-Type": "application/json"}});
      }
      return new Response(JSON.stringify({error: "未知操作"}), {status: 400, headers: {"Content-Type": "application/json"}});
    }

    // 🔗 通用 Webhook：入站 secret 校验（公开，POST {room, secret}，常量时间比较防时序）
    case "/room/webhook-verify": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405, headers: {"Content-Type": "application/json"}});
      try {
        let body = await request.json();
        let roomName = body.room;
        let secret = String(body.secret || "");
        let room = reg.rooms.get(roomName);
        if (!room || !room.webhookSecret) {
          return new Response(JSON.stringify({ok: false, error: "该房间未开启Webhook"}), {status: 403, headers: {"Content-Type": "application/json"}});
        }
        if (safeEqual(secret, room.webhookSecret)) {
          return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
        }
        return new Response(JSON.stringify({ok: false, error: "Webhook密钥错误"}), {status: 403, headers: {"Content-Type": "application/json"}});
      } catch (e) {
        return new Response(JSON.stringify({error: "请求解析失败"}), {status: 400, headers: {"Content-Type": "application/json"}});
      }
    }

    default:
      return null;
  }
}
