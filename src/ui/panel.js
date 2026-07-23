export function createPanel(targets, people, { onStop, onSettings }){
  document.getElementById('cgv-sniper-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'cgv-sniper-panel';
  Object.assign(panel.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    padding: '12px 20px', borderRadius: '14px',
    background: 'rgba(26,26,46,0.95)', border: '1px solid #333',
    color: '#fff', fontSize: '13px', zIndex: 999998,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)', textAlign: 'center',
    maxWidth: '90%', backdropFilter: 'blur(8px)',
  });

  const tgt = document.createElement('div');
  Object.assign(tgt.style, { marginBottom: '6px', color: '#e94560', fontWeight: 'bold' });
  tgt.textContent = '[' + people + '명] ' + targets.join(', ');
  panel.appendChild(tgt);

  const st = document.createElement('div');
  st.style.marginBottom = '8px';
  st.textContent = '감시 준비 중...';
  panel.appendChild(st);

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center' });

  const stopBtn = document.createElement('button');
  stopBtn.textContent = '중지';
  Object.assign(stopBtn.style, {
    padding: '8px 24px', border: '1px solid #e94560', borderRadius: '8px',
    background: 'transparent', color: '#e94560', fontSize: '13px', cursor: 'pointer',
  });
  stopBtn.addEventListener('click', onStop);
  row.appendChild(stopBtn);

  const setBtn = document.createElement('button');
  setBtn.textContent = '⚙️ 알림설정';
  Object.assign(setBtn.style, {
    padding: '8px 14px', border: '1px solid #555', borderRadius: '8px',
    background: 'transparent', color: '#aaa', fontSize: '13px', cursor: 'pointer',
  });
  setBtn.addEventListener('click', onSettings);
  row.appendChild(setBtn);

  panel.appendChild(row);
  document.body.appendChild(panel);

  return {
    setStatus: t => { st.textContent = t; },
    remove: () => panel.remove(),
  };
}
