// 处理 POST 请求
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const KV = env.TYPEREADING_KV;
  
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
      const user = { 
        userId, 
        nickname, 
        role: 'student', 
        created: Date.now(),
        lastLogin: Date.now()
      };
      await KV.put(userId, JSON.stringify(user));
      
      return jsonResponse({ success: true, user, isNew: true });
    }
    
    // 2. 阅读打卡
    if (path === '/api/checkin/reading') {
      const { userId, articleId, duration, wordsRead } = await request.json();
      const checkin = {
        userId, 
        articleId: articleId || 'default', 
        duration: duration || 0, 
        wordsRead: wordsRead || 0,
        date: new Date().toISOString().split('T')[0],
        timestamp: Date.now()
      };
      const key = `checkin__`;
      await KV.put(key, JSON.stringify(checkin));
      
      return jsonResponse({ success: true, checkin });
    }
    
    // 3. 打字成绩提交
    if (path === '/api/typing/result') {
      const { userId, wpm, accuracy, courseName } = await request.json();
      const result = {
        userId, 
        wpm: wpm || 0, 
        accuracy: accuracy || 0, 
        courseName: courseName || 'default',
        date: new Date().toISOString().split('T')[0],
        timestamp: Date.now()
      };
      const key = `typing__`;
      await KV.put(key, JSON.stringify(result));
      
      return jsonResponse({ success: true, result });
    }

    return jsonResponse({ error: 'API endpoint not found: ' + path }, 404);
    
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// 处理 GET 请求（排行榜等）
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const KV = env.TYPEREADING_KV;
  
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    // 排行榜
    if (path === '/api/rank/typing') {
      const list = await KV.list({ prefix: 'typing_' });
      const scores = [];
      
      for (const key of list.keys || []) {
        const data = await KV.get(key.name);
        if (data) {
          try {
            const score = JSON.parse(data);
            // 获取用户信息
            const userData = await KV.get(score.userId);
            const user = userData ? JSON.parse(userData) : null;
            scores.push({
              ...score,
              nickname: user?.nickname || '匿名用户'
            });
          } catch(e) {}
        }
      }
      
      scores.sort((a, b) => (b.wpm || 0) - (a.wpm || 0));
      return jsonResponse({ success: true, rank: scores.slice(0, 20) });
    }

    return jsonResponse({ error: 'No GET endpoint: ' + path }, 404);
    
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}
