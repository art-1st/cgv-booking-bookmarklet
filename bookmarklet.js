javascript:void(function(){
  /* CGV 좌석 스나이퍼 Bookmarklet */
  if(!location.href.includes('selectVisitorCnt')){
    alert('CGV 좌석선택 페이지(selectVisitorCnt)에서 실행해주세요.');
    return;
  }

  if(window.__cgvSniper){ window.__cgvSniper.stop(); }

  const POLL_INTERVAL = 5000;
  const POLL_JITTER = 1000;
  const SEAT_UNIT = 38; /* 좌석 CSS 단위 크기 */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jitter = () => POLL_INTERVAL + Math.floor(Math.random() * POLL_JITTER * 2) - POLL_JITTER;

  /* ── 인원 선택 ── */
  async function selectOneAdult(){
    const wraps = document.querySelectorAll('[class*=NumberWrap]');
    if(!wraps.length) throw new Error('인원 선택 영역을 찾을 수 없습니다.');
    const normalWrap = [...wraps].find(w => {
      const l = w.querySelector('[class*=label]');
      return l && l.textContent.trim() === '일반';
    }) || wraps[0];
    const btn1 = [...normalWrap.querySelectorAll('[class*=btn-num]')]
      .find(b => b.textContent.trim() === '1');
    if(!btn1) throw new Error('일반 1명 버튼을 찾을 수 없습니다.');
    if(btn1.getAttribute('aria-pressed') === 'true') return;
    btn1.click();
    await sleep(600);
  }

  /* ── 전체화면 좌석맵 열기/닫기 ── */
  async function openSeatMap(){
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.trim() === '선택' && b.closest('[class*=seatSelectWrap]'));
    if(!btn) throw new Error('[선택] 버튼을 찾을 수 없습니다.');
    btn.click();
    for(let i = 0; i < 30; i++){
      await sleep(200);
      const a = document.querySelector('[class*=seatChoiceArea]');
      if(a && a.querySelectorAll('button[class*=seatNumber]').length > 0) return;
    }
    throw new Error('좌석맵이 열리지 않았습니다.');
  }

  /* ── 좌석 데이터 수집 ── */
  function collectSeats(){
    const area = document.querySelector('[class*=seatChoiceArea]');
    if(!area) return [];
    /* 메인맵(react-transform-component) 내의 좌석만 수집 (미니맵 제외) */
    const mainMap = area.querySelector('.react-transform-component [class*=seatPositionWrap]')
      || area.querySelector('[class*=seatPositionWrap]');
    if(!mainMap) return [];
    return [...mainMap.querySelectorAll('button[class*=seatNumber]')]
      .filter(el => !el.className.includes('zone') && !el.className.includes('Zone'))
      .map(el => ({
        text: el.textContent.trim(),
        col: Math.round((parseFloat(el.style.left) || 0) / SEAT_UNIT),
        row: Math.round((parseFloat(el.style.top) || 0) / SEAT_UNIT),
        sold: el.className.includes('Disabled') || el.className.includes('disabled'),
      }));
  }

  /* ── 커스텀 좌석 선택 UI (실제 배치도 반영) ── */
  function createUI(seats){
    return new Promise(resolve => {
      document.getElementById('cgv-sniper-overlay')?.remove();
      if(!seats.length){ alert('좌석을 찾을 수 없습니다.'); resolve(null); return; }

      const selected = [];
      const maxCol = Math.max(...seats.map(s => s.col));
      const maxRow = Math.max(...seats.map(s => s.row));

      /* 오버레이 */
      const ov = document.createElement('div');
      ov.id = 'cgv-sniper-overlay';
      Object.assign(ov.style, {
        position:'fixed', top:0, left:0, width:'100%', height:'100%',
        background:'rgba(0,0,0,0.85)', zIndex:999999,
        display:'flex', flexDirection:'column', alignItems:'center',
        fontFamily:'-apple-system,sans-serif', color:'#fff',
        overflow:'hidden'
      });

      /* 헤더 */
      const hdr = document.createElement('div');
      Object.assign(hdr.style, {
        textAlign:'center', padding:'16px 16px 8px', flexShrink:'0', width:'100%'
      });
      hdr.innerHTML = '<h2 style="margin:0 0 4px;font-size:17px;color:#e94560">좌석 스나이퍼</h2>'
        + '<p style="margin:0;font-size:12px;color:#888">잡고 싶은 좌석을 우선순위 순으로 터치하세요</p>';
      ov.appendChild(hdr);

      /* 선택 현황 */
      const status = document.createElement('div');
      Object.assign(status.style, {
        padding:'6px 16px', margin:'0 16px 8px', background:'#16213e',
        borderRadius:'8px', fontSize:'13px', color:'#e94560',
        textAlign:'center', minHeight:'18px', wordBreak:'break-all',
        flexShrink:'0'
      });
      status.textContent = '선택된 좌석 없음';
      ov.appendChild(status);

      /* 좌석 배치도 영역 (스크롤 가능) */
      const mapWrap = document.createElement('div');
      Object.assign(mapWrap.style, {
        flex:'1', overflow:'auto', padding:'8px',
        WebkitOverflowScrolling:'touch', width:'100%'
      });

      /* screen 표시 */
      const screen = document.createElement('div');
      Object.assign(screen.style, {
        textAlign:'center', color:'#555', fontSize:'11px',
        marginBottom:'8px', letterSpacing:'4px'
      });
      screen.textContent = 'SCREEN';
      mapWrap.appendChild(screen);

      /* 좌석 그리드 컨테이너 - CSS Grid 사용 */
      const CHIP = 30; /* 각 좌석 칩 크기 (px) */
      const GAP = 2;
      const LABEL_W = 24; /* 행 라벨 열 너비 */

      /* 행별 라벨 매핑 */
      const rowLabelMap = {};
      seats.forEach(s => {
        const r = s.text.replace(/[0-9]/g, '');
        rowLabelMap[s.row] = r;
      });

      /* gridTemplateColumns: 라벨열 + 좌석열들 */
      const grid = document.createElement('div');
      Object.assign(grid.style, {
        display:'grid',
        gridTemplateColumns: LABEL_W + 'px repeat(' + (maxCol + 1) + ', ' + CHIP + 'px) ' + LABEL_W + 'px',
        gridTemplateRows: 'repeat(' + (maxRow + 1) + ', ' + CHIP + 'px)',
        gap: GAP + 'px',
        width: 'fit-content',
        margin: '0 auto'
      });

      /* 행 라벨 (좌우 양쪽) */
      Object.entries(rowLabelMap).forEach(([row, label]) => {
        [1, maxCol + 3].forEach(col => {
          const lbl = document.createElement('div');
          lbl.textContent = label;
          Object.assign(lbl.style, {
            gridColumn: col, gridRow: parseInt(row) + 1,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'11px', color:'#666', fontWeight:'bold'
          });
          grid.appendChild(lbl);
        });
      });

      /* 좌석 칩 렌더링 */
      const chipMap = {};
      seats.forEach(s => {
        const chip = document.createElement('button');
        chip.textContent = s.text;
        chip.dataset.seat = s.text;

        Object.assign(chip.style, {
          gridColumn: s.col + 2, /* +2: 라벨열 1칸 오프셋 */
          gridRow: s.row + 1,
          width: CHIP + 'px', height: CHIP + 'px',
          border: 'none', borderRadius: '4px',
          fontSize: '8px', cursor: 'pointer', padding: '0',
          lineHeight: CHIP + 'px', textAlign: 'center',
          transition: 'background 0.1s',
          background: s.sold ? '#4a1a1a' : '#1a3a5c',
          color: s.sold ? '#ff6b6b' : '#7bb8e0',
        });

        chip.addEventListener('click', () => {
          const idx = selected.findIndex(x => x === s.text);
          if(idx >= 0){
            selected.splice(idx, 1);
            chip.style.background = s.sold ? '#4a1a1a' : '#1a3a5c';
            chip.style.color = s.sold ? '#ff6b6b' : '#7bb8e0';
            chip.textContent = s.text;
            /* 나머지 선택된 좌석들의 순번 갱신 */
            selected.forEach((t, i) => {
              const c = chipMap[t];
              if(c) c.textContent = '[' + (i + 1) + ']';
            });
          } else {
            selected.push(s.text);
            chip.style.background = '#e94560';
            chip.style.color = '#fff';
            chip.textContent = '[' + selected.length + ']';
          }
          status.textContent = selected.length
            ? selected.map((t, i) => (i + 1) + '.' + t).join('  ')
            : '선택된 좌석 없음';
          confirmBtn.disabled = !selected.length;
          confirmBtn.style.opacity = selected.length ? '1' : '0.4';
        });

        chipMap[s.text] = chip;
        grid.appendChild(chip);
      });

      mapWrap.appendChild(grid);
      ov.appendChild(mapWrap);

      /* 범례 */
      const legend = document.createElement('div');
      Object.assign(legend.style, {
        display:'flex', gap:'16px', justifyContent:'center',
        padding:'8px', fontSize:'11px', color:'#888', flexShrink:'0'
      });
      legend.innerHTML =
        '<span><span style="display:inline-block;width:10px;height:10px;background:#4a1a1a;border-radius:2px;vertical-align:middle;margin-right:3px"></span>매진</span>'
        + '<span><span style="display:inline-block;width:10px;height:10px;background:#1a3a5c;border-radius:2px;vertical-align:middle;margin-right:3px"></span>선택가능</span>'
        + '<span><span style="display:inline-block;width:10px;height:10px;background:#e94560;border-radius:2px;vertical-align:middle;margin-right:3px"></span>내 후보</span>';
      ov.appendChild(legend);

      /* 하단 버튼 */
      const bw = document.createElement('div');
      Object.assign(bw.style, {
        display:'flex', gap:'10px', padding:'12px 16px 20px',
        width:'100%', maxWidth:'460px', flexShrink:'0'
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '취소';
      Object.assign(cancelBtn.style, {
        flex:'1', padding:'14px', border:'1px solid #444', borderRadius:'10px',
        background:'transparent', color:'#aaa', fontSize:'15px', cursor:'pointer'
      });
      cancelBtn.addEventListener('click', () => { ov.remove(); resolve(null); });

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '감시 시작';
      confirmBtn.disabled = true;
      Object.assign(confirmBtn.style, {
        flex:'2', padding:'14px', border:'none', borderRadius:'10px',
        background:'#e94560', color:'#fff', fontSize:'15px', fontWeight:'bold',
        cursor:'pointer', opacity:'0.4', transition:'opacity 0.15s'
      });
      confirmBtn.addEventListener('click', () => {
        ov.remove();
        resolve([...selected]);
      });

      bw.appendChild(cancelBtn);
      bw.appendChild(confirmBtn);
      ov.appendChild(bw);

      document.body.appendChild(ov);
    });
  }

  /* ── 감시 패널 ── */
  function createMonitorPanel(targets, onStop){
    document.getElementById('cgv-sniper-panel')?.remove();
    const panel = document.createElement('div');
    panel.id = 'cgv-sniper-panel';
    Object.assign(panel.style, {
      position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
      padding:'12px 20px', borderRadius:'14px',
      background:'rgba(26,26,46,0.95)', border:'1px solid #333',
      color:'#fff', fontSize:'13px', zIndex:999998,
      boxShadow:'0 4px 20px rgba(0,0,0,0.5)', textAlign:'center',
      maxWidth:'90%', backdropFilter:'blur(8px)'
    });

    const tgt = document.createElement('div');
    tgt.style.marginBottom = '6px';
    tgt.style.color = '#e94560';
    tgt.style.fontWeight = 'bold';
    tgt.textContent = targets.join(', ');
    panel.appendChild(tgt);

    const st = document.createElement('div');
    st.id = 'cgv-sniper-status';
    st.style.marginBottom = '8px';
    st.textContent = '감시 준비 중...';
    panel.appendChild(st);

    const btn = document.createElement('button');
    btn.textContent = '중지';
    Object.assign(btn.style, {
      padding:'8px 24px', border:'1px solid #e94560', borderRadius:'8px',
      background:'transparent', color:'#e94560', fontSize:'13px', cursor:'pointer'
    });
    btn.addEventListener('click', onStop);
    panel.appendChild(btn);

    document.body.appendChild(panel);
    return st;
  }

  /* ── 감시 루프 (전체화면 유지 방식) ── */
  async function startMonitoring(targets){
    let running = true;
    let count = 0;
    const stopFn = () => {
      running = false;
      document.getElementById('cgv-sniper-panel')?.remove();
      showNoti('감시가 중지되었습니다.', '#f39c12');
    };
    window.__cgvSniper = { stop: stopFn };
    const st = createMonitorPanel(targets, stopFn);

    while(running){
      count++;
      st.textContent = '감시 중... (' + count + '회 새로고침)';

      /* 1. 새로고침 (인원 선택이 초기화될 수 있음) */
      const refreshBtn = document.querySelector('button[title="새로고침"]');
      if(!refreshBtn){ st.textContent = '새로고침 버튼 없음'; break; }
      refreshBtn.click();
      await sleep(1500);

      /* 2. 인원 재선택 (1인 갭 정책이 좌석맵에 반영되도록) */
      await selectOneAdult();
      await sleep(500);

      /* 3. 갭 정책 반영 후 좌석 확인 */
      const mainMap = document.querySelector('.react-transform-component [class*=seatPositionWrap]');
      if(!mainMap){ st.textContent = '좌석맵 없음'; break; }

      let found = null;
      for(const t of targets){
        const s = [...mainMap.querySelectorAll('button[class*=seatNumber]')]
          .find(el => el.textContent.trim() === t
            && !el.className.includes('Disabled')
            && !el.className.includes('disabled'));
        if(s){ found = t; break; }
      }

      if(found){
        st.textContent = found + ' 발견! 점유 시도...';
        if(await tryClaim(found)){
          document.getElementById('cgv-sniper-panel')?.remove();
          running = false; break;
        }
        st.textContent = found + ' 점유 실패, 계속 감시...';
      }

      await sleep(jitter());
    }
    window.__cgvSniper = null;
  }

  /* ── 좌석 점유 (전체화면 내에서 바로 클릭) ── */
  async function tryClaim(seatText){
    try {
      /* 인원 선택 보장 */
      await selectOneAdult();
      await sleep(300);

      const mainMap = document.querySelector('.react-transform-component [class*=seatPositionWrap]');
      if(!mainMap) return false;

      const seatBtn = [...mainMap.querySelectorAll('button[class*=seatNumber]')]
        .find(el => el.textContent.trim() === seatText
          && !el.className.includes('Disabled')
          && !el.className.includes('disabled'));
      if(!seatBtn) return false;

      seatBtn.click();

      /* 선택완료 버튼이 활성화될 때까지 대기 (active 클래스 대신) */
      let done = null;
      for(let i = 0; i < 10; i++){
        await sleep(200);
        done = [...document.querySelectorAll('button')]
          .find(b => b.textContent.trim() === '선택완료' && !b.disabled);
        if(done) break;
      }
      if(!done) return false;

      done.click();

      /* 결제 화면 전환 확인 (결제하기 버튼 출현) */
      for(let i = 0; i < 15; i++){
        await sleep(200);
        const payBtn = [...document.querySelectorAll('button')]
          .find(b => b.textContent.includes('결제'));
        if(payBtn){
          notifyUser(seatText);
          return true;
        }
      }

      /* 전환되지 않았으면 실패 */
      return false;
    } catch(e){ return false; }
  }

  /* ── 알림 ── */
  function notifyUser(text){
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.2, 0.4].forEach(d => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; g.gain.value = 0.3;
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.15);
      });
    } catch(e){}
    try { navigator.vibrate([300, 100, 300, 100, 300]); } catch(e){}
    showNoti('좌석 ' + text + ' 점유 성공!\n결제를 진행하세요!', '#27ae60');
  }

  function showNoti(msg, bg){
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
      padding:'32px 40px', borderRadius:'20px', background:bg,
      color:'#fff', fontSize:'22px', fontWeight:'bold', zIndex:1000000,
      boxShadow:'0 8px 40px rgba(0,0,0,0.5)', textAlign:'center',
      maxWidth:'85%', lineHeight:'1.5', whiteSpace:'pre-line'
    });
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 10000);
  }

  /* ── 실행 ── */
  (async () => {
    try {
      await selectOneAdult();
      await openSeatMap();
      const seats = collectSeats();
      const targets = await createUI(seats);
      if(!targets || !targets.length) return;
      /* 전체화면 유지한 채 감시 시작 */
      await startMonitoring(targets);
    } catch(e){ alert('오류: ' + e.message); }
  })();
})();
