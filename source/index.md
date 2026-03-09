---
title: 首页
---

<style>
.container { max-width: 800px; margin: 50px auto; text-align: center; padding: 20px; }
.title { font-size: 2.5em; color: #333; margin-bottom: 20px; }
.subtitle { font-size: 1.2em; color: #666; margin-bottom: 40px; }
.menu { display: flex; justify-content: center; gap: 20px; margin-top: 50px; flex-wrap: wrap; }
.menu-item { padding: 20px 40px; background: #007bff; color: white; text-decoration: none; border-radius: 8px; font-size: 1.1em; transition: transform 0.2s; }
.menu-item:hover { transform: scale(1.05); background: #0056b3; }
.intro { margin: 40px 0; padding: 30px; background: #f8f9fa; border-radius: 8px; }
.feature { margin: 20px 0; text-align: left; display: inline-block; }
.feature li { margin: 10px 0; color: #555; }
</style>

<div class="container">
  <h1 class="title">📚 TypeReading Hub</h1>
  <p class="subtitle">英语阅读与打字练习平台</p>
  
  <div class="intro">
    <ul class="feature">
      <li>✅ 学生注册登录 - 简单快捷</li>
      <li>📖 阅读打卡 - 记录学习进度</li>
      <li>⌨️ 打字练习 - 提升打字速度</li>
      <li>🏆 实时排行榜 - 查看排名</li>
    </ul>
  </div>
  
  <div class="menu">
    <a href="/register/" class="menu-item">🎓 学生登录</a>
    <a href="/reading/" class="menu-item">📖 阅读打卡</a>
    <a href="/typing/" class="menu-item">⌨️ 打字练习</a>
    <a href="/rank/" class="menu-item">🏆 排行榜</a>
  </div>
</div>
