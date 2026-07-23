import { loadConfig } from './config.js';

export function beep(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.2, 0.4].forEach(d => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.3;
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.15);
    });
  } catch (e) {}
}

export function vibrate(){
  try { navigator.vibrate([300, 100, 300, 100, 300]); } catch (e) {}
}

export function showNoti(msg, bg){
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    padding: '32px 40px', borderRadius: '20px', background: bg,
    color: '#fff', fontSize: '22px', fontWeight: 'bold', zIndex: 1000000,
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)', textAlign: 'center',
    maxWidth: '85%', lineHeight: '1.5', whiteSpace: 'pre-line',
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 10000);
}

/* 예매 컨텍스트 요약 (best-effort): 영화 제목 헤딩 추출, 못 찾으면 '' */
export function getShowInfo(){
  const h = [...document.querySelectorAll('h1,h2,h3')]
    .map(e => e.textContent.trim())
    .find(t => t && t.length < 60 && !/CGV|CJ|QR|관람인원|screen|범례|확인해/i.test(t));
  return h || '';
}

export async function sendTelegram(text, cfg = loadConfig(), fetchFn = globalThis.fetch){
  const token = cfg.telegramBotToken;
  const chat = cfg.telegramChatId;
  if (!token || !chat) return { skipped: true };
  try {
    const res = await fetchFn('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function notifySuccess(seats){
  beep();
  vibrate();
  showNoti('좌석 ' + seats.join(', ') + ' 점유 성공!\n결제를 진행하세요!', '#27ae60');
  await sendTelegram(['🎬 CGV 좌석 점유 성공!', getShowInfo(),
    '좌석: ' + seats.join(', '), new Date().toLocaleString('ko-KR')]
    .filter(Boolean).join('\n'));
}

export async function notifyAbort(reason){
  showNoti('감시 중단: ' + reason, '#f39c12');
  await sendTelegram('⚠️ CGV 좌석 감시 중단: ' + reason);
}
