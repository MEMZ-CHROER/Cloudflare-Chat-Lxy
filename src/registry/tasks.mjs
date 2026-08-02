import { tokenValid } from "../utils.mjs";
// 任务系统 + 管理员任务 CRUD

// 🔒 安全修复（E6）：BigInt 解析，防余额大数精度丢失
function toBigInt(val) {
  if (val == null) return 0n;
  try {
    let s = String(val).trim().toLowerCase();
    if (s.includes('e')) {
      let [base, exp] = s.split('e');
      let e = parseInt(exp, 10);
      if (e < 0) return 0n;
      if (e > 100000) return 0n; // 防 DoS：指数过大直接拒绝
      let dot = base.indexOf('.');
      if (dot === -1) s = base + '0'.repeat(e);
      else {
        let digits = base.replace('.', '');
        let fracLen = base.length - 1 - dot;
        let zeros = e - fracLen;
        s = digits + (zeros > 0 ? '0'.repeat(zeros) : '');
      }
    }
    return BigInt(s);
  } catch { return 0n; }
}

export async function handleTasks(reg, request, url) {
  switch (url.pathname) {
    case "/tasks/list": {
      let result = [];
      for (let [id, task] of reg.tasks) {
        if (task.enabled !== false) {
          let claimedBy = null;
          for (let [uname, claims] of reg.taskClaims) {
            if (claims.has(id)) { claimedBy = uname; break; }
          }
          result.push({id, name: task.name, description: task.description, reward: task.reward, claimedBy});
        }
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/task/claim": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let taskId = body.taskId;
      if (!name || !taskId) return new Response(JSON.stringify({error: "请提供用户名和任务ID"}), {status: 400});
      // 🔒 S4 纵深防御：registry 层校验 token，确保 name 与 token 匹配
      let regUser = reg.registeredUsers.get(name);
      if (!tokenValid(regUser, body.token || "")) {
        return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      }
      let task = reg.tasks.get(taskId);
      if (!task) return new Response(JSON.stringify({error: "任务不存在"}), {status: 404});
      if (task.enabled === false) return new Response(JSON.stringify({error: "任务已下架"}), {status: 400});
      if (!reg.taskClaims.has(name)) reg.taskClaims.set(name, new Set());
      let claims = reg.taskClaims.get(name);
      if (claims.has(taskId)) return new Response(JSON.stringify({error: "已领取此任务"}), {status: 400});
      if (reg.taskCompletions.has(name) && reg.taskCompletions.get(name).has(taskId)) {
        return new Response(JSON.stringify({error: "已完成此任务"}), {status: 400});
      }
      claims.add(taskId);
      await reg.saveTaskClaims();
      return new Response(JSON.stringify({ok: true, claimed: true}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/task/complete": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let name = body.name;
      let taskId = body.taskId;
      if (!name || !taskId) return new Response(JSON.stringify({error: "请提供用户名和任务ID"}), {status: 400});
      // 🔒 S4 纵深防御：registry 层校验 token，确保 name 与 token 匹配
      let regUser = reg.registeredUsers.get(name);
      if (!tokenValid(regUser, body.token || "")) {
        return new Response(JSON.stringify({error: "身份验证失败"}), {status: 403});
      }
      let task = reg.tasks.get(taskId);
      if (!task) return new Response(JSON.stringify({error: "任务不存在"}), {status: 404});
      if (task.enabled === false) return new Response(JSON.stringify({error: "任务已下架"}), {status: 400});
      if (!reg.taskClaims.has(name) || !reg.taskClaims.get(name).has(taskId)) {
        return new Response(JSON.stringify({error: "请先领取任务"}), {status: 400});
      }
      if (!reg.taskCompletions.has(name)) reg.taskCompletions.set(name, new Set());
      if (reg.taskCompletions.get(name).has(taskId)) {
        return new Response(JSON.stringify({error: "已完成此任务"}), {status: 400});
      }
      reg.taskCompletions.get(name).add(taskId);
      reg.taskClaims.get(name).delete(taskId);
      await reg.saveTaskCompletions();
      await reg.saveTaskClaims();
      // 🔒 安全修复（E6）：积分/奖励用 BigInt 运算，防大数精度丢失
      let pts = toBigInt(reg.userPoints.get(name));
      let reward = toBigInt(task.reward);
      reg.userPoints.set(name, String(pts + reward));
      await reg.savePoints();
      await reg.addLedger(name, reward, "task", "完成任务奖励");
      return new Response(JSON.stringify({ok: true, reward: String(reward), total: String(pts + reward)}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/tasks/completions": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let set = reg.taskCompletions.get(name);
      return new Response(JSON.stringify({completed: set ? [...set] : []}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/tasks/claims": {
      let name = url.searchParams.get("name");
      if (!name) return new Response(JSON.stringify({error: "请提供用户名"}), {status: 400});
      let set = reg.taskClaims.get(name);
      return new Response(JSON.stringify({claimed: set ? [...set] : []}), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/admin/tasks/list": {
      let result = [];
      for (let [id, task] of reg.tasks) {
        let completedCount = 0;
        for (let [u, ids] of reg.taskCompletions) { if (ids.has(id)) completedCount++; }
        let claimedBy = null;
        for (let [uname, claims] of reg.taskClaims) { if (claims.has(id)) { claimedBy = uname; break; } }
        result.push({id, name: task.name, description: task.description, reward: task.reward, enabled: task.enabled !== false, completedCount, claimedBy});
      }
      return new Response(JSON.stringify(result), {
        headers: {"Content-Type": "application/json"}
      });
    }

    case "/admin/task/add": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      if (!body.name || !body.reward) return new Response(JSON.stringify({error: "请提供任务名称和奖励积分"}), {status: 400});
      let taskId = "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      reg.tasks.set(taskId, {name: body.name, description: body.description || "", reward: parseInt(body.reward, 10), enabled: true});
      await reg.saveTasks();
      return new Response(JSON.stringify({ok: true, taskId}), {headers: {"Content-Type": "application/json"}});
    }

    case "/admin/task/toggle": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let id = body.taskId;
      if (!id) return new Response(JSON.stringify({error: "请提供任务ID"}), {status: 400});
      let task = reg.tasks.get(id);
      if (!task) return new Response(JSON.stringify({error: "任务不存在"}), {status: 404});
      task.enabled = !task.enabled;
      await reg.saveTasks();
      return new Response(JSON.stringify({ok: true, enabled: task.enabled}), {headers: {"Content-Type": "application/json"}});
    }

    case "/admin/task/delete": {
      if (request.method !== "POST") return new Response(JSON.stringify({error: "请使用POST"}), {status: 405});
      let body = await request.json();
      let id = body.taskId;
      if (!id) return new Response(JSON.stringify({error: "请提供任务ID"}), {status: 400});
      if (!reg.tasks.has(id)) return new Response(JSON.stringify({error: "任务不存在"}), {status: 404});
      reg.tasks.delete(id);
      await reg.saveTasks();
      return new Response(JSON.stringify({ok: true}), {headers: {"Content-Type": "application/json"}});
    }

    default:
      return null;
  }
}
