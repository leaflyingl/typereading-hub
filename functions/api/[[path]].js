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
    if (!user.membership) {
      user.membership = { 
        type: "basic",
        expiresAt: null,
        autoDowngrade: true
      };
      await env.TYPEREADING_KV.put("user:" + nickname, JSON.stringify(user));
      return user.membership;
    }
    
    if (user.membership.type === "premium" && user.membership.expiresAt) {
      const today = new Date().toISOString().split('T')[0];
      if (today > user.membership.expiresAt && user.membership.autoDowngrade !== false) {
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

  // ===== 辅助函数：获取本周阅读材料（7天周期）=====
  async function getWeeklyReadingContent(nickname, clientDate, env) {
    if (!nickname) return null;
    
    const { keys } = await env.TYPEREADING_KV.list({ prefix: "weekly:reading:" + nickname + ":" });
    
    if (keys.length === 0) return null;
    
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

  // ===== 辅助函数：分配本周阅读材料（7天周期）=====
  async function assignWeeklyReadingContent(nickname, clientDate, content, env) {
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
    
    const weekKey = "weekly:reading:" + nickname + ":" + today;
    
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

  // ===== 辅助函数：获取本周打字材料（7天周期）=====
  async function getWeeklyTypingContent(nickname, clientDate, env) {
    if (!nickname) return null;
    
    const { keys } = await env.TYPEREADING_KV.list({ prefix: "weekly:typing:" + nickname + ":" });
    
    if (keys.length === 0) return null;
    
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

  // ===== 辅助函数：分配本周打字材料（7天周期）=====
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

  // ===== 辅助函数：计算时长统计（新增）=====
  function calcDurationStats(records, period, type) {
    const filtered = records.filter(r => {
      const recordDate = r.date || (r.timestamp ? r.timestamp.split("T")[0] : "");
      if (!recordDate) return false;
      if (type === 'date') return recordDate === period;
      if (type === 'week') return recordDate >= period;
      if (type === 'month') return recordDate.startsWith(period);
      if (type === 'year') return recordDate.startsWith(period);
      return false;
    });

    const totalMinutes = Math.round(filtered.reduce((sum, r) => sum + (r.duration || 0), 0) / 60);
    
    return {
      count: filtered.length,
      minutes: totalMinutes
    };
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
          
          const membership = await checkAndUpdateMembership(user.nickname, user, env);
          
          user.totalReadingWords = readingRecords
            .filter(r => r.nickname === user.nickname)
            .reduce((sum, r) => sum + (r.wordCount || 0), 0);
          user.totalTypingWords = typingRecords
            .filter(r => r.nickname === user.nickname)
            .reduce((sum, r) => sum + (r.wordCount || r.content?.length || 0), 0);

          user.membership = membership;
          
          students.push(user);
        }
      }
      students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ success: true, students });
    }

    /* ========================= 更新学生信息 ========================== */
    if (path === "admin/student/update") {
      const { nickname, realName, gender, className, isActive } = await request.json();
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
      user.isActive = isActive !== false;

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
      
      user.membership = {
        type: membership.type,
        expiresAt: membership.type === "premium" ? membership.expiresAt : null,
        autoDowngrade: membership.autoDowngrade !== false,
        updatedAt: new Date().toISOString()
      };

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

    /* ========================= 阅读打卡（添加时长字段）========================== */
    if (path === "checkin/reading") {
      const { nickname, articleId, articleTitle, wordCount, duration, date: clientDate } = await request.json();
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
          duration: Number(duration) || 0,  // ← 新增：阅读时长（秒）
          date: today,
          timestamp: new Date().toISOString()
        })
      );
      return json({ success: true, message: "打卡成功", date: today });
    }
    
    /* ========================= 查询今日打卡状态 ========================== */
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

    /* ========================= 打字记录提交（支持时长）========================== */
    if (path === "typing/result") {
      const { nickname, wpm, accuracy, duration, wordCount, content, keystrokes, targetLength } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const recordKey = "typing:" + nickname + ":" + Date.now();
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];

      const finalWordCount = Number(wordCount) || (content ? content.length : 0);
      
      let finalAccuracy = Number(accuracy) || 0;
      if (keystrokes && keystrokes.total > 0) {
        finalAccuracy = Math.round((keystrokes.correct / keystrokes.total) * 100);
      }

      await env.TYPEREADING_KV.put(
        recordKey,
        JSON.stringify({
          nickname,
          wpm: Number(wpm) || 0,
          accuracy: finalAccuracy,
          duration: Number(duration) || 0,  // 打字时长（秒）
          wordCount: finalWordCount,
          content: content || "",
          date: dateStr,
          timestamp: now.toISOString(),
          keystrokes: keystrokes || null,
          targetLength: targetLength || 0
        })
      );

      return json({ success: true, accuracy: finalAccuracy });
    }


    /* ========================= 获取学习统计（支持时长）========================== */
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
          day: {
            ...calcStats(userReading, today, 'date'),
            ...calcDurationStats(userReading, today, 'date')
          },
          week: {
            ...calcStats(userReading, weekStart, 'week'),
            ...calcDurationStats(userReading, weekStart, 'week')
          },
          month: {
            ...calcStats(userReading, thisMonth, 'month'),
            ...calcDurationStats(userReading, thisMonth, 'month')
          },
          year: {
            ...calcStats(userReading, thisYear, 'year'),
            ...calcDurationStats(userReading, thisYear, 'year')
          },
          total: {
            count: userReading.length,
            words: userReading.reduce((s, r) => s + (r.wordCount || 0), 0),
            minutes: Math.round(userReading.reduce((s, r) => s + (r.duration || 0), 0) / 60)
          }
        },
        typing: {
          day: {
            ...calcTypingStats(userTyping, today, 'date'),
            ...calcDurationStats(userTyping, today, 'date')
          },
          week: {
            ...calcTypingStats(userTyping, weekStart, 'week'),
            ...calcDurationStats(userTyping, weekStart, 'week')
          },
          month: {
            ...calcTypingStats(userTyping, thisMonth, 'month'),
            ...calcDurationStats(userTyping, thisMonth, 'month')
          },
          year: {
            ...calcTypingStats(userTyping, thisYear, 'year'),
            ...calcDurationStats(userTyping, thisYear, 'year')
          },
          total: {
            count: userTyping.length,
            avgWpm: userTyping.length > 0 
              ? Math.round(userTyping.reduce((sum, r) => sum + (r.wpm || 0), 0) / userTyping.length)
              : 0,
            minutes: Math.round(userTyping.reduce((s, r) => s + (r.duration || 0), 0) / 60)
          }
        }
      };

      return json({ success: true, stats });
    }

    if (path === "admin/today-checkin") {
      const today = new Date().toISOString().split("T")[0];
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const checkedStudents = new Set();
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const record = JSON.parse(data);
          if (record.date === today) {
            checkedStudents.add(record.nickname);
          }
        }
      }
      
      return json({ 
        success: true, 
        count: checkedStudents.size,
        today: today
      });
    }

    // ========== 第二段继续 ==========
        /* ========================= 保存内容（统一内容池）========================== */
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

      const contentId = id || Date.now().toString();
      const contentKey = "content:item:" + contentId;

      let finalWordCount;
      if (inputWordCount && !isNaN(inputWordCount)) {
        finalWordCount = Number(inputWordCount);
      } else {
        finalWordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
      }

      const contentData = {
        id: contentId,
        title,
        content,
        wordCount: finalWordCount,
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

    /* ========================= 获取今日阅读内容 ========================== */
    if (path === "content/reading") {
      const body = await request.json().catch(() => ({}));
      const { nickname, className, date: clientDate } = body;

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

      if (!isPremium && nickname) {
        let weeklyContent = await getWeeklyReadingContent(nickname, clientDate, env);
        
        if (weeklyContent) {
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
        
        contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const selectedContent = contents[0];
        
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

    /* ========================= 获取打字练习内容 ========================== */
    if (path === "content/typing") {
      const body = await request.json().catch(() => ({}));
      const { nickname, className } = body;

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

      if (!isPremium && nickname) {
        let weeklyContent = await getWeeklyTypingContent(nickname, null, env);
        
        if (weeklyContent) {
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
        
        contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const selectedContent = contents[0];
        
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

      if (!nickname) {
        const contents = [];
        const { keys: itemKeys } = await env.TYPEREADING_KV.list({ prefix: "content:item:" });

        for (const key of itemKeys) {
          const data = await env.TYPEREADING_KV.get(key.name);
          if (!data) continue;

          const content = JSON.parse(data);
          const isActive = content.isActive !== false;
          const useForTyping = content.useForTyping === true;

          if (!isActive || !useForTyping) continue;

          if (content.targetType === "all" || !content.targetType) {
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

        contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        const selectedContent = contents.length > 0 ? contents[0] : null;

        return json({ 
          success: true, 
          content: selectedContent,
          membership: "anonymous"
        });
      }

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

      contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      const selectedContent = contents.length > 0 ? contents[0] : null;

      return json({ 
        success: true, 
        content: selectedContent,
        membership: "premium"
      });
    }

    /* ========================= 排行榜（支持班级榜/组榜/总榜）========================== */
    if (path === "rank/typing") {
      const { type, className, groupName, limit } = await request.json();
      
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
        
        if (type === 'class' && className) {
          if (user.className !== className) continue;
        }
        
        if (type === 'group' && groupName) {
          const { keys: groupKeys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
          let targetGroup = null;
          
          for (const gKey of groupKeys) {
            const gData = await env.TYPEREADING_KV.get(gKey.name);
            if (gData) {
              const group = JSON.parse(gData);
              if (group.name === groupName) {
                targetGroup = group;
                break;
              }
            }
          }
          
          if (!targetGroup) continue;
          
          const groupClasses = targetGroup.classNames || targetGroup.classes || [];
          if (!groupClasses.includes(user.className)) continue;
        }

        results.push({
          nickname: record.nickname,
          realName: user.nickname || record.nickname,
          className: user.className || "未分班",
          wpm: record.wpm || 0,
          accuracy: record.accuracy || 0,
          timestamp: record.timestamp
        });
      }

      results.sort((a, b) => b.wpm - a.wpm);
      
      const defaultLimit = (type === 'class' || type === 'group') ? 10 : 20;
      const finalLimit = limit || defaultLimit;
      
      const ranked = results.slice(0, finalLimit).map((item, index) => ({
        rank: index + 1,
        ...item
      }));

      return json({ 
        success: true, 
        rank: ranked,
        type: type || 'all',
        total: results.length
      });
    }

    /* ========================= 阅读历史记录 ========================== */
    if (path === "user/reading-history") {
      const { nickname, page = 1, pageSize = 10 } = await request.json();
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
      
      const total = records.length;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const paginated = records.slice(start, end);

      return json({ 
        success: true, 
        records: paginated,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    }

    /* ========================= 问答系统 API ========================== */
    if (path === "qa/question/save") {
      const { id, content, answer, difficulty, tags, isActive } = await request.json();
      
      if (!content) {
        return json({ success: false, message: "问题内容不能为空" });
      }

      const questionId = id || "qa:" + Date.now();
      const questionKey = "qa:question:" + questionId;

      const questionData = {
        id: questionId,
        content,
        answer: answer || "",
        difficulty: difficulty || "medium",
        tags: tags || [],
        isActive: isActive !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(questionKey, JSON.stringify(questionData));
      return json({ success: true, question: questionData });
    }

    if (path === "qa/question/list") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "qa:question:" });
      const questions = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          questions.push(JSON.parse(data));
        }
      }
      questions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return json({ success: true, questions });
    }

    if (path === "qa/question/delete") {
      const { id } = await request.json();
      if (!id) {
        return json({ success: false, message: "问题ID不能为空" });
      }
      const key = "qa:question:" + id;
      await env.TYPEREADING_KV.delete(key);
      return json({ success: true });
    }

    if (path === "qa/assign") {
      const { questionIds, targetType, targetGroup, targetClasses, dueDate } = await request.json();
      
      if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
        return json({ success: false, message: "请选择要布置的问题" });
      }

      const assignmentId = "qa:assign:" + Date.now();
      const assignmentData = {
        id: assignmentId,
        questionIds,
        targetType: targetType || "all",
        targetGroup: targetGroup || "",
        targetClasses: targetClasses || [],
        dueDate: dueDate || "",
        createdAt: new Date().toISOString(),
        status: "active"
      };

      await env.TYPEREADING_KV.put(assignmentId, JSON.stringify(assignmentData));
      return json({ success: true, assignment: assignmentData });
    }

    if (path === "qa/student/questions") {
      const { nickname, className } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

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

      const { keys: assignKeys } = await env.TYPEREADING_KV.list({ prefix: "qa:assign:" });
      const assignedQuestionIds = new Set();
      
      for (const key of assignKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const assignment = JSON.parse(data);
        
        let isMatch = false;
        if (assignment.targetType === "all") {
          isMatch = true;
        } else if (assignment.targetType === "group") {
          isMatch = groupNames.includes(assignment.targetGroup);
        } else if (assignment.targetType === "class") {
          isMatch = assignment.targetClasses && assignment.targetClasses.includes(className);
        }
        
        if (isMatch && assignment.status === "active") {
          assignment.questionIds.forEach(id => assignedQuestionIds.add(id));
        }
      }

      const questions = [];
      for (const questionId of assignedQuestionIds) {
        const data = await env.TYPEREADING_KV.get("qa:question:" + questionId);
        if (data) {
          const q = JSON.parse(data);
          if (q.isActive !== false) {
            questions.push(q);
          }
        }
      }

      return json({ success: true, questions });
    }

    if (path === "qa/answer/submit") {
      const { nickname, questionId, answer } = await request.json();
      if (!nickname || !questionId) {
        return json({ success: false, message: "参数不完整" });
      }

      const answerId = "qa:answer:" + nickname + ":" + questionId + ":" + Date.now();
      const answerData = {
        id: answerId,
        nickname,
        questionId,
        answer: answer || "",
        submittedAt: new Date().toISOString(),
        score: null,
        feedback: ""
      };

      await env.TYPEREADING_KV.put(answerId, JSON.stringify(answerData));
      return json({ success: true, answer: answerData });
    }

    /* ========================= 请假管理 API ========================== */
    if (path === "leave/submit") {
      const { nickname, reason, startDate, endDate, type } = await request.json();
      if (!nickname || !reason || !startDate || !endDate) {
        return json({ success: false, message: "请填写完整的请假信息" });
      }

      const leaveId = "leave:" + nickname + ":" + Date.now();
      const leaveData = {
        id: leaveId,
        nickname,
        reason,
        startDate,
        endDate,
        type: type || "personal",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(leaveId, JSON.stringify(leaveData));
      return json({ success: true, leave: leaveData });
    }

    if (path === "leave/list") {
      const { nickname, status } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "leave:" });
      const leaves = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const leave = JSON.parse(data);
        
        if (nickname && leave.nickname !== nickname) continue;
        if (status && leave.status !== status) continue;
        
        leaves.push(leave);
      }
      
      leaves.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ success: true, leaves });
    }

    if (path === "leave/approve") {
      const { id, approved, comment } = await request.json();
      if (!id) {
        return json({ success: false, message: "请假ID不能为空" });
      }

      const data = await env.TYPEREADING_KV.get(id);
      if (!data) {
        return json({ success: false, message: "请假记录不存在" });
      }

      const leave = JSON.parse(data);
      leave.status = approved ? "approved" : "rejected";
      leave.comment = comment || "";
      leave.updatedAt = new Date().toISOString();

      await env.TYPEREADING_KV.put(id, JSON.stringify(leave));
      return json({ success: true, leave });
    }

    // ========== 第三段继续（财务管理、资源管理、仪表盘统计等）==========
    /* ========================= 财务管理 API ========================== */
    if (path === "finance/payment/record") {
      const { nickname, amount, type, note, date } = await request.json();
      if (!nickname || !amount) {
        return json({ success: false, message: "请填写完整的缴费信息" });
      }

      const paymentId = "payment:" + nickname + ":" + Date.now();
      const paymentData = {
        id: paymentId,
        nickname,
        amount: parseFloat(amount),
        type: type || "tuition",
        note: note || "",
        date: date || new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(paymentId, JSON.stringify(paymentData));
      return json({ success: true, payment: paymentData });
    }

    if (path === "finance/payment/list") {
      const { nickname, startDate, endDate } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
      const payments = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const payment = JSON.parse(data);
        
        if (nickname && payment.nickname !== nickname) continue;
        if (startDate && payment.date < startDate) continue;
        if (endDate && payment.date > endDate) continue;
        
        payments.push(payment);
      }
      
      payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      
      return json({ 
        success: true, 
        payments,
        summary: {
          totalCount: payments.length,
          totalAmount: totalAmount.toFixed(2)
        }
      });
    }

    if (path === "finance/payment/delete") {
      const { id } = await request.json();
      if (!id) {
        return json({ success: false, message: "缴费记录ID不能为空" });
      }
      await env.TYPEREADING_KV.delete(id);
      return json({ success: true });
    }

    /* ========================= 资源管理 API ========================== */
    if (path === "resource/upload") {
      const { title, url, type, description, tags } = await request.json();
      if (!title || !url) {
        return json({ success: false, message: "标题和链接不能为空" });
      }

      const resourceId = "resource:" + Date.now();
      const resourceData = {
        id: resourceId,
        title,
        url,
        type: type || "link",
        description: description || "",
        tags: tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(resourceId, JSON.stringify(resourceData));
      return json({ success: true, resource: resourceData });
    }

    if (path === "resource/list") {
      const { type, tag } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "resource:" });
      const resources = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const resource = JSON.parse(data);
        
        if (type && resource.type !== type) continue;
        if (tag && (!resource.tags || !resource.tags.includes(tag))) continue;
        
        resources.push(resource);
      }
      
      resources.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return json({ success: true, resources });
    }

    if (path === "resource/delete") {
      const { id } = await request.json();
      if (!id) {
        return json({ success: false, message: "资源ID不能为空" });
      }
      await env.TYPEREADING_KV.delete(id);
      return json({ success: true });
    }

    /* ========================= 仪表盘统计 API ========================== */
    if (path === "admin/dashboard") {
      const today = new Date().toISOString().split("T")[0];
      const thisMonth = today.substring(0, 7);

      const { keys: userKeys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
      const totalStudents = userKeys.length;

      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      let todayCheckins = 0;
      let monthCheckins = 0;
      const checkedToday = new Set();
      
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);
        
        if (record.date === today) {
          todayCheckins++;
          checkedToday.add(record.nickname);
        }
        if (record.date && record.date.startsWith(thisMonth)) {
          monthCheckins++;
        }
      }

      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      let todayTyping = 0;
      let monthTyping = 0;
      
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);
        
        if (record.date === today) {
          todayTyping++;
        }
        if (record.date && record.date.startsWith(thisMonth)) {
          monthTyping++;
        }
      }

      const { keys: classKeys } = await env.TYPEREADING_KV.list({ prefix: "class:" });
      const totalClasses = classKeys.length;

      const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
      let monthRevenue = 0;
      
      for (const key of paymentKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const payment = JSON.parse(data);
        
        if (payment.date && payment.date.startsWith(thisMonth)) {
          monthRevenue += payment.amount || 0;
        }
      }

      return json({
        success: true,
        stats: {
          totalStudents,
          totalClasses,
          todayCheckins,
          todayCheckinStudents: checkedToday.size,
          monthCheckins,
          todayTyping,
          monthTyping,
          monthRevenue: monthRevenue.toFixed(2),
          checkinRate: totalStudents > 0 ? Math.round((checkedToday.size / totalStudents) * 100) : 0
        }
      });
    }

    if (path === "admin/stats/reading") {
      const { startDate, endDate, className } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const records = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);
        
        if (startDate && record.date < startDate) continue;
        if (endDate && record.date > endDate) continue;
        
        if (className) {
          const userData = await env.TYPEREADING_KV.get("user:" + record.nickname);
          if (userData) {
            const user = JSON.parse(userData);
            if (user.className !== className) continue;
          }
        }
        
        records.push(record);
      }

      const dailyStats = {};
      for (const r of records) {
        if (!dailyStats[r.date]) {
          dailyStats[r.date] = { date: r.date, count: 0, words: 0, minutes: 0 };
        }
        dailyStats[r.date].count++;
        dailyStats[r.date].words += r.wordCount || 0;
        dailyStats[r.date].minutes += Math.round((r.duration || 0) / 60);
      }

      return json({
        success: true,
        records: records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
        dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))
      });
    }

    if (path === "admin/stats/typing") {
      const { startDate, endDate, className } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const records = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);
        
        if (startDate && record.date < startDate) continue;
        if (endDate && record.date > endDate) continue;
        
        if (className) {
          const userData = await env.TYPEREADING_KV.get("user:" + record.nickname);
          if (userData) {
            const user = JSON.parse(userData);
            if (user.className !== className) continue;
          }
        }
        
        records.push(record);
      }

      const dailyStats = {};
      for (const r of records) {
        if (!dailyStats[r.date]) {
          dailyStats[r.date] = { date: r.date, count: 0, avgWpm: 0, avgAccuracy: 0, minutes: 0 };
        }
        dailyStats[r.date].count++;
        dailyStats[r.date].minutes += Math.round((r.duration || 0) / 60);
      }

      for (const date in dailyStats) {
        const dayRecords = records.filter(r => r.date === date);
        dailyStats[date].avgWpm = Math.round(dayRecords.reduce((s, r) => s + (r.wpm || 0), 0) / dayRecords.length);
        dailyStats[date].avgAccuracy = Math.round(dayRecords.reduce((s, r) => s + (r.accuracy || 0), 0) / dayRecords.length);
      }

      return json({
        success: true,
        records: records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
        dailyStats: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date))
      });
    }

    /* ========================= 通知公告 API ========================== */
    if (path === "announcement/save") {
      const { id, title, content, priority, targetType, targetGroup, targetClasses, expiresAt } = await request.json();
      
      if (!title || !content) {
        return json({ success: false, message: "标题和内容不能为空" });
      }

      const announcementId = id || "announcement:" + Date.now();
      const announcementData = {
        id: announcementId,
        title,
        content,
        priority: priority || "normal",
        targetType: targetType || "all",
        targetGroup: targetGroup || "",
        targetClasses: targetClasses || [],
        expiresAt: expiresAt || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(announcementId, JSON.stringify(announcementData));
      return json({ success: true, announcement: announcementData });
    }

    if (path === "announcement/list") {
      const { targetType, targetGroup, targetClass } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "announcement:" });
      const announcements = [];
      const now = new Date().toISOString();
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const announcement = JSON.parse(data);
        
        if (announcement.expiresAt && announcement.expiresAt < now) continue;
        
        if (targetType) {
          if (announcement.targetType !== "all" && announcement.targetType !== targetType) continue;
          if (targetGroup && announcement.targetGroup && announcement.targetGroup !== targetGroup) continue;
          if (targetClass && announcement.targetClasses && !announcement.targetClasses.includes(targetClass)) continue;
        }
        
        announcements.push(announcement);
      }
      
      announcements.sort((a, b) => {
        const priorityMap = { high: 3, normal: 2, low: 1 };
        const priorityDiff = (priorityMap[b.priority] || 2) - (priorityMap[a.priority] || 2);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      return json({ success: true, announcements });
    }

    if (path === "announcement/delete") {
      const { id } = await request.json();
      if (!id) {
        return json({ success: false, message: "公告ID不能为空" });
      }
      await env.TYPEREADING_KV.delete(id);
      return json({ success: true });
    }

    /* ========================= 消息通知 API ========================== */
    if (path === "notification/send") {
      const { nickname, title, content, type } = await request.json();
      if (!nickname || !title || !content) {
        return json({ success: false, message: "请填写完整的通知信息" });
      }

      const notificationId = "notification:" + nickname + ":" + Date.now();
      const notificationData = {
        id: notificationId,
        nickname,
        title,
        content,
        type: type || "system",
        isRead: false,
        createdAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(notificationId, JSON.stringify(notificationData));
      return json({ success: true, notification: notificationData });
    }

    if (path === "notification/list") {
      const { nickname, isRead } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "notification:" + nickname + ":" });
      const notifications = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const notification = JSON.parse(data);
        
        if (isRead !== undefined && notification.isRead !== isRead) continue;
        
        notifications.push(notification);
      }
      
      notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ success: true, notifications });
    }

    if (path === "notification/read") {
      const { id } = await request.json();
      if (!id) {
        return json({ success: false, message: "通知ID不能为空" });
      }

      const data = await env.TYPEREADING_KV.get(id);
      if (!data) {
        return json({ success: false, message: "通知不存在" });
      }

      const notification = JSON.parse(data);
      notification.isRead = true;
      notification.readAt = new Date().toISOString();

      await env.TYPEREADING_KV.put(id, JSON.stringify(notification));
      return json({ success: true, notification });
    }

    if (path === "notification/read-all") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "notification:" + nickname + ":" });
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const notification = JSON.parse(data);
        
        if (!notification.isRead) {
          notification.isRead = true;
          notification.readAt = new Date().toISOString();
          await env.TYPEREADING_KV.put(key.name, JSON.stringify(notification));
        }
      }
      
      return json({ success: true });
    }

    /* ========================= 系统设置 API ========================== */
    if (path === "admin/settings/get") {
      const settingsKey = "system:settings";
      const data = await env.TYPEREADING_KV.get(settingsKey);
      
      const defaultSettings = {
        siteName: "TypeReading",
        allowRegistration: true,
        defaultMembership: "basic",
        readingGoal: 30,
        typingGoal: 15,
        checkinReminder: true,
        autoAssignContent: true
      };
      
      if (!data) {
        return json({ success: true, settings: defaultSettings });
      }
      
      return json({ success: true, settings: { ...defaultSettings, ...JSON.parse(data) } });
    }

    if (path === "admin/settings/save") {
      const settings = await request.json();
      const settingsKey = "system:settings";
      
      const existingData = await env.TYPEREADING_KV.get(settingsKey);
      const existing = existingData ? JSON.parse(existingData) : {};
      
      const newSettings = {
        ...existing,
        ...settings,
        updatedAt: new Date().toISOString()
      };
      
      await env.TYPEREADING_KV.put(settingsKey, JSON.stringify(newSettings));
      return json({ success: true, settings: newSettings });
    }

    /* ========================= 数据备份/恢复 API ========================== */
    if (path === "admin/backup/export") {
      const { keys: userKeys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const { keys: classKeys } = await env.TYPEREADING_KV.list({ prefix: "class:" });
      const { keys: groupKeys } = await env.TYPEREADING_KV.list({ prefix: "group:" });
      const { keys: contentKeys } = await env.TYPEREADING_KV.list({ prefix: "content:" });
      const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });

      const allData = {
        users: [],
        readingRecords: [],
        typingRecords: [],
        classes: [],
        groups: [],
        contents: [],
        payments: []
      };

      for (const key of userKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) allData.users.push(JSON.parse(data));
      }

      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) allData.readingRecords.push(JSON.parse(data));
      }

      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) allData.typingRecords.push(JSON.parse(data));
      }

      for (const key of classKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) allData.classes.push(JSON.parse(data));
      }

      for (const key of groupKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) allData.groups.push(JSON.parse(data));
      }

      for (const key of contentKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) allData.contents.push(JSON.parse(data));
      }

      for (const key of paymentKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) allData.payments.push(JSON.parse(data));
      }

      return json({
        success: true,
        data: allData,
        exportedAt: new Date().toISOString()
      });
    }

    if (path === "admin/backup/import") {
      const { data, options } = await request.json();
      
      if (!data) {
        return json({ success: false, message: "备份数据不能为空" });
      }

      const importOptions = {
        clearExisting: options?.clearExisting || false,
        ...options
      };

      if (importOptions.clearExisting) {
        const allKeys = await env.TYPEREADING_KV.list();
        for (const key of allKeys.keys) {
          await env.TYPEREADING_KV.delete(key.name);
        }
      }

      let imported = 0;

      if (data.users) {
        for (const user of data.users) {
          await env.TYPEREADING_KV.put("user:" + user.nickname, JSON.stringify(user));
          imported++;
        }
      }

      if (data.readingRecords) {
        for (const record of data.readingRecords) {
          const key = record.id || "reading:" + record.nickname + ":" + Date.now();
          await env.TYPEREADING_KV.put(key, JSON.stringify(record));
          imported++;
        }
      }

      if (data.typingRecords) {
        for (const record of data.typingRecords) {
          const key = record.id || "typing:" + record.nickname + ":" + Date.now();
          await env.TYPEREADING_KV.put(key, JSON.stringify(record));
          imported++;
        }
      }

      if (data.classes) {
        for (const cls of data.classes) {
          await env.TYPEREADING_KV.put("class:" + cls.name, JSON.stringify(cls));
          imported++;
        }
      }

      if (data.groups) {
        for (const group of data.groups) {
          await env.TYPEREADING_KV.put(group.id || "group:" + Date.now(), JSON.stringify(group));
          imported++;
        }
      }

      if (data.contents) {
        for (const content of data.contents) {
          const key = content.id || "content:item:" + Date.now();
          await env.TYPEREADING_KV.put(key, JSON.stringify(content));
          imported++;
        }
      }

      return json({
        success: true,
        message: "数据导入成功",
        importedCount: imported,
        importedAt: new Date().toISOString()
      });
    }

    /* ========================= 日志查询 API ========================== */
    if (path === "admin/logs") {
      const { startDate, endDate, type, nickname } = await request.json();
      
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "log:" });
      const logs = [];
      
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const log = JSON.parse(data);
        
        if (startDate && log.timestamp < startDate) continue;
        if (endDate && log.timestamp > endDate) continue;
        if (type && log.type !== type) continue;
        if (nickname && log.nickname !== nickname) continue;
        
        logs.push(log);
      }
      
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return json({
        success: true,
        logs: logs.slice(0, 1000)
      });
    }

    /* ========================= 学生端首页数据 API ========================== */
    if (path === "user/home") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const user = await getUserWithMembership(nickname, env);
      if (!user) {
        return json({ success: false, message: "用户不存在" });
      }

      const today = new Date().toISOString().split("T")[0];
      
      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      let todayReading = null;
      let totalReadingDays = 0;
      const readingDates = new Set();
      
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);
        
        if (record.nickname === nickname) {
          readingDates.add(record.date);
          if (record.date === today) {
            todayReading = record;
          }
        }
      }
      totalReadingDays = readingDates.size;

      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      let todayTyping = null;
      let totalTypingSessions = 0;
      
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);
        
        if (record.nickname === nickname) {
          totalTypingSessions++;
          if (record.date === today) {
            todayTyping = record;
          }
        }
      }

      const { keys: notifKeys } = await env.TYPEREADING_KV.list({ prefix: "notification:" + nickname + ":" });
      let unreadCount = 0;
      
      for (const key of notifKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const notification = JSON.parse(data);
        if (!notification.isRead) unreadCount++;
      }

      return json({
        success: true,
        user,
        today: {
          hasReading: !!todayReading,
          hasTyping: !!todayTyping,
          readingRecord: todayReading,
          typingRecord: todayTyping
        },
        stats: {
          totalReadingDays,
          totalTypingSessions,
          unreadNotifications: unreadCount
        }
      });
    }

    /* ========================= 教师端首页数据 API ========================== */
    if (path === "admin/home") {
      const today = new Date().toISOString().split("T")[0];
      const thisMonth = today.substring(0, 7);

      const { keys: userKeys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
      const totalStudents = userKeys.length;
      
      let activeStudents = 0;
      let premiumStudents = 0;
      
      for (const key of userKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const user = JSON.parse(data);
        
        if (user.isActive !== false) activeStudents++;
        if (user.membership?.type === "premium") premiumStudents++;
      }

      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      let todayCheckins = 0;
      let monthCheckins = 0;
      
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);
        
        if (record.date === today) todayCheckins++;
        if (record.date?.startsWith(thisMonth)) monthCheckins++;
      }

      const { keys: leaveKeys } = await env.TYPEREADING_KV.list({ prefix: "leave:" });
      let pendingLeaves = 0;
      
      for (const key of leaveKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const leave = JSON.parse(data);
        
        if (leave.status === "pending") pendingLeaves++;
      }

      const { keys: paymentKeys } = await env.TYPEREADING_KV.list({ prefix: "payment:" });
      let monthRevenue = 0;
      
      for (const key of paymentKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const payment = JSON.parse(data);
        
        if (payment.date?.startsWith(thisMonth)) {
          monthRevenue += payment.amount || 0;
        }
      }

      return json({
        success: true,
        stats: {
          totalStudents,
          activeStudents,
          premiumStudents,
          todayCheckins,
          monthCheckins,
          pendingLeaves,
          monthRevenue: monthRevenue.toFixed(2),
          checkinRate: totalStudents > 0 ? Math.round((todayCheckins / totalStudents) * 100) : 0
        }
      });
    }

    // 接口不存在
    return json({ success: false, message: "接口不存在：" + path });
    
  } catch (err) {
    console.error("API Error:", err);
    return json({ success: false, message: err.message });
  }

  // ===== 辅助函数：获取本周开始日期 =====
  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split("T")[0];
  }

  // ===== 辅助函数：计算阅读统计 =====
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

  // ===== 辅助函数：计算打字统计 =====
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

  // ===== 辅助函数：返回 JSON 响应 =====
  function json(data) {
    return new Response(JSON.stringify(data), { headers });
  }
}
