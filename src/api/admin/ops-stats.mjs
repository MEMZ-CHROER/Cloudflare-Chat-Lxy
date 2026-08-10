// 📈 v1.54 运营数据看板 - 聚合端点
// registry /ops/stats 返回全局聚合（在线/峰值/积分吞吐/房间在线），
// 此处再遍历所有房间拉取 /stats 聚合每日消息量（复用 all-users 的遍历房间模板）。

export async function handleAdminOpsStats(path, request, env, url) {
  if (path[1] !== "ops-stats") return null;
  try {
    let rid = env.registry.idFromName("global");
    let stub = env.registry.get(rid);
    let qs = new URLSearchParams(url.search);
    qs.delete("key");
    let r = await stub.fetch(new URL("https://dummy-url/ops/stats?" + qs.toString()));
    if (!r.ok) return new Response(await r.text(), { status: r.status });
    let data = await r.json();

    // 遍历房间聚合每日消息量（每房 /stats → stat:msg:<date> 日桶求和）
    let msgByDay = {};
    let roomsList = Array.isArray(data.rooms) ? data.rooms : [];
    await Promise.all(roomsList.map(async (room) => {
      try {
        if (!room.name) return;
        let id;
        if (room.name.match(/^[0-9a-f]{64}$/)) id = env.rooms.idFromString(room.name);
        else if (room.name.length <= 32) id = env.rooms.idFromName(room.name);
        else return;
        let roomObject = env.rooms.get(id);
        let rr = await roomObject.fetch(new URL("https://dummy-url/stats"));
        let rd = await rr.json();
        if (rd && rd.msgByDay) {
          for (let [d, c] of Object.entries(rd.msgByDay)) {
            msgByDay[d] = (msgByDay[d] || 0) + (Number(c) || 0);
          }
        }
      } catch (e) {}
    }));
    data.msgByDay = msgByDay;

    return new Response(JSON.stringify(data), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    // 🔒 L1 脱敏：不向客户端回传内部错误详情
    return new Response(JSON.stringify({ error: "运营数据服务暂时不可用" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
