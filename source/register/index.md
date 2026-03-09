---
title: 登录
---

<h1>📚 TypeReading Hub</h1>

<div>
  <input type="text" id="nickname" placeholder="请输入昵称">
  <button onclick="login()">登录 / 注册</button>
</div>

<script>
async function login() {
  const nickname = document.getElementById('nickname').value;
  if (!nickname) {
    alert('请输入昵称');
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
      localStorage.setItem('user', JSON.stringify(data.user));
      alert(data.isNew ? '注册成功！' : '欢迎回来！');
      window.location.href = '/reading/';
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert('网络错误');
  }
}
</script>
