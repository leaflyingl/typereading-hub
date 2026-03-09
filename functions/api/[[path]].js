export async function onRequest(context) {
  const { request, env, params } = context;
  const route = params.path || '';

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  try {
    // 登录/注册
    if (route === 'auth/login') {
      const { nickname } = await request.json();
      const userId = await env.TYPEREADING_KV.get(`nickname:`);
      
      if (userId) {
        const user = JSON.parse(await env.TYPEREADING_KV.get(`user:`));
        return json({ success: true, user }, cors);
      }
      
      // 新用户注册
      const id = `stu_${Date.now()}`;
      const user = {
        userId: id,
        nickname,
        role: 'student',
        createdAt: new Date().toISOString()
      };
      
      await env.TYPEREADING_KV.put(`user:${id}`, JSON.stringify(user));
      await env.TYPEREADING_KV.put(`nickname:${nickname}`, id);
      
      return json({ success: true, user, isNew: true }, cors);
    }

    // 阅读打卡
    if (route === 'checkin/reading') {
      const { userId, notes } = await request.json();
      const date = new Date().toISOString().slice(0, 10);
      await env.TYPEREADING_KV.put(
        `reading:${userId}:${date}`,
        JSON.stringify({ userId, date, notes, createdAt: new Date().toISOString() })
      );
      return json({ success: true }, cors);
    }

    // 打字成绩
    if (route === 'typing/result') {
      const { userId, wpm, accuracy } = await request.json();
      const date = new Date().toISOString().slice(0, 10);
      await env.TYPEREADING_KV.put(
        `typing:${userId}:${date}`,
        JSON.stringify({ userId, date, wpm, accuracy, createdAt: new Date().toISOString() })
      );
      return json({ success: true }, cors);
    }

    // 排行榜
    if (route === 'rank/typing') {
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
