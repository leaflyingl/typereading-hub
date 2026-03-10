// Cloudflare Pages Function - TypeReading Hub API
// 路径: functions/api/[[path]].js

export async function onRequest(context) {
  const { request, env, params } = context;
  
  // 正确处理路径
  const path = params.path ? params.path.join('/') : '';
  
  // 处理 CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const jsonResponse = (data, status = 200) => 
    new Response(JSON.stringify(data), { status, headers });

  try {
    const body = request.method === 'POST' ? await request.json() : {};

    // ========== 学生认证相关 ==========
    
    // 学生注册
    if (path === 'auth/register') {
      const { nickname, password, realName, gender } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '请输入昵称' });
      }
      
      const existingUser = await env.TYPEREADING_KV.get(`user::`);
      if (existingUser) {
        return jsonResponse({ success: false, message: '该昵称已被注册' });
      }
      
      const user = {
        nickname,
        password: password || '',
        realName: realName || '',
        gender: gender || '',
        createdAt: new Date().toISOString(),
      };
      
      await env.TYPEREADING_KV.put(`user::`, JSON.stringify(user));
      
      return jsonResponse({ 
        success: true, 
        message: '注册成功',
        user: { nickname, realName, gender }
      });
    }

    // 学生登录
    if (path === 'auth/login') {
      const { nickname, password } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '请输入昵称' });
      }
      
      const userData = await env.TYPEREADING_KV.get(`user::`);
      if (!userData) {
        return jsonResponse({ success: false, message: '用户不存在' });
      }
      
      const user = JSON.parse(userData);
      
      if (user.password && user.password !== (password || '')) {
        return jsonResponse({ success: false, message: '密码错误' });
      }
      
      return jsonResponse({
        success: true,
        message: '登录成功',
        user: {
          nickname: user.nickname,
          realName: user.realName,
          gender: user.gender,
        }
      });
    }

    // 【关键修复】更新用户信息 - 必须放在 try 块内，与其他接口并列
    if (path === 'user/update') {
      const { nickname, realName, gender } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '缺少昵称参数' });
      }
      
      const userData = await env.TYPEREADING_KV.get(`user::`);
      if (!userData) {
        return jsonResponse({ success: false, message: '用户不存在' });
      }
      
      const user = JSON.parse(userData);
      user.realName = realName !== undefined ? realName : user.realName;
      user.gender = gender !== undefined ? gender : user.gender;
      user.updatedAt = new Date().toISOString();
      
      await env.TYPEREADING_KV.put(`user::`, JSON.stringify(user));
      
      return jsonResponse({
        success: true,
        message: '更新成功',
        user: {
          nickname: user.nickname,
          realName: user.realName,
          gender: user.gender,
        }
      });
    }

    // ========== 阅读打卡相关 ==========
    
    if (path === 'checkin/reading') {
      const { nickname } = body;
      const today = new Date().toISOString().split('T')[0];
      const key = `checkin::::`;
      
      const record = {
        nickname,
        date: today,
        type: 'reading',
        createdAt: new Date().toISOString(),
      };
      
      await env.TYPEREADING_KV.put(key, JSON.stringify(record));
      
      return jsonResponse({ success: true, message: '打卡成功' });
    }

    if (path === 'checkin/status') {
      const { nickname } = body;
      const today = new Date().toISOString().split('T')[0];
      const key = `checkin::::`;
      
      const data = await env.TYPEREADING_KV.get(key);
      
      return jsonResponse({
        success: true,
        checkedIn: !!data,
      });
    }

    // ========== 打字练习相关 ==========
    
    if (path === 'typing/result') {
      const { nickname, wpm, accuracy, duration, text } = body;
      
      const record = {
        nickname,
        wpm,
        accuracy,
        duration,
        text,
        createdAt: new Date().toISOString(),
      };
      
      const key = `typing::::`;
      await env.TYPEREADING_KV.put(key, JSON.stringify(record));
      
      return jsonResponse({ success: true, message: '成绩已保存' });
    }

    if (path === 'rank/typing') {
      const { limit = 20 } = body;
      
      const list = await env.TYPEREADING_KV.list({ prefix: 'typing::' });
      const records = [];
      
      for (const key of list.keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          records.push(JSON.parse(data));
        }
      }
      
      const userBest = {};
      records.forEach(r => {
        if (!userBest[r.nickname] || r.wpm > userBest[r.nickname].wpm) {
          userBest[r.nickname] = r;
        }
      });
      
      const sorted = Object.values(userBest)
        .sort((a, b) => b.wpm - a.wpm)
        .slice(0, limit);
      
      return jsonResponse({ success: true, rank: sorted });
    }

    // ========== 教师管理相关 ==========
    
    if (path === 'admin/login') {
      const { password } = body;
      const TEACHER_PASSWORD = 'teacher123';
      
      if (password === TEACHER_PASSWORD) {
        return jsonResponse({ success: true, message: '登录成功' });
      } else {
        return jsonResponse({ success: false, message: '密码错误' });
      }
    }

    if (path === 'admin/students') {
      const list = await env.TYPEREADING_KV.list({ prefix: 'user::' });
      const students = [];
      
      for (const key of list.keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const user = JSON.parse(data);
          students.push({
            nickname: user.nickname,
            realName: user.realName || '',
            gender: user.gender || '',
            createdAt: user.createdAt,
          });
        }
      }
      
      return jsonResponse({ success: true, students });
    }

    if (path === 'admin/student-records') {
      const { nickname } = body;
      
      if (!nickname) {
        return jsonResponse({ success: false, message: '缺少昵称参数' });
      }
      
      const records = [];
      
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const key = `checkin::::`;
        
        const data = await env.TYPEREADING_KV.get(key);
        if (data) {
          records.push({
            date: dateStr,
            type: '阅读打卡',
            detail: '已完成'
          });
        }
      }
      
      const typingList = await env.TYPEREADING_KV.list({ prefix: `typing::::` });
      for (const key of typingList.keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const record = JSON.parse(data);
          records.push({
            date: record.createdAt,
            type: '打字练习',
            detail: ` WPM / %`
          });
        }
      }
      
      records.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      return jsonResponse({ 
        success: true, 
        records: records.slice(0, 50),
        total: records.length
      });
    }

    // 404 - 未匹配的接口
    console.log('未匹配的API路径:', path);
    return jsonResponse({ 
      success: false, 
      message: 'API 接口不存在: ' + path 
    }, 404);
    
  } catch (error) {
    console.error('API Error:', error);
    return jsonResponse({ 
      success: false, 
      message: '服务器错误: ' + error.message 
    }, 500);
  }
}
