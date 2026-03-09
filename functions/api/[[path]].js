export default async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  const KV = env.TYPEREADING_KV;
  
  // 统一响应格式
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    // 1. 登录/注册
    if (path === '/api/auth/login') {
      const { nickname } = await request.json();
      if (!nickname || nickname.length < 2) {
        return jsonResponse({ error: '昵称至少2个字符' }, 400);
      }
      
      const userId = 'stu_' + Date.now().toString(36);
      const user = { userId, nickname, role: 'student', created: Date.now() };
      await KV.put(userId, JSON.stringify(user));
      
      return jsonResponse({ success: true, user, isNew: true });
    }
    
    // 2. 阅读打卡
    if (path === '/api/checkin/reading') {
      const { userId, articleId, duration, wordsRead } = await request.json();
      const checkin = {
        userId, articleId, duration, wordsRead,
        date: new Date().toISOString().split('T')[0],
        timestamp: Date.now()
      };
      const key = `checkin_${userId}_${Date.now()}`;
      await KV.put(key, JSON.stringify(checkin));
      
      return jsonResponse({ success: true, checkin });
    }
    
    // 3. 打字成绩提交
    if (path === '/api/typing/result') {
      const { userId, wpm, accuracy, courseName } = await request.json();
      const result = {
        userId, wpm, accuracy, courseName,
        date: new Date().toISOString().split('T')[0],
        timestamp: Date.now()
      };
      const key = `typing_${userId}_${Date.now()}`;
      await KV.put(key, JSON.stringify(result));
      
      return jsonResponse({ success: true, result });
    }
    
    // 4. 打字排行榜
    if (path === '/api/rank/typing') {
      const { results } = await env.TYPEREADING_KV.list({ prefix: 'typing_' });
      const scores = [];
      for (const key of results) {
        const data = await KV.get(key.name);
        if (data) scores.push(JSON.parse(data));
      }
      scores.sort((a, b) => b.wpm - a.wpm);
      return jsonResponse({ success: true, rank: scores.slice(0, 20) });
    }

    return jsonResponse({ error: 'Not Found' }, 404);
    
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// 同时支持 GET 请求
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  if (url.pathname === '/api/rank/typing') {
    return onRequestPost(context);
  }
  
  return new Response(JSON.stringify({ status: 'API is running' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
