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

    /* =========================
       学生注册
    ========================== */
    if (path === "auth/register" && request.method === "POST") {
      const { nickname, password } = await request.json();

      if (!nickname) {
        return json({ success: false, message: "昵称不能为空" });
      }

      const userKey = `user:`;
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

    /* =========================
       学生登录
    ========================== */
    if (path === "auth/login" && request.method === "POST") {
      const { nickname, password } = await request.json();

      const userKey = `user:`;
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

    /* =========================
       教师登录
    ========================== */
    if (path === "admin/login" && request.method === "POST") {
      const { password } = await request.json();

      if (password === "teacher123") {
        return json({ success: true });
      }

      return json({ success: false, message: "密码错误" });
    }

    /* =========================
       获取所有学生
    ========================== */
    if (path === "admin/students") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "user:" });

      const students = [];

      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) students.push(JSON.parse(data));
      }

      students.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return json({ success: true, students });
    }

    /* =========================
       更新学生信息
    ========================== */
    if (path === "admin/student/update") {
      const { nickname, realName, gender, className } = await request.json();

      const userKey = `user:`;
      const data = await env.TYPEREADING_KV.get(userKey);
      if (!data) return json({ success: false });

      const user = JSON.parse(data);

      user.realName = realName || "";
      user.gender = gender || "";
      user.className = className || "";

      await env.TYPEREADING_KV.put(userKey, JSON.stringify(user));

      return json({ success: true });
    }

    /* =========================
       删除单个学生
    ========================== */
    if (path === "admin/student/delete") {
      const { nickname } = await request.json();
      await env.TYPEREADING_KV.delete(`user:`);
      return json({ success: true });
    }

    /* =========================
       批量删除学生
    ========================== */
    if (path === "admin/student/delete-batch") {
      const { nicknames } = await request.json();

      for (const n of nicknames) {
        await env.TYPEREADING_KV.delete(`user:`);
      }

      return json({ success: true });
    }

    /* =========================
       创建班级
    ========================== */
    if (path === "admin/class/create") {
      const { className } = await request.json();
      await env.TYPEREADING_KV.put(
        `class:`,
        JSON.stringify({
          name: className,
          createdAt: new Date().toISOString()
        })
      );
      return json({ success: true });
    }

    /* =========================
       获取班级列表
    ========================== */
    if (path === "admin/classes") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "class:" });

      const classes = [];
      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) classes.push(JSON.parse(data));
      }

      return json({ success: true, classes });
    }

    /* =========================
       阅读打卡
    ========================== */
    if (path === "checkin/reading") {
      const { nickname, articleTitle, wordCount } = await request.json();

      const recordKey = `reading::`;

      await env.TYPEREADING_KV.put(
        recordKey,
        JSON.stringify({
          nickname,
          articleTitle: articleTitle || "未命名文章",
          wordCount: Number(wordCount) || 0,
          date: new Date().toISOString().split("T")[0],
          timestamp: new Date().toISOString()
        })
      );

      return json({ success: true });
    }

    /* =========================
       获取阅读记录
    ========================== */
    if (path === "user/reading-records") {
      const { nickname } = await request.json();

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

    /* =========================
       获取打字记录
    ========================== */
    if (path === "user/typing-records") {
      const { nickname } = await request.json();

      const { keys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });

      const records = [];

      for (const key of typingKeys) {
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

    /* =========================
       打字记录提交
    ========================== */
    if (path === "typing/result") {
      const { nickname, wpm, accuracy } = await request.json();

      const recordKey = `typing::`;

      await env.TYPEREADING_KV.put(
        recordKey,
        JSON.stringify({
          nickname,
          wpm: Number(wpm) || 0,
          accuracy: Number(accuracy) || 0,
          date: new Date().toISOString().split("T")[0],
          timestamp: new Date().toISOString()
        })
      );

      return json({ success: true });
    }

    /* =========================
       获取学习统计 ✅ 关键修复
    ========================== */
    if (path === "user/stats") {
      const { nickname } = await request.json();

      const today = new Date().toISOString().split("T")[0];
      const weekStart = getWeekStart(new Date());
      const thisMonth = today.substring(0, 7);
      const thisYear = today.substring(0, 4);

      // 获取阅读记录
      const { keys: readingKeys } = await env.TYPEREADING_KV.list({ prefix: "reading:" });
      const readingRecords = [];
      for (const key of readingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) readingRecords.push(JSON.parse(data));
      }

      // 获取打字记录
      const { keys: typingKeys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });
      const typingRecords = [];
      for (const key of typingKeys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (data) typingRecords.push(JSON.parse(data));
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

    /* =========================
       排行榜
    ========================== */
    if (path === "rank/typing") {
      const { keys } = await env.TYPEREADING_KV.list({ prefix: "typing:" });

      const results = [];

      for (const key of keys) {
        const data = await env.TYPEREADING_KV.get(key.name);
        if (!data) continue;

        const record = JSON.parse(data);
        const userData = await env.TYPEREADING_KV.get(`user:`);
        if (!userData) continue;

        const user = JSON.parse(userData);

        if (user.realName) {
          results.push({
            ...record,
            realName: user.realName,
            className: user.className
          });
        }
      }

      results.sort((a, b) => b.wpm - a.wpm);

      return json({ success: true, rank: results.slice(0, 20) });
    }

    return json({ success: false, message: "接口不存在：" + path });

  } catch (err) {
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
      if (type === 'date') return r.date === period;
      if (type === 'week') return r.date >= period;
      if (type === 'month') return r.date.startsWith(period);
      if (type === 'year') return r.date.startsWith(period);
      return false;
    });

    return {
      count: filtered.length,
      words: filtered.reduce((s, r) => s + (r.wordCount || 0), 0)
    };
  }

  function calcTypingStats(records, period, type) {
    const filtered = records.filter(r => {
      if (type === 'date') return r.date === period;
      if (type === 'week') return r.date >= period;
      if (type === 'month') return r.date.startsWith(period);
      if (type === 'year') return r.date.startsWith(period);
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
