---
title: 阅读打卡
---

<style>
.container { max-width: 800px; margin: 0 auto; padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 15px; background: #e7f3ff; border-radius: 8px; }
.article-box { border: 2px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; min-height: 300px; line-height: 1.8; font-size: 16px; }
.btn { padding: 10px 30px; font-size: 16px; border: none; border-radius: 4px; cursor: pointer; }
.btn-primary { background: #28a745; color: white; }
.btn-primary:hover { background: #218838; }
.btn:disabled { background: #ccc; cursor: not-allowed; }
.timer { font-size: 24px; color: #666; margin-left: 20px; }
.result { margin-top: 20px; padding: 15px; border-radius: 8px; background: #d4edda; display: none; }
</style>

<div class="container">
  <div class="header">
    <div>
      <strong id="userName">加载中...</strong>
      <small id="userId"></small>
    </div>
    <div>
      <a href="/register/">🏠 首页</a> | <a href="/typing/">⌨️ 打字</a> | <a href="/rank/">🏆 排名</a>
    </div>
  </div>

  <h3>📚 今日阅读文章</h3>
  <div class="article-box" id="articleContent">
    <p>等待教师发布文章内容...</p>
    <p>（教师可以在后台设置每日阅读材料）</p>
  </div>

  <div style="margin-bottom: 20px;">
    <button class="btn btn-primary" id="startBtn" onclick="startReading()">开始阅读</button>
    <span class="timer" id="timer" style="display: none;">⏱️ 00:00</span>
    <button class="btn btn-primary" id="checkinBtn" style="display: none; margin-left: 20px;" onclick="submitCheckin()">完成打卡</button>
  </div>

  <div class="result" id="resultBox">
    <strong>✅ 打卡成功！</strong>
    <p id="checkinResult"></p>
  </div>
</div>

<script>
const user = JSON.parse(localStorage.getItem('typereading_user') || '{}');
if (!user.userId) {
  alert('请先登录');
  location.href = '/register/';
}

document.getElementById('userName').textContent = user.nickname || '未登录';
document.getElementById('userId').textContent = user.userId || '';

// 示例文章（教师可替换）
const article = `The quick brown fox jumps over the lazy dog. This is a sample text for reading practice. Students should read this carefully and understand the meaning.`;

let startTime = null;
let timerInterval = null;

function startReading() {
  document.getElementById('articleContent').innerHTML = '<p>' + article + '</p>';
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('timer').style.display = 'inline';
  document.getElementById('checkinBtn').style.display = 'inline-block';
  
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('timer').textContent = `⏱️ ${minutes}:${seconds}`;
  }, 1000);
}

async function submitCheckin() {
  if (timerInterval) clearInterval(timerInterval);
  
  const duration = Math.floor((Date.now() - startTime) / 1000);
  const words = article.split(' ').length;
  
  try {
    const res = await fetch('/api/checkin/reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        articleId: 'sample',
        duration: duration,
        wordsRead: words
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      document.getElementById('resultBox').style.display = 'block';
      document.getElementById('checkinResult').innerHTML = `
        阅读时长：${Math.floor(duration/60)}分${duration%60}秒<br>
        阅读字数：${words}词
      `;
      document.getElementById('checkinBtn').disabled = true;
      document.getElementById('checkinBtn').textContent = '已打卡';
    }
  } catch (err) {
    alert('打卡失败，请重试');
  }
}
</script>
