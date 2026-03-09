---
title: 打字排行榜
---

<style>
.container { max-width: 800px; margin: 0 auto; padding: 20px; }
.header { margin-bottom: 20px; padding: 15px; background: #ffe7e7; border-radius: 8px; }
.rank-list { border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; }
.rank-item { display: flex; padding: 15px; border-bottom: 1px solid #eee; align-items: center; }
.rank-item:last-child { border-bottom: none; }
.rank-item:hover { background: #f8f9fa; }
.rank-num { width: 50px; font-size: 24px; font-weight: bold; text-align: center; }
.rank-num.top1 { color: #ffd700; }
.rank-num.top2 { color: #c0c0c0; }
.rank-num.top3 { color: #cd7f32; }
.user-info { flex: 1; }
.user-name { font-size: 16px; font-weight: bold; }
.user-detail { color: #666; font-size: 14px; }
.score { text-align: right; }
.score-wpm { font-size: 24px; font-weight: bold; color: #007bff; }
.score-acc { color: #666; font-size: 14px; }
.empty { text-align: center; padding: 50px; color: #999; }
</style>

<div class="container">
  <div class="header">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2>🏆 打字排行榜</h2>
        <small>实时更新前20名</small>
      </div>
      <div>
        <a href="/register/">🏠 首页</a> | <a href="/reading/">📚 阅读</a> | <a href="/typing/">⌨️ 练习</a>
      </div>
    </div>
  </div>

  <div id="loading" style="text-align: center; padding: 50px;">加载中...</div>
  
  <div class="rank-list" id="rankList" style="display: none;">
    <!-- 排行榜内容将在这里显示 -->
  </div>
</div>

<script>
async function loadRank() {
  try {
    const res = await fetch('/api/rank/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const data = await res.json();
    document.getElementById('loading').style.display = 'none';
    
    if (data.success && data.rank && data.rank.length > 0) {
      const listEl = document.getElementById('rankList');
      listEl.style.display = 'block';
      
      let html = '';
      data.rank.forEach((item, index) => {
        const rankClass = index === 0 ? 'top1' : index === 1 ? 'top2' : index === 2 ? 'top3' : '';
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : (index + 1);
        
        html += `
          <div class="rank-item">
            <div class="rank-num ${rankClass}">${medal}</div>
            <div class="user-info">
              <div class="user-name">${item.nickname || '匿名用户'}</div>
              <div class="user-detail">${item.date || '未知日期'}</div>
            </div>
            <div class="score">
              <div class="score-wpm">${item.wpm} WPM</div>
              <div class="score-acc">准确率 ${item.accuracy}%</div>
            </div>
          </div>
        `;
      });
      
      listEl.innerHTML = html;
    } else {
      document.getElementById('rankList').innerHTML = '<div class="empty">暂无数据，快来参与打字练习吧！</div>';
      document.getElementById('rankList').style.display = 'block';
    }
  } catch (err) {
    document.getElementById('loading').innerHTML = '加载失败，<a href="javascript:location.reload()">点击重试</a>';
  }
}

// 页面加载时获取排行榜
loadRank();

// 每30秒自动刷新
setInterval(loadRank, 30000);
</script>
