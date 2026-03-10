export async function onRequest(context) {
  const { request, env } = context;
  
  const url = new URL(request.url);
  const pathParts = url.pathname.replace('/api/', '').split('/').filter(Boolean);
  const path = pathParts.join('/');
  
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
    // ========== 学生注册 ==========
    if (path === 'auth/register' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, password, gender, realName } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '昵称不能为空' }, headers);
      }
      
      const userKey = `user:${nickname}`;
      const existing = await env.TYPEREADING_KV.get(userKey);
      if (existing) {
        return jsonResponse({ success: false, message: '该昵称已被注册' }, headers);
      }
      
      const userData = {
        nickname,
        password: password || null,
        gender: gender || null,
        realName: realName || null,
        className: null,  // 新增：班级字段
        createdAt: new Date().toISOString(),
        hasPassword: !!password
      };
      
      await env.TYPEREADING_KV.put(userKey, JSON.stringify(userData));
      
      return jsonResponse({ 
        success: true, 
        message: '注册成功',
        user: { nickname, gender, realName }
      }, headers);
    }

    // ========== 学生登录 ==========
    if (path === 'auth/login' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, password } = body;
      
      const userKey = `user:${nickname}`;
      const userData = await env.TYPEREADING_KV.get(userKey);
      if (!userData) {
        return jsonResponse({ success: false, message: '用户不存在' }, headers);
      }
      
      const user = JSON.parse(userData);
      
      if (user.password && user.password !== password) {
        return jsonResponse({ success: false, message: '密码错误' }, headers);
      }
      
      return jsonResponse({ 
        success: true, 
        message: '登录成功',
        user: {
          nickname: user.nickname,
          gender: user.gender,
          realName: user.realName,
          className: user.className
        }
      }, headers);
    }

    // ========== 更新用户信息（学生端）==========
    if (path === 'user/update' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, realName, gender } = body;
      
      const userKey = `user:${nickname}`;
      const userData = await env.TYPEREADING_KV.get(userKey);
      if (!userData) {
        return jsonResponse({ success: false, message: '用户不存在' }, headers);
      }
      
      const user = JSON.parse(userData);
      if (realName !== undefined) user.realName = realName;
      if (gender !== undefined) user.gender = gender;
      
      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
      
      return jsonResponse({ 
        success: true, 
        message: '更新成功',
        user: {
          nickname: user.nickname,
          gender: user.gender,
          realName: user.realName,
          className: user.className
        }
      }, headers);
    }

    // ========== 教师登录 ==========
    if (path === 'admin/login' && request.method === 'POST') {
      const body = await request.json();
      if (body.password === 'teacher123') {
        return jsonResponse({ success: true, message: '登录成功' }, headers);
      }
      return jsonResponse({ success: false, message: '密码错误' }, headers);
    }

    // ========== 获取学生列表 ==========
    if (path === 'admin/students' && request.method === 'POST') {
      try {
        const { keys } = await env.TYPEREADING_KV.list({ prefix: 'user:' });
        const students = [];
        
        for (const key of keys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            const user = JSON.parse(data);
            students.push({
              nickname: user.nickname,
              realName: user.realName || '',
              gender: user.gender || '',
              className: user.className || '',
              hasPassword: !!user.password,
              createdAt: user.createdAt
            });
          }
        }
        
        students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return jsonResponse({ 
          success: true, 
          students: students,
          count: students.length
        }, headers);
      } catch (e) {
        return jsonResponse({ 
          success: false, 
          message: '获取失败: ' + e.message 
        }, headers);
      }
    }

    // ========== 更新学生信息（教师后台）==========
    if (path === 'admin/student/update' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, realName, gender, className } = body;
      
      const userKey = `user:${nickname}`;
      const userData = await env.TYPEREADING_KV.get(userKey);
      if (!userData) {
        return jsonResponse({ success: false, message: '学生不存在' }, headers);
      }
      
      const user = JSON.parse(userData);
      if (realName !== undefined) user.realName = realName;
      if (gender !== undefined) user.gender = gender;
      if (className !== undefined) user.className = className;
      
      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
      
      return jsonResponse({ success: true, message: '更新成功', user }, headers);
    }

    // ========== 创建班级 ==========
    if (path === 'admin/class/create' && request.method === 'POST') {
      const body = await request.json();
      const { className } = body;
      
      if (!className) {
        return jsonResponse({ success: false, message: '班级名称不能为空' }, headers);
      }
      
      const classKey = `class:${className}`;
      await env.TYPEREADING_KV.put(classKey, JSON.stringify({
        name: className,
        createdAt: new Date().toISOString()
      }));
      
      return jsonResponse({ success: true, message: '班级创建成功' }, headers);
    }

    // ========== 获取班级列表 ==========
    if (path === 'admin/classes' && request.method === 'POST') {
      try {
        const { keys } = await env.TYPEREADING_KV.list({ prefix: 'class:' });
        const classes = [];
        
        for (const key of keys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            classes.push(JSON.parse(data));
          }
        }
        
        return jsonResponse({ success: true, classes }, headers);
      } catch (e) {
        return jsonResponse({ success: false, message: '获取失败: ' + e.message }, headers);
      }
    }

    // ========== 分班（给学生分配班级）==========
    if (path === 'admin/student/assign-class' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, className } = body;
      
      const userKey = `user:${nickname}`;
      const userData = await env.TYPEREADING_KV.get(userKey);
      if (!userData) {
        return jsonResponse({ success: false, message: '学生不存在' }, headers);
      }
      
      const user = JSON.parse(userData);
      user.className = className || null;
      
      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
      
      return jsonResponse({ success: true, message: '分班成功', user }, headers);
    }

    // ========== 提交阅读打卡 ==========
    if (path === 'checkin/reading' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, articleTitle, wordCount } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '用户未登录' }, headers);
      }
      
      const today = new Date().toISOString().split('T')[0];
      const timestamp = Date.now();
      const recordKey = `reading:${nickname}:${timestamp}`;
      
      const record = {
        nickname,
        articleTitle: articleTitle || '未命名文章',
        wordCount: parseInt(wordCount) || 0,
        date: today,
        timestamp: new Date().toISOString()
      };
      
      await env.TYPEREADING_KV.put(recordKey, JSON.stringify(record));
      
      return jsonResponse({ success: true, message: '打卡成功', record }, headers);
    }

    // ========== 获取阅读记录 ==========
    if (path === 'user/reading-records' && request.method === 'POST') {
      const body = await request.json();
      const { nickname } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '用户未指定' }, headers);
      }
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: `reading:${nickname}:` });
      const records = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          records.push(JSON.parse(data));
        }
      }
      
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return jsonResponse({ success: true, records }, headers);
    }

    // ========== 提交打字成绩 ==========
    if (path === 'typing/result' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, wpm, accuracy, text } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '用户未登录' }, headers);
      }
      
      const timestamp = Date.now();
      const recordKey = `typing:${nickname}:${timestamp}`;
      
      const recordData = {
        nickname,
        wpm: parseInt(wpm) || 0,
        accuracy: parseInt(accuracy) || 0,
        text: text || '',
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      };
      
      await env.TYPEREADING_KV.put(recordKey, JSON.stringify(recordData));
      
      return jsonResponse({ success: true, message: '记录已保存', record: recordData }, headers);
    }

    // ========== 获取打字记录 ==========
    if (path === 'user/typing-records' && request.method === 'POST') {
      const body = await request.json();
      const { nickname } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '用户未指定' }, headers);
      }
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: `typing:${nickname}:` });
      const records = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          records.push(JSON.parse(data));
        }
      }
      
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return jsonResponse({ success: true, records }, headers);
    }

    // ========== 打字排行榜（仅显示有真实姓名的学生）==========
    if (path === 'rank/typing' && request.method === 'POST') {
      try {
        // 获取所有打字记录
        const { keys } = await env.TYPEREADING_KV.list({ prefix: 'typing:' });
        const allRecords = [];
        
        for (const key of keys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            const record = JSON.parse(data);
            // 检查用户是否有真实姓名
            const userKey = `user:${record.nickname}`;
            const userData = await env.TYPEREADING_KV.get(userKey);
            if (userData) {
              const user = JSON.parse(userData);
              // 只有有真实姓名的学生才能上排行榜
              if (user.realName && user.realName.trim() !== '') {
                allRecords.push({
                  ...record,
                  realName: user.realName,
                  className: user.className || ''
                });
              }
            }
          }
        }
        
        // 按WPM排序，取最高的
        allRecords.sort((a, b) => b.wpm - a.wpm);
        
        // 取每个用户的最佳成绩
        const userBest = {};
        allRecords.forEach(r => {
          if (!userBest[r.nickname] || userBest[r.nickname].wpm < r.wpm) {
            userBest[r.nickname] = r;
          }
        });
        
        const rank = Object.values(userBest).slice(0, 20);
        
        return jsonResponse({ success: true, rank }, headers);
      } catch (e) {
        return jsonResponse({ success: false, message: '获取失败: ' + e.message }, headers);
      }
    }

    // ========== 获取学习统计 ==========
    if (path === 'user/stats' && request.method === 'POST') {
      const body = await request.json();
      const { nickname } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '用户未指定' }, headers);
      }
      
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const weekStart = getWeekStart(now);
      const thisMonth = today.substring(0, 7);
      const thisYear = today.substring(0, 4);
      
      // 获取阅读记录
      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: `reading:${nickname}:` });
      const readingRecords = [];
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) readingRecords.push(JSON.parse(data));
      }
      
      // 获取打字记录
      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: `typing:${nickname}:` });
      const typingRecords = [];
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) typingRecords.push(JSON.parse(data));
      }
      
      // 计算统计
      const stats = {
        reading: {
          day: calcReadingStats(readingRecords, today),
          week: calcReadingStats(readingRecords, weekStart, 'week'),
          month: calcReadingStats(readingRecords, thisMonth, 'month'),
          year: calcReadingStats(readingRecords, thisYear, 'year'),
          total: {
            count: readingRecords.length,
            words: readingRecords.reduce((sum, r) => sum + (r.wordCount || 0), 0)
          }
        },
        typing: {
          day: calcTypingStats(typingRecords, today),
          week: calcTypingStats(typingRecords, weekStart, 'week'),
          month: calcTypingStats(typingRecords, thisMonth, 'month'),
          year: calcTypingStats(typingRecords, thisYear, 'year'),
          total: {
            count: typingRecords.length,
            avgWpm: typingRecords.length > 0 
              ? Math.round(typingRecords.reduce((sum, r) => sum + (r.wpm || 0), 0) / typingRecords.length)
              : 0
          }
        }
      };
      
      return jsonResponse({ success: true, stats }, headers);
    }

    return jsonResponse({ success: false, message: '接口不存在：' + path }, headers, 404);

  } catch (error) {
    return jsonResponse({ success: false, message: '服务器错误: ' + error.message }, headers, 500);
  }
}

// 辅助函数
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function calcReadingStats(records, period, type = 'day') {
  const filtered = records.filter(r => {
    if (type === 'day') return r.date === period;
    if (type === 'week') return r.date >= period;
    if (type === 'month') return r.date.startsWith(period);
    if (type === 'year') return r.date.startsWith(period);
    return false;
  });
  
  return {
    count: filtered.length,
    words: filtered.reduce((sum, r) => sum + (r.wordCount || 0), 0)
  };
}

function calcTypingStats(records, period, type = 'day') {
  const filtered = records.filter(r => {
    if (type === 'day') return r.date === period;
    if (type === 'week') return r.date >= period;
    if (type === 'month') return r.date.startsWith(period);
    if (type === 'year') return r.date.startsWith(period);
    return false;
  });
  
  const avgWpm = filtered.length > 0 
    ? Math.round(filtered.reduce((sum, r) => sum + (r.wpm || 0), 0) / filtered.length)
    : 0;
    
  const avgAccuracy = filtered.length > 0
    ? Math.round(filtered.reduce((sum, r) => sum + (r.accuracy || 0), 0) / filtered.length)
    : 0;
  
  return {
    count: filtered.length,
    avgWpm,
    avgAccuracy
  };
}

function jsonResponse(data, headers, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}
