// 操作日志系统 — 记录管理操作供审计

const MAX_LOGS = 500; // 最多保留 500 条

export async function handleLog(reg, request, url) {
  switch (url.pathname) {
    case "/log/list": {
      let logs = reg._logs || [];
      // 可传 ?action=ban 过滤
      let filter = url.searchParams.get("action") || "";
      if (filter) logs = logs.filter(l => l.action === filter);
      return new Response(JSON.stringify(logs), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/log/add": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      if (!body.action) return new Response(JSON.stringify({error: "缺少操作类型"}), {status: 400});
      if (!reg._logs) reg._logs = [];
      reg._logs.unshift({
        id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
        operator: body.operator || "unknown",
        action: body.action,
        target: body.target || "",
        detail: body.detail || ""
      });
      // 限制总数
      if (reg._logs.length > MAX_LOGS) reg._logs.length = MAX_LOGS;
      return new Response(JSON.stringify({ok: true}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/log/clear": {
      reg._logs = [];
      return new Response(JSON.stringify({ok: true}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    default:
      return null;
  }
}
