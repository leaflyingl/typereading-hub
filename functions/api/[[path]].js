export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, '');
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers });
  }

   // ← 在这里添加以下代码
  // ===== 辅助函数：检查用户是否受限 =====
async function checkUserRestricted(nickname) {
  if (!nickname) return true;
  const userKey = "user:" + nickname;
  const userData = await env.TYPEREADING_KV.get(userKey);
  if (!userData) return true;
  const user = JSON.parse(userData);
  return !user.className || user.isActive === false;
}

// ===== 辅助函数：检查并更新会员状态 =====
async function checkAndUpdateMembership(nickname, user, env) {
  // 如果没有会员信息，初始化为普通会员
  if (!user.membership) {
    user.membership = { 
      type: "basic",
      expiresAt: null,
      autoDowngrade: true
    };
    await env.TYPEREADING_KV.put("user:" + nickname, JSON.stringify(user));
    return user.membership;
  }
  
  // 检查是否过期（高级会员）
  if (user.membership.type === "premium" && user.membership.expiresAt) {
    const today = new Date().toISOString().split('T')[0];
    if (today > user.membership.expiresAt && user.membership.autoDowngrade !== false) {
      // 自动降级为普通会员
      user.membership.type = "basic";
      user.membership.expiresAt = null;
      await env.TYPEREADING_KV.put("user:" + nickname, JSON.stringify(user));
    }
  }
  
  return user.membership;
}

// ===== 辅助函数：获取用户完整信息（含会员状态）=====
async function getUserWithMembership(nickname, env) {
  const userKey = "user:" + nickname;
  const data = await env.TYPEREADING_KV.get(userKey);
  if (!data) return null;
  
  const user = JSON.parse(data);
  const membership = await checkAndUpdateMembership(nickname, user, env);
  
  return {
    nickname: user.nickname,
    realName: user.realName || "",
    gender: user.gender || "",
    className: user.className || "",
    isActive: user.isActive !== false,
    membership: membership,
    createdAt: user.createdAt
  };
}

// ===== 辅助函数：获取本周阅读材料（改为7天周期）=====
async function getWeeklyReadingContent(nickname, clientDate, env) {
  if (!nickname) return null;
  
  // 查找用户的首次分配记录
  const { keys } = await env.TYPEREADING_KV.list({ prefix: "weekly:reading:" + nickname + ":" });
  
  if (keys.length === 0) {
    return null; // 从未分配过
  }
  
  // 找到最新的分配记录
  let latestKey = null;
  let latestDate = null;
  
  for (const key of keys) {
    // 从key中提取日期：weekly:reading:nickname:YYYY-MM-DD
    const parts = key.name.split(":");
    if (parts.length >= 4) {
      const dateStr = parts[3];
      if (!latestDate || dateStr > latestDate) {
        latestDate = dateStr;
        latestKey = key.name;
      }
    }
  }
  
  if (!latestKey) return null;
  
  const data = await env.TYPEREADING_KV.get(latestKey);
  if (!data) return null;
  
  const content = JSON.parse(data);
  
  // 检查是否在7天有效期内
  let today;
  if (clientDate && typeof clientDate === 'string' && clientDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    today = clientDate;
  } else {
    const now = new Date();
    today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  }
  
  // 如果今天在有效期（分配日期+7天）内，返回内容
  if (content.expiresAt && today <= content.expiresAt) {
    return content;
  }
  
  return null; // 已过期
}

// ===== 辅助函数：分配本周阅读材料（改为7天周期）=====
async function assignWeeklyReadingContent(nickname, clientDate, content, env) {
  let today;
  if (clientDate && typeof clientDate === 'string' && clientDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    today = clientDate;
  } else {
    const now = new Date();
    today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  }
  
  // 计算7天后的日期
  const expireDate = new Date(today);
  expireDate.setDate(expireDate.getDate() + 7);
  const expiresAt = expireDate.getFullYear() + "-" + String(expireDate.getMonth() + 1).padStart(2, '0') + "-" + String(expireDate.getDate()).padStart(2, '0');
  
  const weekKey = "weekly:reading:" + nickname + ":" + today;
  
  await env.TYPEREADING_KV.put(weekKey, JSON.stringify({
    contentId: content.id,
    title: content.title,
    content: content.content,
    wordCount: content.wordCount,
    difficulty: content.difficulty,
    assignedAt: today,
    expiresAt: expiresAt // 7天后过期
  }));
}

// ===== 辅助函数：获取本周打字材料（改为7天周期）=====
async function getWeeklyTypingContent(nickname, clientDate, env) {
  if (!nickname) return null;
  
  const { keys } = await env.TYPEREADING_KV.list({ prefix: "weekly:typing:" + nickname + ":" });
  
  if (keys.length === 0) {
    return null;
  }
  
  let latestKey = null;
  let latestDate = null;
  
  for (const key of keys) {
    const parts = key.name.split(":");
    if (parts.length >= 4) {
      const dateStr = parts[3];
      if (!latestDate || dateStr > latestDate) {
        latestDate = dateStr;
        latestKey = key.name;
      }
    }
  }
  
  if (!latestKey) return null;
  
  const data = await env.TYPEREADING_KV.get(latestKey);
  if (!data) return null;
  
  const content = JSON.parse(data);
  
  let today;
  if (clientDate && typeof clientDate === 'string' && clientDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    today = clientDate;
  } else {
    const now = new Date();
    today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  }
  
  if (content.expiresAt && today <= content.expiresAt) {
    return content;
  }
  
  return null;
}

// ===== 辅助函数：分配本周打字材料（改为7天周期）=====
async function assignWeeklyTypingContent(nickname, clientDate, content, env) {
  let today;
  if (clientDate && typeof clientDate === 'string' && clientDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    today = clientDate;
  } else {
    const now = new Date();
    today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  }
  
  const expireDate = new Date(today);
  expireDate.setDate(expireDate.getDate() + 7);
  const expiresAt = expireDate.getFullYear() + "-" + String(expireDate.getMonth() + 1).padStart(2, '0') + "-" + String(expireDate.getDate()).padStart(2, '0');
  
  const weekKey = "weekly:typing:" + nickname + ":" + today;
  
  await env.TYPEREADING_KV.put(weekKey, JSON.stringify({
    contentId: content.id,
    title: content.title,
    content: content.content,
    wordCount: content.wordCount,
    difficulty: content.difficulty,
    assignedAt: today,
    expiresAt: expiresAt
  }));
}


  try {
    /* ========================= 学生注册 ========================== */
    if (path === "auth/register" && request.method === "POST") {
      const { nickname, password } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const userKey = "user:" + nickname;
      const exists = await env.TYPEREADING_KV.get(userKey);
      if (exists) {
        return json({ success: false, message: "该昵称已被注册" });
      }

      const userData = {
        nickname,
        password: password || null,
        realName: "",
        gender: "",
        className: "",
        isActive: true,
        membership: {
          type: "basic",
          expiresAt: null,
          autoDowngrade: true
        },
        createdAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(userData));
      return json({ 
        success: true, 
        user: {
          nickname,
          realName: "",
          gender: "",
          className: "",
          isActive: true,
          membership: userData.membership
        }
      });
    }

       /* ========================= 学生登录 ========================== */
    if (path === "auth/login" && request.method === "POST") {
      const { nickname, password } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const userKey = "user:" + nickname;
      const data = await env.TYPEREADING_KV.get(userKey);
      if (!data) {
        return json({ success: false, message: "用户不存在" });
      }

      const user = JSON.parse(data);
      if (user.password && user.password !== password) {
        return json({ success: false, message: "密码错误" });
      }

      // 检查并更新会员状态
      const membership = await checkAndUpdateMembership(nickname, user, env);

      return json({ 
        success: true, 
        user: {
          nickname: user.nickname,
          realName: user.realName || "",
          gender: user.gender || "",
          className: user.className || "",
          isActive: user.isActive !== false,
          membership: membership,
          createdAt: user.createdAt
        }
      });
    }

    /* ========================= 教师登录 ========================== */
    if (path === "admin/login" && request.method === "POST") {
      const { password } = await request.json();
      if (password === "teacher123") {
        return json({ success: true });
      }
      return json({ success: false, message: "密码错误" });
    }
    
    /* ========================= 获取所有学生 ========================== */
    if (path === "admin/students") {
      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const readingRecords = [];
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) readingRecords.push(JSON.parse(data));
      }

      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const typingRecords = [];
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) typingRecords.push(JSON.parse(data));
      }

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
      const students = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const user = JSON.parse(data);
          
          // 检查并更新会员状态
          const membership = await checkAndUpdateMembership(user.nickname, user, env);
          
          user.totalReadingWords = readingRecords
            .filter(r => r.nickname === user.nickname)
            .reduce((sum, r) => sum + (r.wordCount || 0), 0);
          user.totalTypingWords = typingRecords
            .filter(r => r.nickname === user.nickname)
            .reduce((sum, r) => sum + (r.wordCount || r.content?.length || 0), 0);

          // 确保返回会员信息
          user.membership = membership;
          
          students.push(user);
        }
      }
      students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ success: true, students });
    }

    /* ========================= 更新学生信息 ========================== */
    if (path === "admin/student/update") {
      const { nickname, realName, gender, className, isActive } = await request.json();  // ← 新增 isActive
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const userKey = "user:" + nickname;
      const data = await env.TYPEREADING_KV.get(userKey);
      if (!data) return json({ success: false, message: "用户不存在" });

      const user = JSON.parse(data);
      user.realName = realName || "";
      user.gender = gender || "";
      user.className = className || "";
      user.isActive = isActive !== false;  // ← 新增：默认 true

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
      return json({ success: true });
    }

        /* ========================= 教师更新会员信息 ========================== */
    if (path === "admin/membership/update" && request.method === "POST") {
      const { nickname, membership, payment } = await request.json();
      
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }
      
      if (!membership || !membership.type) {
        return json({ success: false, message: "会员类型不能为空" });
      }

      const userKey = "user:" + nickname;
      const data = await env.TYPEREADING_KV.get(userKey);
      if (!data) {
        return json({ success: false, message: "用户不存在" });
      }

      const user = JSON.parse(data);
      
      // 更新会员信息
      user.membership = {
        type: membership.type,
        expiresAt: membership.type === "premium" ? membership.expiresAt : null,
        autoDowngrade: membership.autoDowngrade !== false,
        updatedAt: new Date().toISOString()
      };

      // 保存缴费记录（如果有）
      if (payment && payment.amount) {
        const paymentKey = "payment:" + nickname + ":" + Date.now();
        await env.TYPEREADING_KV.put(paymentKey, JSON.stringify({
          nickname,
          amount: parseFloat(payment.amount),
          note: payment.note || "",
          date: payment.date || new Date().toISOString(),
          type: "membership",
          membershipType: membership.type,
          expiresAt: user.membership.expiresAt
        }));
      }

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
      
      return json({ 
        success: true, 
        message: "会员信息已更新",
        membership: user.membership
      });
    }

    /* ========================= 删除单个学生 ========================== */
    if (path === "admin/student/delete") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const userKey = "user:" + nickname;
      await env.TYPEREADING_KV.delete(userKey);

      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const record = JSON.parse(data);
          if (record.nickname === nickname) {
            await env.TYPEREADING_KV.delete(key.name);
          }
        }
      }

      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const record = JSON.parse(data);
          if (record.nickname === nickname) {
            await env.TYPEREADING_KV.delete(key.name);
          }
        }
      }

      return json({ success: true });
    }

    /* ========================= 批量删除学生 ========================== */
    if (path === "admin/student/delete-batch") {
      const { nicknames } = await request.json();
      if (!nicknames || !Array.isArray(nicknames) || nicknames.length === 0) {
        return json({ success: false, message: "未选择学生" });
      }

      for (const nickname of nicknames) {
        const userKey = "user:" + nickname;
        await env.TYPEREADING_KV.delete(userKey);

        const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
        for (const key of readingKeys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            const record = JSON.parse(data);
            if (record.nickname === nickname) {
              await env.TYPEREADING_KV.delete(key.name);
            }
          }
        }

        const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
        for (const key of typingKeys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            const record = JSON.parse(data);
            if (record.nickname === nickname) {
              await env.TYPEREADING_KV.delete(key.name);
            }
          }
        }
      }

      return json({ success: true });
    }

    /* ========================= 创建班级 ========================== */
    if (path === "admin/class/create") {
      const { className } = await request.json();
      if (!className) {
        return json({ success: false, message: "班级名称不能为空" });
      }

      const classKey = "class:" + className;
      await env.TYPEREADING_KV.put(
        classKey,
        JSON.stringify({
          name: className,
          createdAt: new Date().toISOString()
        })
      );

      return json({ success: true });
    }

    /* ========================= 获取班级列表 ========================== */
    if (path === "admin/classes") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "class:" });
      const classes = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) classes.push(JSON.parse(data));
      }
      return json({ success: true, classes });
    }

    /* ========================= 更新班级 ========================== */
    if (path === "admin/class/update") {
      const { oldClassName, newClassName } = await request.json();
      if (!oldClassName || !newClassName) {
        return json({ success: false, message: "班级名称不能为空" });
      }

      if (oldClassName !== newClassName) {
        const oldClassKey = "class:" + oldClassName;
        await env.TYPEREADING_KV.delete(oldClassKey);
        
        const { keys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
        for (const key of keys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (data) {
            const user = JSON.parse(data);
            if (user.className === oldClassName) {
              user.className = newClassName;
              await env.TYPEREADING_KV.put(key.name, JSON.stringify(user));
            }
          }
        }
      }

      const classKey = "class:" + newClassName;
      const classData = {
        name: newClassName,
        createdAt: new Date().toISOString()
      };
      await env.TYPEREADING_KV.put(classKey, JSON.stringify(classData));

      return json({ success: true });
    }

    /* ========================= 删除班级 ========================== */
    if (path === "admin/class/delete") {
      const { className } = await request.json();
      if (!className) {
        return json({ success: false, message: "班级名称不能为空" });
      }

      const classKey = "class:" + className;
      await env.TYPEREADING_KV.delete(classKey);

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const user = JSON.parse(data);
          if (user.className === className) {
            user.className = "";
            await env.TYPEREADING_KV.put(key.name, JSON.stringify(user));
          }
        }
      }

      const { keys: groupKeys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
      for (const key of groupKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const group = JSON.parse(data);
          if (group.classNames && group.classNames.includes(className)) {
            group.classNames = group.classNames.filter(c => c !== className);
            group.updatedAt = new Date().toISOString();
            await env.TYPEREADING_KV.put(key.name, JSON.stringify(group));
          }
        }
      }

      return json({ success: true });
    }

    /* ========================= 分组管理 API ========================== */
    if (path === "admin/groups/list") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
      const groups = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const group = JSON.parse(data);
          if (!group.classes && group.classNames) {
            group.classes = group.classNames;
          }
          groups.push(group);
        }
      }
      return json({ success: true, groups });
    }

    if (path === "admin/groups/save") {
      const { id, name, classes, classNames } = await request.json();

      if (!name) {
        return json({ success: false, message: "分组名称不能为空" });
      }

      const groupId = id || "group:" + Date.now();

      let createdAt = new Date().toISOString();
      if (id) {
        const oldData = await env.TYPEREADING_KV.get(id);
        if (oldData) {
          const oldGroup = JSON.parse(oldData);
          createdAt = oldGroup.createdAt || createdAt;
        }
      }

      const finalClasses = classes || classNames || [];

      const groupData = {
        id: groupId,
        name,
        classes: finalClasses,
        classNames: finalClasses,
        createdAt,
        updatedAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(groupId, JSON.stringify(groupData));
      return json({ success: true, group: groupData });
    }

    if (path === "admin/groups/delete") {
      const { id } = await request.json();
      if (!id) {
        return json({ success: false, message: "Missing group ID" });
      }
      await env.TYPEREADING_KV.delete(id);
      return json({ success: true });
    }

 /* ========================= 阅读打卡（稳定兼容版） ========================== */
if (path === "checkin/reading") {
  const { nickname, articleId, articleTitle, wordCount, date: clientDate } = await request.json();
  if (!nickname) {
    return json({ success: false, message: "昵称不能为空" });
  }

  let today;
  if (clientDate && typeof clientDate === 'string' && clientDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    today = clientDate;
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    today = year + "-" + month + "-" + day;
  }

  const { keys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
  for (const key of keys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const record = JSON.parse(data);
      if (record.nickname === nickname && record.date === today) {
        return json({ success: false, message: "今日已打卡，请勿重复打卡" });
      }
    }
  }

  const recordKey = "reading:" + nickname + ":" + Date.now();
  await env.TYPEREADING_KV.put(
    recordKey,
    JSON.stringify({
      nickname,
      articleId: articleId || "",
      articleTitle: articleTitle || "未命名文章",
      wordCount: Number(wordCount) || 0,
      date: today,
      timestamp: new Date().toISOString()
    })
  );
  return json({ success: true, message: "打卡成功", date: today });
}
    
  /* ========================= 查询今日打卡状态（稳定兼容版） ========================== */
if (path === "checkin/status") {
  const { nickname, date: clientDate } = await request.json();
  if (!nickname) {
    return json({ success: false, message: "昵称不能为空" });
  }

  let today;
  if (clientDate && typeof clientDate === 'string' && clientDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    today = clientDate;
  } else {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    today = year + "-" + month + "-" + day;
  }

  const { keys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
  let hasCheckedIn = false;
  let todayRecord = null;

  for (const key of keys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (!data) continue;
    const record = JSON.parse(data);
    if (record.nickname === nickname && record.date === today) {
      hasCheckedIn = true;
      todayRecord = record;
      break;
    }
  }

  return json({
    success: true,
    hasCheckedIn,
    record: todayRecord,
    debug: { checkDate: today }
  });
}
    
    /* ========================= 获取阅读记录 ========================== */
    if (path === "user/reading-records") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const records = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const r = JSON.parse(data);
        if (r.nickname === nickname) {
          records.push(r);
        }
      }
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return json({ success: true, records });
    }

    /* ========================= 获取打字记录 ========================== */
    if (path === "user/typing-records") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const records = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const r = JSON.parse(data);
        if (r.nickname === nickname) {
          records.push(r);
        }
      }
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return json({ success: true, records });
    }

    /* ========================= 打字记录提交 ========================== */
    if (path === "typing/result") {
      const { nickname, wpm, accuracy, wordCount, content } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const recordKey = "typing:" + nickname + ":" + Date.now();
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];

      const finalWordCount = Number(wordCount) || (content ? content.length : 0);

      await env.TYPEREADING_KV.put(
        recordKey,
        JSON.stringify({
          nickname,
          wpm: Number(wpm) || 0,
          accuracy: Number(accuracy) || 0,
          wordCount: finalWordCount,
          content: content || "",
          date: dateStr,
          timestamp: now.toISOString()
        })
      );

      return json({ success: true });
    }

    /* ========================= 获取学习统计 ========================== */
    if (path === "user/stats") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const today = new Date().toISOString().split("T")[0];
      const weekStart = getWeekStart(new Date());
      const thisMonth = today.substring(0, 7);
      const thisYear = today.substring(0, 4);

      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const readingRecords = [];
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const r = JSON.parse(data);
          if (!r.date && r.timestamp) {
            r.date = r.timestamp.split("T")[0];
          }
          readingRecords.push(r);
        }
      }

      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const typingRecords = [];
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const r = JSON.parse(data);
          if (!r.date && r.timestamp) {
            r.date = r.timestamp.split("T")[0];
          }
          typingRecords.push(r);
        }
      }

      const userReading = readingRecords.filter(r => r.nickname === nickname);
      const userTyping = typingRecords.filter(r => r.nickname === nickname);

      const stats = {
        reading: {
          day: calcStats(userReading, today, 'date'),
          week: calcStats(userReading, weekStart, 'week'),
          month: calcStats(userReading, thisMonth, 'month'),
          year: calcStats(userReading, thisYear, 'year'),
          total: {
            count: userReading.length,
            words: userReading.reduce((s, r) => s + (r.wordCount || 0), 0)
          }
        },
        typing: {
          day: calcTypingStats(userTyping, today, 'date'),
          week: calcTypingStats(userTyping, weekStart, 'week'),
          month: calcTypingStats(userTyping, thisMonth, 'month'),
          year: calcTypingStats(userTyping, thisYear, 'year'),
          total: {
            count: userTyping.length,
            avgWpm: userTyping.length > 0 
              ? Math.round(userTyping.reduce((s, r) => s + (r.wpm || 0), 0) / userTyping.length)
              : 0
          }
        }
      };

      return json({ success: true, stats });
    }

if (path === "admin/today-checkin") {
  const today = new Date().toISOString().split("T")[0];
  console.log('API: Today is', today);
  
  const { keys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
  console.log('API: Total reading keys:', keys.length);
  
  const checkedStudents = new Set();
  
  for (const key of keys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const record = JSON.parse(data);
      console.log('API: Record date:', record.date, 'Nickname:', record.nickname);
      if (record.date === today) {
        checkedStudents.add(record.nickname);
      }
    }
  }
  
  console.log('API: Checked students count:', checkedStudents.size);
  
  return json({ 
    success: true, 
    count: checkedStudents.size,
    today: today
  });
}

  /* ========================= 保存内容（统一内容池） ========================== */
if (path === "admin/content/save") {
  const { id, title, content, wordCount: inputWordCount, difficulty, useForReading, useForTyping, targetType, targetGroup, targetClasses, isActive } = await request.json();
  
  if (!title) {
    return json({ success: false, message: "标题不能为空" });
  }
  if (!content) {
    return json({ success: false, message: "内容不能为空" });
  }
  if (!useForReading && !useForTyping) {
    return json({ success: false, message: "请至少选择一种使用方式（阅读或打字）" });
  }

  // ===== 关键修复：如果有id，使用原id进行更新；没有则创建新的 =====  
  const contentId = id || Date.now().toString(); // ✅ 正确保留id  
  const contentKey = "content:item:" + contentId;

  // 关键修复：正确计算英文单词数
  let finalWordCount;
  if (inputWordCount && !isNaN(inputWordCount)) {
    // 如果教师手动输入了字数，优先使用
    finalWordCount = Number(inputWordCount);
  } else {
    // 自动计算英文单词数（按空格分隔的单词）
    // 方法1：简单按空格分割（适合纯英文文章）
    finalWordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
    
    // 方法2：更精确 - 只统计包含英文字母的单词（可选，如果方法1不够准确）
    // finalWordCount = content.match(/[a-zA-Z]+/g)?.length || 0;
  }

  const contentData = {
    id: contentId,
    title,
    content,
    wordCount: finalWordCount, // 使用计算后的英文单词数
    difficulty: difficulty || "medium",
    useForReading: useForReading === true,
    useForTyping: useForTyping === true,
    targetType: targetType || "all",
    targetGroup: targetGroup || "",
    targetClasses: targetClasses || [],
    isActive: isActive !== false,
    updatedAt: new Date().toISOString()
  };

  await env.TYPEREADING_KV.put(contentKey, JSON.stringify(contentData));
  return json({ success: true, content: contentData });
}


    /* ========================= 获取内容列表 ========================== */
    if (path === "admin/content/list") {
      const { useForReading, useForTyping } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "content:item:" });
      const contents = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const content = JSON.parse(data);
          if (useForReading && !content.useForReading) continue;
          if (useForTyping && !content.useForTyping) continue;
          contents.push(content);
        }
      }
      contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return json({ success: true, contents });
    }

    /* ========================= 删除内容 ========================== */
    if (path === "admin/content/delete") {
      const { id, type } = await request.json();
      if (!id) {
        return json({ success: false, message: "参数错误：缺少ID" });
      }

      const itemKey = "content:item:" + id;
      const itemExists = await env.TYPEREADING_KV.get(itemKey);
      if (itemExists) {
        await env.TYPEREADING_KV.delete(itemKey);
        return json({ success: true });
      }
      
      if (type) {
        const oldKey = "content:" + type + ":" + id;
        const oldExists = await env.TYPEREADING_KV.get(oldKey);
        if (oldExists) {
          await env.TYPEREADING_KV.delete(oldKey);
          return json({ success: true });
        }
      }
      
      const readingKey = "content:reading:" + id;
      const typingKey = "content:typing:" + id;
      
      const readingExists = await env.TYPEREADING_KV.get(readingKey);
      if (readingExists) {
        await env.TYPEREADING_KV.delete(readingKey);
        return json({ success: true });
      }
      
      const typingExists = await env.TYPEREADING_KV.get(typingKey);
      if (typingExists) {
        await env.TYPEREADING_KV.delete(typingKey);
        return json({ success: true });
      }
      
      return json({ success: false, message: "内容不存在" });
    }

/* ========================= 获取今日阅读内容（修复版 - 支持会员周限制） ========================== */
if (path === "content/reading") {
  const body = await request.json().catch(() => ({}));
  const { nickname, className, date: clientDate } = body;

  // 获取用户信息并检查会员状态
  let membership = { type: "basic" };
  if (nickname) {
    const userKey = "user:" + nickname;
    const userData = await env.TYPEREADING_KV.get(userKey);
    if (userData) {
      const user = JSON.parse(userData);
      membership = await checkAndUpdateMembership(nickname, user, env);
    }
  }
  
  const isPremium = membership.type === "premium";

  // ===== 普通会员：本周固定一篇（基于首次登录时的最新内容）=====
  if (!isPremium && nickname) {
    // 1. 检查本周是否已分配材料
    let weeklyContent = await getWeeklyReadingContent(nickname, clientDate, env);
    
    if (weeklyContent) {
      // 已分配，返回同一篇
      return json({ 
        success: true, 
        content: {
          id: weeklyContent.contentId,
          title: weeklyContent.title,
          content: weeklyContent.content,
          wordCount: weeklyContent.wordCount,
          difficulty: weeklyContent.difficulty
        },
        membership: "basic",
        weeklyAssigned: true,
        canRead: true
      });
    }
    
    // 2. 本周未分配，获取当前最新材料并分配
    let groupNames = [];
    if (className) {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const group = JSON.parse(data);
          const groupClasses = group.classes || group.classNames || [];
          if (groupClasses.includes(className)) {
            groupNames.push(group.name);
          }
        }
      }
    }
    
    const { keys } = await env.TYPEREADING_KV.list({ prefix: "content:item:" });
    const contents = [];
    
    for (const key of keys) {
      const data = await env.TYPEREADING_KV.get(key.name);
      if (data) {
        const content = JSON.parse(data);
        const isActive = content.isActive !== false;
        const useForReading = content.useForReading === true;
        
        if (!isActive || !useForReading) continue;
        
        let isMatch = false;
        if (content.targetType === "all" || !content.targetType) {
          isMatch = true;
        } else if (content.targetType === "group") {
          isMatch = groupNames.includes(content.targetGroup);
        } else if (content.targetType === "class") {
          if (className) {
            isMatch = content.targetClasses && content.targetClasses.includes(className);
          } else {
            isMatch = false;
          }
        }
        
        if (isMatch) {
          contents.push(content);
        }
      }
    }
    
    if (contents.length === 0) {
      return json({ 
        success: true, 
        content: null,
        membership: "basic",
        message: "普通会员限每周一篇，请联系老师开通高级会员"
      });
    }
    
    // 按最新排序，取第一篇（当前最新）
    contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const selectedContent = contents[0];
    
    // 分配本周材料（保存首次登录时的内容）
    await assignWeeklyReadingContent(nickname, clientDate, selectedContent, env);
    
    return json({ 
      success: true, 
      content: {
        id: selectedContent.id,
        title: selectedContent.title,
        content: selectedContent.content,
        wordCount: selectedContent.wordCount,
        difficulty: selectedContent.difficulty
      },
      membership: "basic",
      weeklyAssigned: true,
      canRead: true,
      firstAssign: true
    });
  }

  // ===== 高级会员：每次获取当前最新内容 =====
  let groupNames = [];
  if (className) {
    const { keys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
    for (const key of keys) {
      const data = await env.TYPEREADING_KV.get(key.name);
      if (data) {
        const group = JSON.parse(data);
        const groupClasses = group.classes || group.classNames || [];
        if (groupClasses.includes(className)) {
          groupNames.push(group.name);
        }
      }
    }
  }
  
  const { keys } = await env.TYPEREADING_KV.list({ prefix: "content:item:" });
  const contents = [];
  
  for (const key of keys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const content = JSON.parse(data);
      const isActive = content.isActive !== false;
      const useForReading = content.useForReading === true;
      
      if (!isActive || !useForReading) continue;
      
      let isMatch = false;
      if (content.targetType === "all" || !content.targetType) {
        isMatch = true;
      } else if (content.targetType === "group") {
        isMatch = groupNames.includes(content.targetGroup);
      } else if (content.targetType === "class") {
        if (className) {
          isMatch = content.targetClasses && content.targetClasses.includes(className);
        } else {
          isMatch = false;
        }
      }
      
      if (isMatch) {
        contents.push(content);
      }
    }
  }
  
  let selectedContent = null;
  if (contents.length > 0) {
    // 高级会员：每次都取最新内容
    contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    selectedContent = contents[0];
  }
  
  return json({ 
    success: true, 
    content: selectedContent,
    membership: "premium",
    canRead: true
  });
}

/* ========================= 获取打字练习内容（修复版 - 支持会员周限制） ========================== */
if (path === "content/typing") {
  const body = await request.json().catch(() => ({}));
  const { nickname, className } = body;

  // 获取用户信息并检查会员状态
  let membership = { type: "basic" };
  if (nickname) {
    const userKey = "user:" + nickname;
    const userData = await env.TYPEREADING_KV.get(userKey);
    if (userData) {
      const user = JSON.parse(userData);
      membership = await checkAndUpdateMembership(nickname, user, env);
    }
  }
  
  const isPremium = membership.type === "premium";

  // ===== 普通会员：本周固定一篇（基于首次登录时的最新内容）=====
  if (!isPremium && nickname) {
    // 1. 检查本周是否已分配材料
    let weeklyContent = await getWeeklyTypingContent(nickname, null, env);
    
    if (weeklyContent) {
      // 已分配，返回同一篇
      return json({ 
        success: true, 
        content: {
          id: weeklyContent.contentId,
          title: weeklyContent.title,
          content: weeklyContent.content,
          wordCount: weeklyContent.wordCount,
          difficulty: weeklyContent.difficulty
        },
        membership: "basic",
        weeklyAssigned: true
      });
    }
    
    // 2. 本周未分配，获取当前最新材料并分配
    let groupNames = [];
    if (className) {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const group = JSON.parse(data);
          const groupClasses = group.classes || group.classNames || [];
          if (groupClasses.includes(className)) {
            groupNames.push(group.name);
          }
        }
      }
    }
    
    const { keys: itemKeys } = await env.TYPEREADING_KV.list({ prefix: "content:item:" });
    const contents = [];
    
    for (const key of itemKeys) {
      const data = await env.TYPEREADING_KV.get(key.name);
      if (data) {
        const content = JSON.parse(data);
        const isActive = content.isActive !== false;
        const useForTyping = content.useForTyping === true;
        
        if (!isActive || !useForTyping) continue;
        
        let isMatch = false;
        if (content.targetType === "all" || !content.targetType) {
          isMatch = true;
        } else if (content.targetType === "group") {
          isMatch = groupNames.includes(content.targetGroup);
        } else if (content.targetType === "class") {
          if (className) {
            isMatch = content.targetClasses && content.targetClasses.includes(className);
          } else {
            isMatch = false;
          }
        }
        
        if (isMatch) {
          contents.push(content);
        }
      }
    }
    
    if (contents.length === 0) {
      return json({ 
        success: true, 
        content: null,
        membership: "basic",
        message: "普通会员限每周一篇，请联系老师开通高级会员"
      });
    }
    
    // 按最新排序，取第一篇（当前最新）
    contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const selectedContent = contents[0];
    
    // 分配本周材料（保存首次登录时的内容）
    await assignWeeklyTypingContent(nickname, null, selectedContent, env);
    
    return json({ 
      success: true, 
      content: {
        id: selectedContent.id,
        title: selectedContent.title,
        content: selectedContent.content,
        wordCount: selectedContent.wordCount,
        difficulty: selectedContent.difficulty
      },
      membership: "basic",
      weeklyAssigned: true,
      firstAssign: true
    });
  }

  // ===== 高级会员：每次获取当前最新内容 =====
  let groupNames = [];
  if (className) {
    const { keys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
    for (const key of keys) {
      const data = await env.TYPEREADING_KV.get(key.name);
      if (data) {
        const group = JSON.parse(data);
        const groupClasses = group.classes || group.classNames || [];
        if (groupClasses.includes(className)) {
          groupNames.push(group.name);
        }
      }
    }
  }

  const contents = [];
  const { keys: itemKeys } = await env.TYPEREADING_KV.list({ prefix: "content:item:" });

  for (const key of itemKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (!data) continue;

    const content = JSON.parse(data);
    const isActive = content.isActive !== false;
    const useForTyping = content.useForTyping === true;

    if (!isActive || !useForTyping) continue;

    let isMatch = false;
    if (content.targetType === "all" || !content.targetType) {
      isMatch = true;
    } else if (content.targetType === "group") {
      isMatch = groupNames.includes(content.targetGroup);
    } else if (content.targetType === "class") {
      isMatch = content.targetClasses && content.targetClasses.includes(className);
    }

    if (isMatch) {
      contents.push({
        id: content.id,
        title: content.title || "未命名",
        content: content.content,
        wordCount: content.wordCount || content.content.length,
        difficulty: content.difficulty || "medium",
        updatedAt: content.updatedAt || content.createdAt
      });
    }
  }

  // 高级会员：按最新排序，取第一篇
  contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const selectedContent = contents.length > 0 ? contents[0] : null;

  return json({ 
    success: true, 
    content: selectedContent,
    membership: "premium"
  });
}

    /* ========================= 排行榜 ========================== */
    if (path === "rank/typing") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const results = [];

      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);

        const userKey = "user:" + record.nickname;
        const userData = await env.TYPEREADING_KV.get(userKey);
        if (!userData) continue;

        const user = JSON.parse(userData);
        results.push({
          nickname: record.nickname,
          realName: user.realName || record.nickname,
          className: user.className || "",
          wpm: record.wpm || 0,
          accuracy: record.accuracy || 0,
          timestamp: record.timestamp
        });
      }

      results.sort((a, b) => b.wpm - a.wpm);
      
      const ranked = results.slice(0, 20).map((item, index) => ({
        rank: index + 1,
        ...item
      }));
      
      return json({ success: true, rank: ranked });
    }

    /* ========================= 新增：阅读历史与问答系统 API ========================== */

    /* ---------------- 阅读历史相关 ---------------- */

    if (path === "user/reading-history") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const records = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const r = JSON.parse(data);
        if (r.nickname === nickname) {
          records.push(r);
        }
      }
      
      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      const uniqueMap = new Map();
      records.forEach(r => {
        const key = r.articleId || r.articleTitle;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, {
            articleId: r.articleId,
            articleTitle: r.articleTitle,
            wordCount: r.wordCount,
            lastReadAt: r.timestamp,
            readCount: 1
          });
        } else {
          uniqueMap.get(key).readCount++;
        }
      });
      
      return json({ 
        success: true, 
        history: Array.from(uniqueMap.values()),
        totalReads: records.length
      });
    }

    if (path === "content/detail") {
      const { id } = await request.json();
      if (!id) {
        return json({ success: false, message: "缺少文章ID" });
      }
      
      const contentKey = "content:item:" + id;
      const data = await env.TYPEREADING_KV.get(contentKey);
      
      if (!data) {
        return json({ success: false, message: "文章不存在或已下架" });
      }
      
      return json({ success: true, content: JSON.parse(data) });
    }

    /* ---------------- 问答系统相关 ---------------- */

    if (path === "admin/question/add") {
      const { id, contentId, type, question, options, correctAnswer, maxScore } = await request.json();
      
      if (!contentId || !type || !question) {
        return json({ success: false, message: "参数不完整" });
      }
      
      const questionId = id || `question:${contentId}:${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const questionData = {
        id: questionId,
        contentId,
        type,
        question,
        options: options || [],
        correctAnswer: correctAnswer || "",
        maxScore: Number(maxScore) || 10,
        createdAt: new Date().toISOString(),
        isActive: true
      };
      
      await env.TYPEREADING_KV.put(questionId, JSON.stringify(questionData));
      return json({ success: true, question: questionData });
    }

    if (path === "content/questions") {
      const { contentId } = await request.json();
      if (!contentId) {
        return json({ success: false, message: "缺少内容ID" });
      }
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: `question:${contentId}:` });
      const questions = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const q = JSON.parse(data);
          if (q.isActive !== false) questions.push(q);
        }
      }
      
      questions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return json({ success: true, questions });
    }

    if (path === "question/submit") {
      const { contentId, questionId, nickname, answer } = await request.json();
      
      if (!questionId || !nickname || !answer) {
        return json({ success: false, message: "参数不完整" });
      }
      
      const answerKey = `answer:${questionId}:${nickname}`;
      const existing = await env.TYPEREADING_KV.get(answerKey);
      if (existing) {
        return json({ success: false, message: "您已提交过答案，不可重复提交" });
      }
      
      const answerData = {
        questionId,
        contentId,
        nickname,
        answer,
        score: null,
        feedback: "",
        submittedAt: new Date().toISOString(),
        gradedAt: null,
        grader: null
      };
      
      await env.TYPEREADING_KV.put(answerKey, JSON.stringify(answerData));
      return json({ success: true, message: "提交成功" });
    }

    if (path === "admin/question/answers") {
      const { questionId } = await request.json();
      if (!questionId) {
        return json({ success: false, message: "缺少问题ID" });
      }
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: `answer:${questionId}:` });
      const answers = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const ans = JSON.parse(data);
          const userKey = `user:${ans.nickname}`;
          const userData = await env.TYPEREADING_KV.get(userKey);
          if (userData) {
            const user = JSON.parse(userData);
            ans.realName = user.realName || ans.nickname;
            ans.className = user.className || "";
          }
          answers.push(ans);
        }
      }
      
      answers.sort((a, b) => {
        if (a.score === null && b.score !== null) return -1;
        if (a.score !== null && b.score === null) return 1;
        return new Date(b.submittedAt) - new Date(a.submittedAt);
      });
      
      return json({ success: true, answers });
    }

    if (path === "admin/question/grade") {
      const { questionId, nickname, score, feedback, grader } = await request.json();
      
      if (!questionId || !nickname || score === undefined) {
        return json({ success: false, message: "参数不完整" });
      }
      
      const answerKey = `answer:${questionId}:${nickname}`;
      const data = await env.TYPEREADING_KV.get(answerKey);
      
      if (!data) {
        return json({ success: false, message: "答案不存在" });
      }
      
      const answer = JSON.parse(data);
      answer.score = Number(score);
      answer.feedback = feedback || "";
      answer.gradedAt = new Date().toISOString();
      answer.grader = grader || "教师";
      
      await env.TYPEREADING_KV.put(answerKey, JSON.stringify(answer));
      return json({ success: true });
    }

    if (path === "question/my-answer") {
      const { questionId, nickname } = await request.json();
      
      if (!questionId || !nickname) {
        return json({ success: false, message: "参数不完整" });
      }
      
      const answerKey = `answer:${questionId}:${nickname}`;
      const data = await env.TYPEREADING_KV.get(answerKey);
      
      return json({
        success: true,
        answered: !!data,
        answer: data ? JSON.parse(data) : null
      });
    }

    if (path === "admin/question/delete") {
  const { questionId } = await request.json();
  if (!questionId) {
    return json({ success: false, message: "缺少问题ID" });
  }
  
  // 软删除
  const data = await env.TYPEREADING_KV.get(questionId);
  if (data) {
    const question = JSON.parse(data);
    question.isActive = false;
    await env.TYPEREADING_KV.put(questionId, JSON.stringify(question));
  }
  
  return json({ success: true });
}

/* ========================= 请假管理 API ========================== */  // ✅ 插入在这里
/* ---------------- 添加请假记录 ---------------- */
if (path === "admin/leave/add") {
  const { nickname, leaveDate, days, reason } = await request.json();
  
  if (!nickname || !leaveDate || !reason) {
    return json({ success: false, message: "参数不完整" });
  }
  
  const leaveKey = `leave::`;
  await env.TYPEREADING_KV.put(leaveKey, JSON.stringify({
    nickname,
    leaveDate,
    days: parseInt(days) || 1,
    reason,
    createdAt: new Date().toISOString(),
    createdBy: "教师"
  }));
  
  return json({ success: true });
}

/* ---------------- 获取学生请假记录 ---------------- */
if (path === "user/leave-records") {
  const { nickname } = await request.json();
  
  if (!nickname) {
    return json({ success: false, message: "昵称不能为空" });
  }
  
  const { keys } = await env.TYPEREADING_KV.list({ prefix: `leave::` });
  const records = [];
  
  for (const key of keys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const record = JSON.parse(data);
      if (record.nickname === nickname) {
        records.push(record);
      }
    }
  }
  
  // 按日期倒序
  records.sort((a, b) => new Date(b.leaveDate) - new Date(a.leaveDate));
  
  // 计算累计请假天数
  const totalDays = records.reduce((sum, r) => sum + (r.days || 1), 0);
  
  return json({ 
    success: true, 
    records,
    totalDays,
    count: records.length
  });
}

/* ---------------- 删除请假记录 ---------------- */
if (path === "admin/leave/delete") {
  const { leaveKey } = await request.json();
  
  if (!leaveKey) {
    return json({ success: false, message: "请假记录ID不能为空" });
  }
  
  await env.TYPEREADING_KV.delete(leaveKey);
  return json({ success: true });
}

/* ========================= 学生状态管理 API ========================== */

/* ---------------- 切换学生激活状态 ---------------- */
if (path === "admin/student/toggle-active") {
  const { nickname, isActive } = await request.json();
  
  if (!nickname) {
    return json({ success: false, message: "昵称不能为空" });
  }
  
  const userKey = "user:" + nickname;
  const data = await env.TYPEREADING_KV.get(userKey);
  if (!data) {
    return json({ success: false, message: "用户不存在" });
  }
  
  const user = JSON.parse(data);
  user.isActive = isActive !== false; // 默认为 true
  
  await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
  return json({ success: true, isActive: user.isActive });
}


/* ========================= 收费退费管理 API ========================== */

/* ---------------- 添加收费记录 ---------------- */
if (path === "admin/payment/add") {
  const { nickname, className, amount, remark } = await request.json();
  
  if (!nickname || !amount || amount <= 0) {
    return json({ success: false, message: "学生昵称和收费金额不能为空" });
  }
  
  const paymentKey = "payment:" + nickname + ":" + Date.now();
  const paymentData = {
    id: paymentKey,
    nickname,
    className: className || "",
    amount: Number(amount),
    remark: remark || "",
    createdAt: new Date().toISOString(),
    createdBy: "教师"
  };
  
  await env.TYPEREADING_KV.put(paymentKey, JSON.stringify(paymentData));
  return json({ success: true, payment: paymentData });
}

/* ---------------- 添加退费记录 ---------------- */
if (path === "admin/refund/add") {
  const { nickname, className, refundAmount, reason, remark } = await request.json();
  
  if (!nickname || !refundAmount || refundAmount <= 0) {
    return json({ success: false, message: "学生昵称和退费金额不能为空" });
  }
  
  const refundKey = "refund:" + nickname + ":" + Date.now();
  const refundData = {
    id: refundKey,
    nickname,
    className: className || "",
    refundAmount: Number(refundAmount),
    reason: reason || "",
    remark: remark || "",
    createdAt: new Date().toISOString(),
    createdBy: "教师"
  };
  
  await env.TYPEREADING_KV.put(refundKey, JSON.stringify(refundData));
  return json({ success: true, refund: refundData });
}

/* ---------------- 获取班级财务统计 ---------------- */
if (path === "admin/finance/class-stats") {
  const { className } = await request.json();
  
  // 获取所有收费记录
  const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
  const payments = [];
  for (const key of paymentKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const p = JSON.parse(data);
      if (!className || p.className === className) {
        payments.push(p);
      }
    }
  }
  
  // 获取所有退费记录
  const { keys: refundKeys } = await env.TYPEREADING_KV.list({ prefix: "refund:" });
  const refunds = [];
  for (const key of refundKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const r = JSON.parse(data);
      if (!className || r.className === className) {
        refunds.push(r);
      }
    }
  }
  
  // 按班级分组统计
  const classStatsMap = new Map();
  
  // 统计收费
  payments.forEach(p => {
    const cls = p.className || "未分班";
    if (!classStatsMap.has(cls)) {
      classStatsMap.set(cls, { className: cls, totalAmount: 0, totalRefund: 0, studentCount: new Set() });
    }
    const stats = classStatsMap.get(cls);
    stats.totalAmount += p.amount;
    stats.studentCount.add(p.nickname);
  });
  
  // 统计退费
  refunds.forEach(r => {
    const cls = r.className || "未分班";
    if (!classStatsMap.has(cls)) {
      classStatsMap.set(cls, { className: cls, totalAmount: 0, totalRefund: 0, studentCount: new Set() });
    }
    classStatsMap.get(cls).totalRefund += r.refundAmount;
  });
  
  // 转换为数组并计算实收
  const classStats = Array.from(classStatsMap.values()).map(s => ({
    className: s.className,
    totalAmount: s.totalAmount,
    totalRefund: s.totalRefund,
    netAmount: s.totalAmount - s.totalRefund,
    studentCount: s.studentCount.size
  }));
  
  // 按班级名称排序
  classStats.sort((a, b) => a.className.localeCompare(b.className));
  
  return json({ success: true, classStats });
}

/* ---------------- 获取全局财务统计 ---------------- */
if (path === "admin/finance/global-stats") {
  // 获取所有收费记录
  const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
  let totalAmount = 0;
  const paymentStudents = new Set();
  
  for (const key of paymentKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const p = JSON.parse(data);
      totalAmount += p.amount;
      paymentStudents.add(p.nickname);
    }
  }
  
  // 获取所有退费记录
  const { keys: refundKeys } = await env.TYPEREADING_KV.list({ prefix: "refund:" });
  let totalRefund = 0;
  const refundStudents = new Set();
  
  for (const key of refundKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const r = JSON.parse(data);
      totalRefund += r.refundAmount;
      refundStudents.add(r.nickname);
    }
  }
  
  // 获取总学生数
  const { keys: userKeys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
  const totalStudents = userKeys.length;
  
  return json({
    success: true,
    stats: {
      totalAmount,           // 总应收
      totalRefund,           // 总退款
      netAmount: totalAmount - totalRefund,  // 总实收
      totalStudents,         // 总学生数
      paidStudents: paymentStudents.size,    // 已缴费学生数
      refundStudents: refundStudents.size    // 有退费学生数
    }
  });
}

/* ---------------- 获取学生财务记录 ---------------- */
if (path === "admin/finance/student-records") {
  const { nickname } = await request.json();
  
  if (!nickname) {
    return json({ success: false, message: "学生昵称不能为空" });
  }
  
  // 获取该学生的收费记录
  const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" + nickname + ":" });
  const payments = [];
  for (const key of paymentKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) payments.push(JSON.parse(data));
  }
  payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // 获取该学生的退费记录
  const { keys: refundKeys } = await env.TYPEREADING_KV.list({ prefix: "refund:" + nickname + ":" });
  const refunds = [];
  for (const key of refundKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) refunds.push(JSON.parse(data));
  }
  refunds.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // 计算汇总
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalRefund = refunds.reduce((sum, r) => sum + r.refundAmount, 0);
  
  return json({
    success: true,
    records: {
      payments,
      refunds
    },
    summary: {
      totalPaid,
      totalRefund,
      balance: totalPaid - totalRefund
    }
  });
}

/* ========================= 数据导出 API ========================== */

/* ---------------- 导出班级营收统计 ---------------- */
if (path === "admin/export/class-stats") {
  const { format = "csv" } = await request.json();
  
  // 获取班级统计数据（复用之前的逻辑）
  const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
  const payments = [];
  for (const key of paymentKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) payments.push(JSON.parse(data));
  }
  
  const { keys: refundKeys } = await env.TYPEREADING_KV.list({ prefix: "refund:" });
  const refunds = [];
  for (const key of refundKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) refunds.push(JSON.parse(data));
  }
  
  // 按班级分组统计
  const classStatsMap = new Map();
  
  payments.forEach(p => {
    const cls = p.className || "未分班";
    if (!classStatsMap.has(cls)) {
      classStatsMap.set(cls, { className: cls, totalAmount: 0, totalRefund: 0, studentCount: new Set() });
    }
    const stats = classStatsMap.get(cls);
    stats.totalAmount += p.amount;
    stats.studentCount.add(p.nickname);
  });
  
  refunds.forEach(r => {
    const cls = r.className || "未分班";
    if (!classStatsMap.has(cls)) {
      classStatsMap.set(cls, { className: cls, totalAmount: 0, totalRefund: 0, studentCount: new Set() });
    }
    classStatsMap.get(cls).totalRefund += r.refundAmount;
  });
  
  const classStats = Array.from(classStatsMap.values()).map(s => ({
    className: s.className,
    totalAmount: s.totalAmount,
    totalRefund: s.totalRefund,
    netAmount: s.totalAmount - s.totalRefund,
    studentCount: s.studentCount.size
  })).sort((a, b) => a.className.localeCompare(b.className));
  
  // 生成 CSV
  const headers = ["班级名称", "学生数", "应收总额(元)", "退款总额(元)", "实收总额(元)"];
  const rows = classStats.map(s => [
    s.className,
    s.studentCount,
    s.totalAmount.toFixed(2),
    s.totalRefund.toFixed(2),
    s.netAmount.toFixed(2)
  ]);
  
  // 添加合计行
  const totalRow = [
    "合计",
    classStats.reduce((sum, s) => sum + s.studentCount, 0),
    classStats.reduce((sum, s) => sum + s.totalAmount, 0).toFixed(2),
    classStats.reduce((sum, s) => sum + s.totalRefund, 0).toFixed(2),
    classStats.reduce((sum, s) => sum + s.netAmount, 0).toFixed(2)
  ];
  rows.push(totalRow);
  
  const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
  
   // 使用 ASCII 文件名，避免任何编码问题
  const today = new Date().toISOString().split('T')[0];
  const fileName = `class-stats-.csv`;

  return new Response(csvContent, {
    headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename=""`,
    "Access-Control-Allow-Origin": "*"
    }
  });
}
  

/* ---------------- 导出学生收费明细 ---------------- */
if (path === "admin/export/student-details") {
  const { className = "", format = "csv" } = await request.json();
  
  // 获取所有学生
  const { keys: userKeys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
  const students = [];
  for (const key of userKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) {
      const user = JSON.parse(data);
      if (!className || user.className === className) {
        students.push(user);
      }
    }
  }
  
  // 获取所有收费和退费记录
  const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
  const allPayments = [];
  for (const key of paymentKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) allPayments.push(JSON.parse(data));
  }
  
  const { keys: refundKeys } = await env.TYPEREADING_KV.list({ prefix: "refund:" });
  const allRefunds = [];
  for (const key of refundKeys) {
    const data = await env.TYPEREADING_KV.get(key.name);
    if (data) allRefunds.push(JSON.parse(data));
  }
  
  // 为每个学生计算财务数据
  const studentFinanceData = students.map(s => {
    const payments = allPayments.filter(p => p.nickname === s.nickname);
    const refunds = allRefunds.filter(r => r.nickname === s.nickname);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalRefund = refunds.reduce((sum, r) => sum + r.refundAmount, 0);
    
    return {
      nickname: s.nickname,
      realName: s.realName || "",
      className: s.className || "未分班",
      totalPaid,
      totalRefund,
      balance: totalPaid - totalRefund,
      paymentCount: payments.length,
      refundCount: refunds.length
    };
  }).sort((a, b) => a.className.localeCompare(b.className) || a.nickname.localeCompare(b.nickname));
  
  // 生成 CSV
  const headers = ["班级", "昵称", "真实姓名", "缴费次数", "缴费总额(元)", "退费次数", "退费总额(元)", "余额(元)"];
  const rows = studentFinanceData.map(s => [
    s.className,
    s.nickname,
    s.realName,
    s.paymentCount,
    s.totalPaid.toFixed(2),
    s.refundCount,
    s.totalRefund.toFixed(2),
    s.balance.toFixed(2)
  ]);
  
  // 添加合计行
  const totalRow = [
    "合计",
    "",
    "",
    studentFinanceData.reduce((sum, s) => sum + s.paymentCount, 0),
    studentFinanceData.reduce((sum, s) => sum + s.totalPaid, 0).toFixed(2),
    studentFinanceData.reduce((sum, s) => sum + s.refundCount, 0),
    studentFinanceData.reduce((sum, s) => sum + s.totalRefund, 0).toFixed(2),
    studentFinanceData.reduce((sum, s) => sum + s.balance, 0).toFixed(2)
  ];
  rows.push(totalRow);
  
  const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
  
// 使用 ASCII 文件名
const today = new Date().toISOString().split('T')[0];
const classSuffix = className ? className.replace(/[^a-zA-Z0-9]/g, '_') : 'all';
const fileName = `student-fees--.csv`;

return new Response(csvContent, {
  headers: {
  "Content-Type": "text/csv; charset=utf-8",
  "Content-Disposition": `attachment; filename=""`,      
  "Access-Control-Allow-Origin": "*"
     }
  });
}

/* ---------------- 导出原始交易记录 ---------------- */
if (path === "admin/export/transactions") {
  const { startDate = "", endDate = "", type = "all" } = await request.json();
  
  const records = [];
  
  // 获取收费记录
  if (type === "all" || type === "payment") {
    const { keys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
    for (const key of keys) {
      const data = await env.TYPEREADING_KV.get(key.name);
      if (data) {
        const p = JSON.parse(data);
        if ((!startDate || p.createdAt >= startDate) && (!endDate || p.createdAt <= endDate + "T23:59:59")) {
          records.push({
            type: "收费",
            nickname: p.nickname,
            className: p.className || "未分班",
            amount: p.amount,
            remark: p.remark || "",
            date: p.createdAt
          });
        }
      }
    }
  }
  
  // 获取退费记录
  if (type === "all" || type === "refund") {
    const { keys } = await env.TYPEREADING_KV.list({ prefix: "refund:" });
    for (const key of keys) {
      const data = await env.TYPEREADING_KV.get(key.name);
      if (data) {
        const r = JSON.parse(data);
        if ((!startDate || r.createdAt >= startDate) && (!endDate || r.createdAt <= endDate + "T23:59:59")) {
          records.push({
            type: "退费",
            nickname: r.nickname,
            className: r.className || "未分班",
            amount: -r.refundAmount,
            remark: r.reason + (r.remark ? " | " + r.remark : ""),
            date: r.createdAt
          });
        }
      }
    }
  }
  
  // 按日期排序
  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // 生成 CSV
  const headers = ["类型", "日期", "班级", "学生昵称", "金额(元)", "备注"];
  const rows = records.map(r => [
    r.type,
    new Date(r.date).toLocaleString('zh-CN'),
    r.className,
    r.nickname,
    r.amount.toFixed(2),
    r.remark
  ]);
  
  // 添加合计
  const totalPayment = records.filter(r => r.type === "收费").reduce((sum, r) => sum + r.amount, 0);
  const totalRefund = records.filter(r => r.type === "退费").reduce((sum, r) => sum + Math.abs(r.amount), 0);
  
  rows.push([]);
  rows.push(["合计", "", "", "", "", ""]);
  rows.push(["收费合计", "", "", "", totalPayment.toFixed(2), ""]);
  rows.push(["退费合计", "", "", "", totalRefund.toFixed(2), ""]);
  rows.push(["净收入", "", "", "", (totalPayment - totalRefund).toFixed(2), ""]);
  
  const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
  
// 使用 ASCII 文件名
 const today = new Date().toISOString().split('T')[0];
 const typeSuffix = type === "payment" ? "-payment" : type === "refund" ? "-refund" : "-all";
 const dateRange = (startDate && endDate) ? `-${startDate}-to-${endDate}` : '';
 const fileName = `transactions--.csv`;

 return new Response(csvContent, {
   headers: {
   "Content-Type": "text/csv; charset=utf-8",
   "Content-Disposition": `attachment; filename=""`,
   "Access-Control-Allow-Origin": "*"
     }
  });
 }
    
return json({ success: false, message: "接口不存在：" + path });  // ✅ 这是默认返回，必须放在最后
} catch (err) {
  console.error("API Error:", err);
  return json({ success: false, message: err.message });
}


  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split("T")[0];
  }

  function calcStats(records, period, type) {
    const filtered = records.filter(r => {
      const recordDate = r.date || (r.timestamp ? r.timestamp.split("T")[0] : "");
      if (!recordDate) return false;
      if (type === 'date') return recordDate === period;
      if (type === 'week') return recordDate >= period;
      if (type === 'month') return recordDate.startsWith(period);
      if (type === 'year') return recordDate.startsWith(period);
      return false;
    });

    return {
      count: filtered.length,
      words: filtered.reduce((s, r) => s + (r.wordCount || 0), 0)
    };
  }

    function calcTypingStats(records, period, type) {
    const filtered = records.filter(r => {
      const recordDate = r.date || (r.timestamp ? r.timestamp.split("T")[0] : "");
      if (!recordDate) return false;
      if (type === 'date') return recordDate === period;
      if (type === 'week') return recordDate >= period;
      if (type === 'month') return recordDate.startsWith(period);
      if (type === 'year') return recordDate.startsWith(period);
      return false;
    });

    const avgWpm = filtered.length > 0 
      ? Math.round(filtered.reduce((s, r) => s + (r.wpm || 0), 0) / filtered.length)
      : 0;
    const avgAccuracy = filtered.length > 0
      ? Math.round(filtered.reduce((s, r) => s + (r.accuracy || 0), 0) / filtered.length)
      : 0;

    return {
      count: filtered.length,
      avgWpm,
      avgAccuracy
    };
  }

  function json(data) {
    return new Response(JSON.stringify(data), { headers });
  }
}
