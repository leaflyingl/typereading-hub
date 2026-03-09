---
title: 学生注册
---

<style>
.container { max-width: 500px; margin: 50px auto; padding: 20px; }
.card { background: #f8f9fa; border-radius: 8px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
input { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
button:hover { background: #0056b3; }
.message { margin-top: 15px; padding: 10px; border-radius: 4px; }
.success { background: #d4edda; color: #155724; }
.error { background: #f8d7da; color: #721c24; }
</style>

<div class="container">
  <div class="card">
    <h2>🎓 学生登录</h2>
    <p>输入昵称即可开始学习</p>
    
    <input type="text" id="nickname" placeholder="请输入昵称（至少2个字符）" maxlength="20">
    <button onclick="login()">进入学习</button>
    
    <div id="message"></div>
    
    <div id="userInfo" style="display: none; margin-top: 20px;">
      <p>欢迎，<strong id="userName"></strong>！</p>
      <p>用户ID：<code id="userId"></code></p>
      <div style="margin-top: 15px;">
        <a href="/reading/">📚 开始阅读</a> | 
        <a href="/typing/">⌨️ 打字练习</a> | 
        <a href="/rank/">🏆 排行榜</a>
      </div>
    </div>
  </div>
</div>

<script>
// 检查是否已登录
const savedUser = localStorage.getItem('typereading_user');
if (savedUser) {
  const user = JSON.parse(savedUser);
  showUserInfo(user);
}

async function login() {
  const nickname = document.getElementById('nickname').value.trim();
  const msgDiv = document.getElementById('message');
  
  if (nickname.length < 2) {
    msgDiv.innerHTML = '<div class="message error">昵称至少2个字符</div>';
    return;
  }
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    });
    
    const data = await res.json();
    
    if (data.success) {
      localStorage.setItem('typereading_user', JSON.stringify(data.user));
      msgDiv.innerHTML = '<div class="message success">登录成功！</div>';
      showUserInfo(data.user);
    } else {
      msgDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
    }
  } catch (err) {
    msgDiv.innerHTML = '<div class="message error">网络错误，请重试</div>';
  }
}

function showUserInfo(user) {
  document.getElementById('userName').textContent = user.nickname;
  document.getElementById('userId').textContent = user.userId;
  document.getElementById('userInfo').style.display = 'block';
  document.getElementById('nickname').style.display = 'none';
  document.querySelector('button').style.display = 'none';
}
</script>
