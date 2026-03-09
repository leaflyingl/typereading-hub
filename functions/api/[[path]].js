export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = params.path || '';

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    // ===== 登录 / 注册 =====
    if (path === 'auth/login') {
      const { nickname, realName, gender } = await request.json();
      if (!nickname) return json({ error: 'nickname required' }, cors, 400);

      const userId = await env.TYPEREADING_KV.get(`nickname:${nickname}`);
      if (userId) {
        const user = JSON.parse(await env.TYPEREADING_KV.get(`user:${userId}`));
        return json({ success: true, user }, cors);
      }

      // 自动注册
      const id = `stu_${Date.now()}`;
      const user = {
        userId: id,
        nickname,
        realName: realName || '',
        gender: gender || '',
        role: 'student',
        createdAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(`user:${id}`, JSON.stringify(user));
      await env.TYPEREADING_KV.put(`nickname:${nickname}`, id);

      return json({ success: true, user, isNew: true }, cors);
    }

    // ===== 阅读打卡 =====
    if (path === 'checkin/reading') {
      const { userId, notes } = await request.json();
      const date = new Date().toISOString().slice(0, 10);
      await env.TYPEREADING_KV.put(
        `reading:${userId}:${date}`,
        JSON.stringify({ userId, date, notes })
      );
      return json({ success: true }, cors);
    }

    // ===== 打字成绩 =====
    if (path === 'typing/result') {
      const { userId, wpm, accuracy } = await request.json();
      const date = new Date().toISOString().slice(0, 10);
      await env.TYPEREADING_KV.put(
        `typing:${userId}:${date}`,
        JSON.stringify({ userId, date, wpm, accuracy })
      );
      return json({ success: true }, cors);
    }

    // ===== 排行榜（打字）=====
    if (path === 'rank/typing') {
      const list = await env.TYPEREADING_KV.list({ prefix: 'typing:' });
      const scores = [];

      for (const k of list.keys) {
        const data = JSON.parse(await env.TYPEREADING_KV.get(k.name));
        scores.push(data);
      }

      scores.sort((a, b) => b.wpm - a.wpm);
      return json(scores.slice(0, 10), cors);
    }

    return json({ error: 'Not Found' }, cors, 404);
  } catch (e) {
    return json({ error: e.message }, cors, 500);
  }
}

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

