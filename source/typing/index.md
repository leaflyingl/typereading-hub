---
title: 打字练习
---

<style>
.container { max-width: 800px; margin: 0 auto; padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; }
.typing-box { border: 2px solid #007bff; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: #f8f9fa; }
.text-display { 
  font-size: 18px; 
  line-height: 1.8; 
  margin-bottom: 20px; 
  padding: 15px; 
  background: white; 
  border-radius: 4px;
  color: #666;
}
.text-display .correct { color: #28a745; font-weight: bold; }
.text-display .wrong { color: #dc3545; background: #ffebee; }
.text-display .cursor { background: #007bff; color: white; }
.input-area { width: 100%; padding: 15px; font-size: 18px; border: 2px solid #ddd; border-radius: 4px; box-sizing: border-box; }
.stats { display: flex; gap: 30px; margin: 20px 0; font-size: 18px; }
.stat-item { padding: 10px 20px; background: #e7f3ff; border-radius: 4px; }
.btn { padding: 12px 30px; font-size: 16px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
.btn-primary { background: #007bff; color: white; }
.btn-success { background: #28a745; color: white; }
</style>

<div class="container">
  <div class="header">
    <div>
      <strong id="userName">加载中...</strong>
    </div>
    <div>
      <a href="/register/">🏠 首页</a> | <a href="/reading/">📚 阅读</a> | <a href="/rank/">🏆 排名</a>
    </div>
  </div>

  <h3>⌨️ 打字练习</h3>
  
  <div class="typing-box">
    <div class="text-display" id="textDisplay">
      点击"开始练习"加载题目...
    </div>
    
    <input 
      type="text" 
      class="input-area" 
      id="typingInput" 
      placeholder="在此处输入上面的文字..." 
      disabled
      autocomplete="off"
    >
    
    <div class="stats">
      <div class="stat-item">⏱️ 时间：<span id="timeDisplay">0</span>秒</div>
      <div class="stat-item">⚡ 速度：<span id="wpmDisplay">0</span> WPM</div>
      <div class="stat-item">🎯 准确率：<span id="accuracyDisplay">0</span>%</div>
    </div>
    
    <div>
      <button class="btn btn-primary" id="startBtn" onclick="startTyping()">开始练习</button>
      <button class="btn btn-success" id="submitBtn" onclick="submitResult()" disabled>提交成绩</button>
    </div>
  </div>
</div>

<script>
const user = JSON.parse(localStorage.getItem('typereading_user') || '{}');
if (!user.userId) {
  alert('请先登录');
  location.href = '/register/';
}
document.getElementById('userName').textContent = user.nickname || '未登录';

const texts = [
  "The quick brown fox jumps over the lazy dog.",
  "To be or not to be, that is the question.",
  "All work and no play makes Jack a dull boy.",
  "Practice makes perfect.",
  "Reading is to the mind what exercise is to the body."
];

let currentText = '';
let startTime = null;
let timerInterval = null;
let typedLength = 0;

function startTyping() {
  currentText = texts[Math.floor(Math.random() * texts.length)];
  document.getElementById('textDisplay').innerHTML = formatText(currentText, '');
  document.getElementById('typingInput').disabled = false;
  document.getElementById('typingInput').focus();
  document.getElementById('typingInput').value = '';
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('submitBtn').disabled = true;
  
  startTime = Date.now();
  typedLength = 0;
  
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    document.getElementById('timeDisplay').textContent = elapsed;
    
    // 计算 WPM
    const minutes = elapsed / 60;
    const wpm = minutes > 0 ? Math.round((typedLength / 5) / minutes) : 0;
    document.getElementById('wpmDisplay').textContent = wpm;
  }, 1000);
}

function formatText(original, typed) {
  let html = '';
  for (let i = 0; i < original.length; i++) {
    if (i < typed.length) {
      if (typed[i] === original[i]) {
        html += `<span class="correct">${original[i]}</span>`;
      } else {
        html += `<span class="wrong">${typed[i]}</span>`;
      }
    } else if (i === typed.length) {
      html += `<span class="cursor">${original[i]}</span>`;
    } else {
      html += original[i];
    }
  }
  return html;
}

document.getElementById('typingInput').addEventListener('input', function(e) {
  const typed = e.target.value;
  typedLength = typed.length;
  document.getElementById('textDisplay').innerHTML = formatText(currentText, typed);
  
  // 计算准确率
  let correct = 0;
  for (let i = 0; i < typed.length && i < currentText.length; i++) {
    if (typed[i] === currentText[i]) correct++;
  }
  const accuracy = typed.length > 0 ? Math.round((correct / typed.length) * 100) : 0;
  document.getElementById('accuracyDisplay').textContent = accuracy;
  
  // 完成检查
  if (typed.length >= currentText.length) {
    clearInterval(timerInterval);
    document.getElementById('typingInput').disabled = true;
    document.getElementById('submitBtn').disabled = false;
  }
});

async function submitResult() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = elapsed / 60;
  const wpm = minutes > 0 ? Math.round((currentText.length / 5) / minutes) : 0;
  
  let correct = 0;
  const typed = document.getElementById('typingInput').value;
  for (let i = 0; i < typed.length && i < currentText.length; i++) {
    if (typed[i] === currentText[i]) correct++;
  }
  const accuracy = Math.round((correct / currentText.length) * 100);
  
  try {
    const res = await fetch('/api/typing/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        wpm: wpm,
        accuracy: accuracy,
        courseName: 'default'
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert(`成绩提交成功！\n速度：${wpm} WPM\n准确率：${accuracy}%`);
      document.getElementById('submitBtn').disabled = true;
      document.getElementById('submitBtn').textContent = '已提交';
    }
  } catch (err) {
    alert('提交失败，请重试');
  }
}
</script>
