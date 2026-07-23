import { loadConfig, saveConfig } from '../config.js';
import { sendTelegram } from '../notify.js';

export function showSettings(){
  document.getElementById('cgv-sniper-settings')?.remove();
  const cfg = loadConfig();

  const wrap = document.createElement('div');
  wrap.id = 'cgv-sniper-settings';
  Object.assign(wrap.style, {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.7)', zIndex: 1000001,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: '-apple-system,sans-serif',
  });

  const box = document.createElement('div');
  Object.assign(box.style, {
    background: '#1a1a2e', border: '1px solid #333', borderRadius: '14px',
    padding: '20px', width: '320px', maxWidth: '90%', color: '#fff',
  });
  const title = document.createElement('h3');
  Object.assign(title.style, { margin: '0 0 12px', fontSize: '15px', color: '#e94560' });
  title.textContent = 'Telegram 알림 설정';
  box.appendChild(title);

  const mkInput = (ph, val) => {
    const i = document.createElement('input');
    i.placeholder = ph;
    i.value = val || '';
    Object.assign(i.style, {
      width: '100%', boxSizing: 'border-box', margin: '0 0 8px', padding: '10px',
      borderRadius: '8px', border: '1px solid #444', background: '#16213e',
      color: '#fff', fontSize: '13px',
    });
    return i;
  };
  const tokenIn = mkInput('Bot Token (예: 123456:ABC-DEF...)', cfg.telegramBotToken);
  const chatIn = mkInput('Chat ID (예: 123456789)', cfg.telegramChatId);
  box.appendChild(tokenIn);
  box.appendChild(chatIn);

  const result = document.createElement('div');
  Object.assign(result.style, { fontSize: '12px', minHeight: '16px', margin: '0 0 10px', color: '#888' });
  box.appendChild(result);

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px' });
  const mkBtn = (label, primary) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      flex: '1', padding: '10px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
      border: primary ? 'none' : '1px solid #444',
      background: primary ? '#e94560' : 'transparent',
      color: primary ? '#fff' : '#aaa',
    });
    return b;
  };
  const testBtn = mkBtn('테스트 전송', false);
  const saveBtn = mkBtn('저장', true);
  const closeBtn = mkBtn('닫기', false);

  const current = () => ({
    telegramBotToken: tokenIn.value.trim(),
    telegramChatId: chatIn.value.trim(),
  });

  testBtn.addEventListener('click', async () => {
    result.textContent = '전송 중...';
    const r = await sendTelegram('CGV 좌석 스나이퍼 테스트 메시지입니다.', current());
    result.textContent = r.skipped
      ? 'token/chat_id를 입력하세요.'
      : (r.ok ? '전송 성공! Telegram을 확인하세요.' : '전송 실패: ' + (r.error || 'API 오류'));
  });
  saveBtn.addEventListener('click', () => {
    saveConfig(current());
    result.textContent = '저장되었습니다.';
  });
  closeBtn.addEventListener('click', () => wrap.remove());

  row.appendChild(testBtn);
  row.appendChild(saveBtn);
  row.appendChild(closeBtn);
  box.appendChild(row);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
}
