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

  try {
    /* ========================= 学生注册 ========================== */
    if (path === "auth/register" && request.method === "POST") {
      const { nickname, password } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      // 修复：正确使用 nickname 变量
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
        createdAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(userData));
      return json({ 
        success: true, 
        user: {
          nickname,
          realName: "",
          gender: "",
          className: ""
        }
      });
    }

    /* ========================= 学生登录 ========================== */
    if (path === "auth/login" && request.method === "POST") {
      const { nickname, password } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      // 修复：正确使用 nickname 变量
      const userKey = "user:" + nickname;
      const data = await env.TYPEREADING_KV.get(userKey);
      if (!data) {
        return json({ success: false, message: "用户不存在" });
      }

      const user = JSON.parse(data);
      if (user.password && user.password !== password) {
        return json({ success: false, message: "密码错误" });
      }

      return json({ success: true, user });
    }

    /* ========================= 教师登录 ========================== */
    if (path === "admin/login" && request.method === "POST") {
      const { password } = await request.json();
      if (password === "teacher123") {
        return json({ success: true });
      }
      return json({ success: false, message: "密码错误" });
    }

     /* ========================= 获取所有学生（修改） ========================== */
    if (path === "admin/students") {
      // 先获取所有阅读记录和打字记录
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

      // 获取学生列表并附加统计数据
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "user:" });
      const students = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const user = JSON.parse(data);
          // 计算该学生的统计数据
          user.totalReadingWords = readingRecords
            .filter(r => r.nickname === user.nickname)
            .reduce((sum, r) => sum + (r.wordCount || 0), 0);
          // 修改：打字总单词数（从打字记录中提取内容长度）
          user.totalTypingWords = typingRecords
            .filter(r => r.nickname === user.nickname)
            .reduce((sum, r) => sum + (r.wordCount || r.content?.length || 0), 0);
          students.push(user);
        }
      }
      students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return json({ success: true, students });
    }


    /* ========================= 更新学生信息 ========================== */
    if (path === "admin/student/update") {
      const { nickname, realName, gender, className } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      // 修复：正确使用 nickname 变量
      const userKey = "user:" + nickname;
      const data = await env.TYPEREADING_KV.get(userKey);
      if (!data) return json({ success: false, message: "用户不存在" });

      const user = JSON.parse(data);
      user.realName = realName || "";
      user.gender = gender || "";
      user.className = className || "";

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));
      return json({ success: true });
    }

    /* ========================= 删除单个学生 ========================== */
    if (path === "admin/student/delete") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      // 修复：正确使用 nickname 变量
      const userKey = "user:" + nickname;
      await env.TYPEREADING_KV.delete(userKey);

      // 删除该学生的所有记录
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
        // 修复：正确使用 nickname 变量
        const userKey = "user:" + nickname;
        await env.TYPEREADING_KV.delete(userKey);

        // 删除阅读记录
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

        // 删除打字记录
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

      // 修复：正确使用 className 变量
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

        /* ========================= 查询今日打卡状态（新增） ========================== */
    if (path === "checkin/status") {
      const { nickname } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const today = new Date().toISOString().split("T")[0];
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
        record: todayRecord
      });
    }

    /* ========================= 阅读打卡（修改） ========================== */
    if (path === "checkin/reading") {
      const { nickname, articleTitle, wordCount } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const today = new Date().toISOString().split("T")[0];
      
      // 新增：检查今日是否已打卡
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
      const now = new Date();

      await env.TYPEREADING_KV.put(
        recordKey,
        JSON.stringify({
          nickname,
          articleTitle: articleTitle || "未命名文章",
          wordCount: Number(wordCount) || 0,
          date: today,
          timestamp: now.toISOString()
        })
      );

      return json({ success: true, message: "打卡成功" });
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

    /* ========================= 打字记录提交（修改） ========================== */
    if (path === "typing/result") {
      const { nickname, wpm, accuracy, wordCount, content } = await request.json();
      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const recordKey = "typing:" + nickname + ":" + Date.now();
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];

      // 修改：添加 wordCount 字段，优先使用传入的 wordCount，否则计算 content 长度
      const finalWordCount = Number(wordCount) || (content ? content.length : 0);

      await env.TYPEREADING_KV.put(
        recordKey,
        JSON.stringify({
          nickname,
          wpm: Number(wpm) || 0,
          accuracy: Number(accuracy) || 0,
          wordCount: finalWordCount,  // 新增：打字单词数
          content: content || "",      // 可选：保存原文
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

      // 获取阅读记录
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

      // 获取打字记录
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

      // 过滤当前用户的记录
      const userReading = readingRecords.filter(r => r.nickname === nickname);
      const userTyping = typingRecords.filter(r => r.nickname === nickname);

      // 计算统计
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

        /* ========================= 保存阅读/打字内容（新增） ========================== */
    if (path === "admin/content/save") {
      const { id, type, title, content, wordCount, difficulty, isActive } = await request.json();
      
      if (!type || !["reading", "typing"].includes(type)) {
        return json({ success: false, message: "类型错误" });
      }
      if (!title) {
        return json({ success: false, message: "标题不能为空" });
      }
      if (!content) {
        return json({ success: false, message: "内容不能为空" });
      }

      const contentId = id || Date.now().toString();
      const contentKey = "content:" + type + ":" + contentId;

      const contentData = {
        id: contentId,
        type,
        title,
        content,
        wordCount: Number(wordCount) || content.length,
        difficulty: difficulty || "medium",
        isActive: isActive !== false,
        updatedAt: new Date().toISOString()
      };

      await env.TYPEREADING_KV.put(contentKey, JSON.stringify(contentData));
      return json({ success: true, content: contentData });
    }

    /* ========================= 获取内容列表（新增） ========================== */
    if (path === "admin/content/list") {
      const { type } = await request.json();
      
      let prefix = "content:";
      if (type) {
        prefix = "content:" + type + ":";
      }

      const { keys } = await env.TYPEREADING_KV.list({ prefix });
      const contents = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) contents.push(JSON.parse(data));
      }
      contents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return json({ success: true, contents });
    }

    /* ========================= 删除内容（新增） ========================== */
    if (path === "admin/content/delete") {
      const { id, type } = await request.json();
      if (!id || !type) {
        return json({ success: false, message: "参数错误" });
      }

      const contentKey = "content:" + type + ":" + id;
      await env.TYPEREADING_KV.delete(contentKey);
      return json({ success: true });
    }

    /* ========================= 获取今日阅读内容（新增） ========================== */
    if (path === "content/reading") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "content:reading:" });
      const contents = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const content = JSON.parse(data);
          if (content.isActive) {
            contents.push(content);
          }
        }
      }
      
      const selectedContent = contents.length > 0 
        ? contents[Math.floor(Math.random() * contents.length)]
        : null;

      return json({ success: true, content: selectedContent });
    }

    /* ========================= 获取打字练习内容（新增） ========================== */
    if (path === "content/typing") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "content:typing:" });
      const contents = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) {
          const content = JSON.parse(data);
          if (content.isActive) {
            contents.push(content);
          }
        }
      }
      
      const selectedContent = contents.length > 0 
        ? contents[Math.floor(Math.random() * contents.length)]
        : null;

      return json({ success: true, content: selectedContent });
    }

    /* ========================= 排行榜 ========================== */
    if (path === "rank/typing") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const results = [];

      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;
        const record = JSON.parse(data);

        // 修复：正确使用 record.nickname 变量
        const userKey = "user:" + record.nickname;
        const userData = await env.TYPEREADING_KV.get(userKey);
        if (!userData) continue;

        const user = JSON.parse(userData);
        if (user.realName) {
          results.push({
            ...record,
            realName: user.realName,
            className: user.className || ""
          });
        }
      }

      results.sort((a, b) => b.wpm - a.wpm);
      return json({ success: true, rank: results.slice(0, 20) });
    }

    return json({ success: false, message: "接口不存在：" + path });

  } catch (err) {
    console.error("API Error:", err);
    return json({ success: false, message: err.message });
  }

  // 辅助函数
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
