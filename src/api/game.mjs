// 游戏积分 API — 结算游戏输赢

export async function handleGame(apiPath, request, env) {
  const action = apiPath[1];

  if (action === "play") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
    }
    try {
      let body = await request.json();
      let { name, game, action: gameAction, wager, win, token } = body;

      if (!name || !game) {
        return new Response(JSON.stringify({error: "参数不完整"}), {status: 400});
      }

      // 验证游戏类型
      const VALID_GAMES = ["slots", "dice", "blackjack", "guess", "rps", "minesweeper", "t2048", "memory", "mole", "quiz", "target", "schulte", "simon", "ufo", "reaction", "stack", "wheel", "breakout", "fruit", "flappy", "bowling", "jump", "puzzle", "rings", "chickens", "cardwar", "bubbles", "skeet", "color"];
      if (!VALID_GAMES.includes(game)) {
        return new Response(JSON.stringify({error: "未知游戏"}), {status: 400});
      }

      // 验证赌注范围
      wager = parseInt(wager) || 0;
      win = parseInt(win) || 0;
      if (wager < 0 || win < 0) {
        return new Response(JSON.stringify({error: "参数无效"}), {status: 400});
      }

      // 最大赌注限制
      const MAX_WAGER = 5000;
      const MAX_WIN = 50000;
      if (wager > MAX_WAGER || win > MAX_WIN) {
        return new Response(JSON.stringify({error: "金额超出限制"}), {status: 400});
      }

      let registryId = env.registry.idFromName("global");
      let stub = env.registry.get(registryId);

      // 验证用户身份：操作用户名必须与 token 匹配
      let authCheck = await stub.fetch(new URL("https://dummy-url/user-check-auth?name=" + encodeURIComponent(name) + "&token=" + encodeURIComponent(token || "")));
      let authData = await authCheck.json();
      if (!authData.authenticated) {
        return new Response(JSON.stringify({error: "请先登录后再玩游戏"}), {status: 403});
      }

      if (gameAction === "bet") {
        // 🔒 安全修复（E1/E2）：服务端定局，下注即结算
        // 余额检查、扣款、服务端随机结果与发奖在同一次 registry 调用内原子完成，
        // 客户端上报的 win 不再影响任何金额（杜绝铸币 + TOCTOU）
        let betUrl = "https://dummy-url/game/bet?name=" + encodeURIComponent(name) + "&wager=" + wager;
        let r = await stub.fetch(new URL(betUrl));
        let data = await r.json();
        if (!r.ok || !data.ok) {
          return new Response(JSON.stringify({error: data.error || "下注失败"}), {status: 400, headers: {"Content-Type": "application/json"}});
        }
        return new Response(JSON.stringify({ok: true, action: "bet", deducted: data.deducted, won: data.won, prize: data.prize, balance: data.balance}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      if (gameAction === "win") {
        // 🔒 安全修复（E1）：win 为幂等查询，奖励已在下注时结算，这里仅返回结果与余额供前端刷新
        let winUrl = "https://dummy-url/game/win?name=" + encodeURIComponent(name);
        let r = await stub.fetch(new URL(winUrl));
        let data = await r.json();
        return new Response(JSON.stringify({ok: true, action: "win", won: data.won, awarded: data.prize || 0, balance: data.balance}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      return new Response(JSON.stringify({error: "未知操作"}), {status: 400});
    } catch (e) {
      // 🔒 L1 脱敏：不向客户端回传内部错误详情
      return new Response(JSON.stringify({error: "服务器内部错误"}), {status: 500});
    }
  }

  return new Response(JSON.stringify({error: "未找到"}), {status: 404});
}
