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
      
      // 修复：使用正确的键名格式
      const userKey = `user:`;
      const existing = await env.TYPEREADING_KV.get(userKey);
      if (existing) {
        return jsonResponse({ success: false, message: '该昵称已被注册' }, headers);
      }
      
      const userData = {
        nickname,
        password: password || null,
        gender: gender || null,
        realName: realName || null,
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
      
      const userKey = `user:`;
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
          realName: user.realName
        }
      }, headers);
    }

    // ========== 更新用户信息 ==========
    if (path === 'user/update' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, realName, gender } = body;
      
      const userKey = `user:`;
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
          realName: user.realName
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

    // ========== 获取学生列表（修复：返回所有用户）==========
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
              hasPassword: !!user.password,
              createdAt: user.createdAt
            });
          }
        }
        
        // 按注册时间排序（最新的在前）
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

    // ========== 更新学生信息（教师后台用）==========
    if (path === 'admin/student/update' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, realName, gender, className } = body;
      
      const userKey = `user:`;
      const userData = await env.TYPEREADING_KV.get(userKey);
      if (!userData) {
        return jsonResponse({ success: false, message: '学生不存在' }, headers);
      }
      
      const user = JSON.parse(userData);
      if (realName !== undefined) user.realName = realName;
      if (gender !== undefined) user.gender = gender;
      if (className !== undefined) user.className = className;
      
      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
      
      return jsonResponse({ success: true, message: '更新成功' }, headers);
    }

    // ========== 提交阅读打卡 ==========
    if (path === 'checkin/reading' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, articleTitle, wordCount } = body;
      
      const today = new Date().toISOString().split('T')[0];
      const recordKey = `reading::`;
      
      const record = {
        nickname,
        articleTitle,
        wordCount: parseInt(wordCount) || 0,
        date: today,
        timestamp: new Date().toISOString()
      };
      
      await env.TYPEREADING_KV.put(recordKey, JSON.stringify(record));
      
      return jsonResponse({ success: true, message: '打卡成功' }, headers);
    }

    // ========== 获取阅读记录 ==========
    if (path === 'user/reading-records' && request.method === 'POST') {
      const body = await request.json();
      const { nickname } = body;
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: `reading:` });
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
      
      // 修复：使用正确的键名格式
      const recordKey = `typing::`;
      const recordData = {
        nickname,
        wpm: parseInt(wpm) || 0,
        accuracy: parseInt(accuracy) || 0,
        text: text || '',
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date().toISOString()
      };
      
      await env.TYPEREADING_KV.put(recordKey, JSON.stringify(recordData));
      
      return jsonResponse({ success: true, message: '记录已保存' }, headers);
    }

    // ========== 获取打字记录 ==========
    if (path === 'user/typing-records' && request.method === 'POST') {
      const body = await request.json();
      const { nickname } = body;
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: `typing:` });
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

    // ========== 打字排行榜（修复：只显示有真实姓名的学生）==========
    if (path === 'rank/typing' && request.method === 'POST') {
      try {
        const { keys } = await env.TYPEREADING_KV.list({ prefix: 'typing:' });
        const records = [];
        
        for (const key of keys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            const record = JSON.parse(data);
            // 检查用户是否有真实姓名
            const userKey = `user:`;
            const userData = await env.TYPEREADING_KV.get(userKey);
            if (userData) {
              const user = JSON.parse(userData);
              // 只有有真实姓名的学生才能上排行榜
              if (user.realName && user.realName.trim() !== '') {
                records.push({
                  ...record,
                  realName: user.realName
                });
              }
            }
          }
        }
        
        // 按WPM排序
        records.sort((a, b) => b.wpm - a.wpm);
        
        return jsonResponse({ 
          success: true, 
          rank: records.slice(0, 20)
        }, headers);
      } catch (e) {
        return jsonResponse({ success: false, message: '获取失败: ' + e.message }, headers);
      }
    }

    // ========== 获取学习统计（日/周/月/年）==========
    if (path === 'user/stats' && request.method === 'POST') {
      const body = await request.json();
      const { nickname } = body;
      
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const thisWeek = getWeekStart(now);
      const thisMonth = today.substring(0, 7); // YYYY-MM
      const thisYear = today.substring(0, 4);  // YYYY
      
      // 获取阅读记录
      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: `reading:` });
      const readingRecords = [];
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) readingRecords.push(JSON.parse(data));
      }
      
      // 获取打字记录
      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: `typing:` });
      const typingRecords = [];
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) typingRecords.push(JSON.parse(data));
      }
      
      // 计算统计
      const stats = {
        reading: {
          day: calculateReadingStats(readingRecords, today),
          week: calculateReadingStats(readingRecords, thisWeek, 'week'),
          month: calculateReadingStats(readingRecords, thisMonth, 'month'),
          year: calculateReadingStats(readingRecords, thisYear, 'year'),
          total: {
            count: readingRecords.length,
            words: readingRecords.reduce((sum, r) => sum + (r.wordCount || 0), 0)
          }
        },
        typing: {
          day: calculateTypingStats(typingRecords, today),
          week: calculateTypingStats(typingRecords, thisWeek, 'week'),
          month: calculateTypingStats(typingRecords, thisMonth, 'month'),
          year: calculateTypingStats(typingRecords, thisYear, 'year'),
          total: {
            count: typingRecords.length,
            avgWpm: typingRecords.length > 0 
              ? Math.round(typingRecords.reduce((sum, r) => sum + r.wpm, 0) / typingRecords.length)
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

// 辅助函数：获取本周开始日期
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

// 辅助函数：计算阅读统计
function calculateReadingStats(records, period, type = 'day') {
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

// 辅助函数：计算打字统计
function calculateTypingStats(records, period, type = 'day') {
  const filtered = records.filter(r => {
    if (type === 'day') return r.date === period;
    if (type === 'week') return r.date >= period;
    if (type === 'month') return r.date.startsWith(period);
    if (type === 'year') return r.date.startsWith(period);
    return false;
  });
  
  const avgWpm = filtered.length > 0 
    ? Math.round(filtered.reduce((sum, r) => sum + r.wpm, 0) / filtered.length)
    : 0;
    
  const avgAccuracy = filtered.length > 0
    ? Math.round(filtered.reduce((sum, r) => sum + r.accuracy, 0) / filtered.length)
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
