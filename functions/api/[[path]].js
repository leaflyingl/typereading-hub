export async function onRequest(context) {
  const { request, env } = context;
  
  // 修复：正确解析路径
  const url = new URL(request.url);
  const pathParts = url.pathname.replace('/api/', '').split('/').filter(Boolean);
  const path = pathParts.join('/');
  
  // CORS 头
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
      
      // 检查是否已存在
      const existing = await env.TYPEREADING_KV.get(`user:${nickname}`);
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
      
      await env.TYPEREADING_KV.put(`user:${nickname}`, JSON.stringify(userData));
      
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
      
      const userData = await env.TYPEREADING_KV.get(`user:${nickname}`);
      if (!userData) {
        return jsonResponse({ success: false, message: '用户不存在' }, headers);
      }
      
      const user = JSON.parse(userData);
      
      // 无密码用户直接登录，有密码需验证
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

    // ========== 教师登录 ==========
    if (path === 'admin/login' && request.method === 'POST') {
      const body = await request.json();
      if (body.password === 'teacher123') {
        return jsonResponse({ success: true, message: '登录成功' }, headers);
      }
      return jsonResponse({ success: false, message: '密码错误' }, headers);
    }

    // ========== 获取学生列表（修复：确保正确返回）==========
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
              realName: user.realName,
              gender: user.gender,
              hasPassword: !!user.password,
              createdAt: user.createdAt
            });
          }
        }
        
        // 按注册时间排序
        students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        return jsonResponse({ 
          success: true, 
          students: students,
          count: students.length
        }, headers);
      } catch (e) {
        return jsonResponse({ 
          success: false, 
          message: '获取学生列表失败: ' + e.message 
        }, headers);
      }
    }

    // ========== 打字排行榜 ==========
    if (path === 'rank/typing' && request.method === 'POST') {
      try {
        const { keys } = await env.TYPEREADING_KV.list({ prefix: 'typing:' });
        const records = [];
        
        for (const key of keys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            const record = JSON.parse(data);
            records.push(record);
          }
        }
        
        // 按WPM排序
        records.sort((a, b) => b.wpm - a.wpm);
        
        return jsonResponse({ 
          success: true, 
          rank: records.slice(0, 20)
        }, headers);
      } catch (e) {
        return jsonResponse({ 
          success: false, 
          message: '获取排行榜失败: ' + e.message 
        }, headers);
      }
    }

    // ========== 提交打字成绩 ==========
    if (path === 'typing/result' && request.method === 'POST') {
      const body = await request.json();
      const { nickname, wpm, accuracy, text } = body;
      
      const recordKey = `typing:${nickname}:${Date.now()}`;
      const recordData = {
        nickname,
        wpm,
        accuracy,
        text,
        date: new Date().toISOString()
      };
      
      await env.TYPEREADING_KV.put(recordKey, JSON.stringify(recordData));
      
      return jsonResponse({ success: true, message: '记录已保存' }, headers);
    }

    // 未匹配的接口
    return jsonResponse({ 
      success: false, 
      message: '接口不存在：' + path 
    }, headers, 404);

  } catch (error) {
    return jsonResponse({ 
      success: false, 
      message: '服务器错误: ' + error.message 
    }, headers, 500);
  }
}

function jsonResponse(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}
