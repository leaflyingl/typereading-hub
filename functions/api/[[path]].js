// Cloudflare Functions - 完整版（含管理功能）
export async function onRequestPost(context) {
  return handleRequest(context);
}

export async function onRequestGet(context) {
  return handleRequest(context);
}

async function handleRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const KV = env.TYPEREADING_KV;
  
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  };

  try {
    // 1. 登录/注册（学生）
    if (path === '/api/auth/login') {
      const body = await request.json().catch(() => ({}));
      const { nickname, realName, gender } = body;
      
      if (!nickname || nickname.length < 2) {
        return jsonResponse({ error: '昵称至少2个字符' }, 400);
      }
      
      const userId = 'stu_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
      const user = { 
        userId, 
        nickname, 
        realName: realName || '',
        gender: gender || '',
        role: 'student', 
        created: Date.now(),
        lastLogin: Date.now()
      };
      await KV.put(userId, JSON.stringify(user));
      
      return jsonResponse({ success: true, user, isNew: true });
    }
    
    // 2. 阅读打卡
    if (path === '/api/checkin/reading') {
      const body = await request.json().catch(() => ({}));
      const { userId, articleId, duration, wordsRead } = body;
      
      if (!userId) {
        return jsonResponse({ error: '用户ID必填' }, 400);
      }
      
      const today = new Date().toISOString().split('T')[0];
      const checkinKey = `checkin_`;
      const checkin = {
        userId, 
        articleId: articleId || 'default', 
        duration: duration || 0, 
        wordsRead: wordsRead || 0,
        date: today,
        timestamp: Date.now()
      };
      
      await KV.put(checkinKey, JSON.stringify(checkin));
      
      const historyKey = `history_`;
      const existing = await KV.get(historyKey);
      const history = existing ? JSON.parse(existing) : [];
      history.push(checkin);
      await KV.put(historyKey, JSON.stringify(history));
      
      return jsonResponse({ success: true, checkin });
    }
    
    // 3. 打字成绩提交
    if (path === '/api/typing/result') {
      const body = await request.json().catch(() => ({}));
      const { userId, wpm, accuracy, courseName, textId } = body;
      
      if (!userId) {
        return jsonResponse({ error: '用户ID必填' }, 400);
      }
      
      const result = {
        userId, 
        wpm: wpm || 0, 
        accuracy: accuracy || 0, 
        courseName: courseName || 'default',
        textId: textId || '',
        timestamp: Date.now()
      };
      
      const scoreId = `typing_`;
      await KV.put(scoreId, JSON.stringify(result));
      
      const historyKey = `typinghistory_`;
      const existing = await KV.get(historyKey);
      const history = existing ? JSON.parse(existing) : [];
      history.push(result);
      await KV.put(historyKey, JSON.stringify(history));
      
      return jsonResponse({ success: true, result, attemptNumber: history.length });
    }
    
    // 4. 查询今日打卡状态
    if (path === '/api/checkin/status') {
      const userId = url.searchParams.get('userId');
      
      if (!userId) {
        return jsonResponse({ error: '需要userId' }, 400);
      }
      
      const today = new Date().toISOString().split('T')[0];
      const checkinKey = `checkin_`;
      const data = await KV.get(checkinKey);
      
      if (data) {
        const checkin = JSON.parse(data);
        return jsonResponse({ success: true, hasCheckedIn: true, checkin });
      }
      
      return jsonResponse({ success: true, hasCheckedIn: false });
    }
    
    // 5. 排行榜
    if (path === '/api/rank/typing') {
      try {
        const list = await KV.list({ prefix: 'typing_' });
        const scores = [];
        
        const keys = list.keys || [];
        
        for (const key of keys) {
          try {
            const data = await KV.get(key.name);
            if (data) {
              const score = JSON.parse(data);
              if (score.userId) {
                const userData = await KV.get(score.userId);
                const user = userData ? JSON.parse(userData) : null;
                scores.push({
                  ...score,
                  nickname: user?.nickname || '匿名用户',
                  realName: user?.realName || ''
                });
              }
            }
          } catch (e) {}
        }
        
        scores.sort((a, b) => (b.wpm || 0) - (a.wpm || 0));
        const top20 = scores.slice(0, 20);
        
        return jsonResponse({ 
          success: true, 
          rank: top20,
          total: scores.length
        });
      } catch (err) {
        return jsonResponse({ error: '读取排行榜失败: ' + err.message }, 500);
      }
    }
    
    // 6. 教师登录验证
    if (path === '/api/admin/login') {
      const body = await request.json().catch(() => ({}));
      const { password } = body;
      
      // 默认密码：teacher123（实际应该使用环境变量存储）
      if (password === 'teacher123') {
        return jsonResponse({ 
          success: true, 
          token: 'admin_' + Date.now(),
          role: 'admin'
        });
      }
      
      return jsonResponse({ error: '密码错误' }, 401);
    }
    
    // 7. 获取所有学生列表（教师用）
    if (path === '/api/admin/students') {
      try {
        const list = await KV.list();
        const students = [];
        
        for (const key of list.keys || []) {
          if (key.name.startsWith('stu_')) {
            const data = await KV.get(key.name);
            if (data) {
              try {
                const user = JSON.parse(data);
                students.push(user);
              } catch (e) {}
            }
          }
        }
        
        // 按注册时间倒序
        students.sort((a, b) => (b.created || 0) - (a.created || 0));
        
        return jsonResponse({ success: true, students });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    return jsonResponse({ error: 'API endpoint not found: ' + path }, 404);
    
  } catch (err) {
    return jsonResponse({ error: '服务器错误: ' + err.message }, 500);
  }
}
