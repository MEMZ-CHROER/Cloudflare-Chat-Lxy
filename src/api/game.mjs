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
        // 🔒 安全修复：下注前先查余额，余额不足直接拒绝
        // （防止 points/add 余额钳制为0导致的零成本下注 + 凭空赢积分铸币）
        let balUrl = "https://dummy-url/points/get?name=" + encodeURIComponent(name);
        let balResp = await stub.fetch(new URL(balUrl));
        let balData = await balResp.json();
        if (BigInt(balData.points || 0) < BigInt(wager)) {
          return new Response(JSON.stringify({error: "积分不足，无法下注"}), {status: 400, headers: {"Content-Type": "application/json"}});
        }
        // 下注：扣除赌注
        let deductUrl = "https://dummy-url/points/add?name=" + encodeURIComponent(name) + "&amount=" + (-wager);
        let r = await stub.fetch(new URL(deductUrl));
        if (!r.ok) {
          let text = await r.text();
          return new Response(JSON.stringify({error: text}), {status: 400});
        }
        // 记录未结算下注，供 win 结算校验（防凭空 win / 重放）
        await stub.fetch(new URL("https://dummy-url/game/bet?name=" + encodeURIComponent(name) + "&wager=" + wager));
        return new Response(JSON.stringify({ok: true, action: "bet", deducted: wager, balance: balData.points}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      if (gameAction === "win") {
        // 先校验：必须有未结算下注、win 在合理范围、频率与每日上限
        let winCheck = await stub.fetch(new URL("https://dummy-url/game/win?name=" + encodeURIComponent(name) + "&win=" + win));
        let winResult = await winCheck.json();
        if (!winResult.ok) {
          return new Response(JSON.stringify({error: winResult.error || "结算校验失败"}), {status: 400});
        }
        // 获胜：奖励积分
        if (win > 0) {
          let awardUrl = "https://dummy-url/points/add?name=" + encodeURIComponent(name) + "&amount=" + win;
          await stub.fetch(new URL(awardUrl));
        }
        // 查询余额
        let balUrl = "https://dummy-url/points/get?name=" + encodeURIComponent(name);
        let balResp = await stub.fetch(new URL(balUrl));
        let balData = await balResp.json();
        return new Response(JSON.stringify({ok: true, action: "win", awarded: win, balance: balData.points}), {
          headers: {"Content-Type": "application/json"}
        });
      }

      return new Response(JSON.stringify({error: "未知操作"}), {status: 400});
    } catch (e) {
      return new Response(JSON.stringify({error: e.message}), {status: 500});
    }
  }

  return new Response(JSON.stringify({error: "未找到"}), {status: 404});
}
