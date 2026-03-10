export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  try {

    /* =========================
       学生注册
    ========================== */
    if (path === 'auth/register' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, password } = body;

      if (!nickname) {
        return json({ success: false, message: '昵称不能为空' });
      }

      const userKey = `user:${nickname}`;
      const existing = await env.TYPEREADING_KV.get(userKey);

      if (existing) {
        return json({ success: false, message: '该昵称已被注册' });
      }

      const userData = {
        nickname,
        password: password || null,
        realName: '',
        gender: '',
        className: '',
        createdAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(userData));

      return json({ success: true });
    }

    /* =========================
       学生登录
    ========================== */
    if (path === 'auth/login' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, password } = body;

      const userKey = `user:${nickname}`;
      const userData = await env.TYPEREADING_KV.get(userKey);

      if (!userData) {
        return json({ success: false, message: '用户不存在' });
      }

      const user = JSON.parse(userData);

      if (user.password && user.password !== password) {
        return json({ success: false, message: '密码错误' });
      }

      return json({
        success: true,
        user
      });
    }

    /* =========================
       获取所有学生
    ========================== */
    if (path === 'admin/students') {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: 'user:' });

      const students = [];

      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) students.push(JSON.parse(data));
      }

      students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return json({ success: true, students });
    }

    /* =========================
       更新学生信息
    ========================== */
    if (path === 'admin/student/update') {
      const body = await request.json();
      const { nickname, realName, gender, className } = body;

      const userKey = `user:${nickname}`;
      const data = await env.TYPEREADING_KV.get(userKey);

      if (!data) return json({ success: false });

      const user = JSON.parse(data);
      user.realName = realName || '';
      user.gender = gender || '';
      user.className = className || '';

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));

      return json({ success: true });
    }

    /* =========================
       删除单个学生
    ========================== */
    if (path === 'admin/student/delete') {
      const body = await request.json();
      const { nickname } = body;

      await env.TYPEREADING_KV.delete(`user:${nickname}`);

      return json({ success: true });
    }

    /* =========================
       批量删除
    ========================== */
    if (path === 'admin/student/delete-batch') {
      const body = await request.json();
      const { nicknames } = body;

      for (const n of nicknames) {
        await env.TYPEREADING_KV.delete(`user:${n}`);
      }

      return json({ success: true });
    }

    /* =========================
       创建班级
    ========================== */
    if (path === 'admin/class/create') {
      const body = await request.json();
      const { className } = body;

      await env.TYPEREADING_KV.put(`class:${className}`, JSON.stringify({
        name: className,
        createdAt: new Date().toISOString()
      }));

      return json({ success: true });
    }

    /* =========================
       获取班级列表
    ========================== */
    if (path === 'admin/classes') {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: 'class:' });

      const classes = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) classes.push(JSON.parse(data));
      }

      return json({ success: true, classes });
    }

    /* =========================
       阅读记录提交
    ========================== */
    if (path === 'checkin/reading') {
      const body = await request.json();
      const { nickname, articleTitle, wordCount } = body;

      const recordKey = `reading:${Date.now()}`;

      await env.TYPEREADING_KV.put(recordKey, JSON.stringify({
        nickname,
        articleTitle,
        wordCount: parseInt(wordCount) || 0,
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      }));

      return json({ success: true });
    }

    /* =========================
       打字记录提交
    ========================== */
    if (path === 'typing/result') {
      const body = await request.json();
      const { nickname, wpm, accuracy } = body;

      const recordKey = `typing:${Date.now()}`;

      await env.TYPEREADING_KV.put(recordKey, JSON.stringify({
        nickname,
        wpm: parseInt(wpm) || 0,
        accuracy: parseInt(accuracy) || 0,
        timestamp: new Date().toISOString()
      }));

      return json({ success: true });
    }

    /* =========================
       排行榜
    ========================== */
    if (path === 'rank/typing') {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: 'typing:' });

      const records = [];

      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;

        const record = JSON.parse(data);
        const userData = await env.TYPEREADING_KV.get(`user:${record.nickname}`);

        if (!userData) continue;

        const user = JSON.parse(userData);

        if (user.realName) {
          records.push({
            ...record,
            realName: user.realName,
            className: user.className
          });
        }
      }

      records.sort((a, b) => b.wpm - a.wpm);

      return json({ success: true, rank: records.slice(0, 20) });
    }

    return json({ success: false, message: '接口不存在' });

  } catch (err) {
    return json({ success: false, message: err.message });
  }

  function json(data) {
    return new Response(JSON.stringify(data), { headers });
  }
}
