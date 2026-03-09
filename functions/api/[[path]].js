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
    // 1. 学生注册（带密码）
    if (path === '/api/auth/register') {
      const body = await request.json().catch(() => ({}));
      const { nickname, password, realName, gender } = body;
      
      if (!nickname || nickname.length < 2) {
        return jsonResponse({ error: '昵称至少2个字符' }, 400);
      }
      if (!password || password.length < 4) {
        return jsonResponse({ error: '密码至少4位' }, 400);
      }
      
      // 检查昵称是否已存在
      const list = await KV.list();
      for (const key of list.keys || []) {
        if (key.name.startsWith('stu_')) {
          const userData = await KV.get(key.name);
          if (userData) {
            const user = JSON.parse(userData);
            if (user.nickname === nickname) {
              return jsonResponse({ error: '该昵称已被注册' }, 400);
            }
          }
        }
      }
      
      const userId = 'stu_' + Date.now().toString(36);
      const user = { 
        userId, 
        nickname, 
        password, // 实际应该加密
        realName: realName || '',
        gender: gender || '',
        role: 'student', 
        created: Date.now(),
        lastLogin: Date.now()
      };
      await KV.put(userId, JSON.stringify(user));
      
      return jsonResponse({ success: true, user: { ...user, password: undefined }, isNew: true });
    }
    
    // 2. 学生登录（昵称+密码）
    if (path === '/api/auth/login') {
      const body = await request.json().catch(() => ({}));
      const { nickname, password, realName, gender } = body;
      
      // 查找用户
      let user = null;
      let userKey = null;
      
      const list = await KV.list();
      for (const key of list.keys || []) {
        if (key.name.startsWith('stu_')) {
          const userData = await KV.get(key.name);
          if (userData) {
            const u = JSON.parse(userData);
            if (u.nickname === nickname) {
              user = u;
              userKey = key.name;
              break;
            }
          }
        }
      }
      
      // 如果用户不存在，自动注册（兼容旧版）
      if (!user) {
        if (!password) {
          // 旧版无密码注册
          if (!nickname || nickname.length < 2) {
            return jsonResponse({ error: '昵称至少2个字符' }, 400);
          }
          
          const userId = 'stu_' + Date.now().toString(36);
          user = { 
            userId, 
            nickname, 
            realName: realName || '',
            gender: gender || '',
            password: '',
            role: 'student', 
            created: Date.now(),
            lastLogin: Date.now()
          };
          await KV.put(userId, JSON.stringify(user));
          
          return jsonResponse({ success: true, user, isNew: true });
        } else {
          return jsonResponse({ error: '用户不存在，请先注册' }, 404);
        }
      }
      
      // 验证密码（如果设置了密码）
      if (user.password && user.password !== password) {
        return jsonResponse({ error: '密码错误' }, 401);
      }
      
      // 更新登录时间
      user.lastLogin = Date.now();
      // 如果提供了真实姓名和性别，更新信息
      if (realName) user.realName = realName;
      if (gender) user.gender = gender;
      
      await KV.put(userKey || user.userId, JSON.stringify(user));
      
      // 返回用户信息（不含密码）
      const { password: pwd, ...userWithoutPassword } = user;
      return jsonResponse({ success: true, user: userWithoutPassword, isNew: false });
    }
    
    // 3. 更新用户信息（补充真实姓名和性别）
    if (path === '/api/user/update') {
      const body = await request.json().catch(() => ({}));
      const { userId, realName, gender } = body;
      
      if (!userId) {
        return jsonResponse({ error: '需要用户ID' }, 400);
      }
      
      const userData = await KV.get(userId);
      if (!userData) {
        return jsonResponse({ error: '用户不存在' }, 404);
      }
      
      const user = JSON.parse(userData);
      if (realName !== undefined) user.realName = realName;
      if (gender !== undefined) user.gender = gender;
      
      await KV.put(userId, JSON.stringify(user));
      
      const { password, ...userWithoutPassword } = user;
      return jsonResponse({ success: true, user: userWithoutPassword });
    }
    
    // 4. 阅读打卡
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
    
    // 5. 打字成绩提交
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
    
    // 6. 查询今日打卡状态
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
    
    // 7. 排行榜
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
    
    // 8. 教师登录验证
    if (path === '/api/admin/login') {
      const body = await request.json().catch(() => ({}));
      const { password } = body;
      
      if (password === 'teacher123') {
        return jsonResponse({ 
          success: true, 
          token: 'admin_' + Date.now(),
          role: 'admin'
        });
      }
      
      return jsonResponse({ error: '密码错误' }, 401);
    }
    
    // 9. 获取所有学生列表（教师用）
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
                // 不返回密码
                const { password, ...userWithoutPassword } = user;
                students.push(userWithoutPassword);
              } catch (e) {}
            }
          }
        }
        
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
