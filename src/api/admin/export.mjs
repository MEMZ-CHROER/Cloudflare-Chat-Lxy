// 管理后台导出功能 — CSV/JSON

export async function handleAdminExport(path, request, env, url) {
  // 只支持 GET 方法
  if (request.method !== "GET") {
    return new Response(JSON.stringify({error: "仅支持 GET 请求"}), {
      status: 405,
      headers: {"Content-Type": "application/json"}
    });
  }

  // 期望路径: /api/admin/export?type=users|points&format=csv|json
  if (path[1] !== "export") return null;

  const type = url.searchParams.get("type") || "";
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  const auth = encodeURIComponent(url.searchParams.get("auth") || "");
  const rid = env.registry.idFromName("global");
  const stub = env.registry.get(rid);

  // Helper to output CSV
  const toCsv = (header, rows) => {
    const escape = (v) => "\"" + String(v).replace(/"/g, "\"\"") + "\"";
    const lines = rows.map(r => header.map(h => escape(r[h] ?? "")).join(","));
    return header.map(escape).join(",") + "\n" + lines.join("\n");
  };

  if (type === "users") {
    // 复用 admin/users.mjs 中的 all-users 逻辑
    let resp = await stub.fetch(new URL("https://dummy-url/all-users"));
    let data = await resp.json(); // {roomName: [user1, user2...]}
    const rows = [];
    for (const [room, users] of Object.entries(data)) {
      for (const u of users) rows.push({room, user: u});
    }
    if (format === "json") {
      return new Response(JSON.stringify(rows), {status:200, headers:{"Content-Type":"application/json"}});
    }
    const csv = toCsv(["room", "user"], rows);
    return new Response(csv, {status:200, headers:{"Content-Type":"text/csv"}});
  }

  if (type === "points") {
    // 调用 points/all 接口获取所有积分数据
    let resp = await stub.fetch(new URL("https://dummy-url/points/all"));
    let data = await resp.json(); // {username: points}
    const rows = Object.entries(data).map(([user, pts]) => ({user, points: pts}));
    if (format === "json") {
      return new Response(JSON.stringify(rows), {status:200, headers:{"Content-Type":"application/json"}});
    }
    const csv = toCsv(["user", "points"], rows);
    return new Response(csv, {status:200, headers:{"Content-Type":"text/csv"}});
  }

  // 默认返回错误
  return new Response(JSON.stringify({error: "不支持的导出类型"}), {
    status: 400,
    headers: {"Content-Type": "application/json"}
  });
}
