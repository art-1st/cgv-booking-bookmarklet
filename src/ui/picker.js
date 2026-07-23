import { sleep } from '../dom.js';
import { collectSeats } from '../seatmap.js';
import { selectAdults } from '../visitors.js';

const CHIP = 30;   /* 좌석 칩 크기(px) */
const GAP = 2;
const LABEL_W = 24; /* 행 라벨 열 너비(px) */

export function showPicker(initialSeats, initialPeople){
  return new Promise(resolve => {
    document.getElementById('cgv-sniper-overlay')?.remove();

    let seats = initialSeats;
    let people = initialPeople || 1;
    let selected = [];

    const ov = document.createElement('div');
    ov.id = 'cgv-sniper-overlay';
    Object.assign(ov.style, {
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.85)', zIndex: 999999,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: '-apple-system,sans-serif', color: '#fff', overflow: 'hidden',
    });

    const hdr = document.createElement('div');
    Object.assign(hdr.style, { textAlign: 'center', padding: '16px 16px 4px', flexShrink: '0', width: '100%' });
    hdr.innerHTML = '<h2 style="margin:0 0 4px;font-size:17px;color:#e94560">좌석 스나이퍼</h2>'
      + '<p style="margin:0;font-size:12px;color:#888">잡고 싶은 좌석을 우선순위 순으로 터치하세요</p>';
    ov.appendChild(hdr);

    /* 인원 토글 */
    const peopleWrap = document.createElement('div');
    Object.assign(peopleWrap.style, { display: 'flex', gap: '8px', justifyContent: 'center', padding: '4px 0 8px', flexShrink: '0' });
    const peopleBtns = [1, 2].map(n => {
      const b = document.createElement('button');
      b.textContent = n + '명';
      Object.assign(b.style, {
        padding: '6px 18px', borderRadius: '16px', border: '1px solid #e94560',
        background: 'transparent', color: '#e94560', fontSize: '13px', cursor: 'pointer',
      });
      b.addEventListener('click', () => setPeople(n));
      peopleWrap.appendChild(b);
      return b;
    });
    ov.appendChild(peopleWrap);

    const status = document.createElement('div');
    Object.assign(status.style, {
      padding: '6px 16px', margin: '0 16px 8px', background: '#16213e',
      borderRadius: '8px', fontSize: '13px', color: '#e94560',
      textAlign: 'center', minHeight: '18px', wordBreak: 'break-all', flexShrink: '0',
    });
    ov.appendChild(status);

    const mapWrap = document.createElement('div');
    Object.assign(mapWrap.style, {
      flex: '1', overflow: 'auto', padding: '8px',
      WebkitOverflowScrolling: 'touch', width: '100%',
    });
    ov.appendChild(mapWrap);

    const legend = document.createElement('div');
    Object.assign(legend.style, { display: 'flex', gap: '16px', justifyContent: 'center', padding: '8px', fontSize: '11px', color: '#888', flexShrink: '0' });
    legend.innerHTML =
      '<span><span style="display:inline-block;width:10px;height:10px;background:#4a1a1a;border-radius:2px;vertical-align:middle;margin-right:3px"></span>선택불가(매진 포함)</span>'
      + '<span><span style="display:inline-block;width:10px;height:10px;background:#1a3a5c;border-radius:2px;vertical-align:middle;margin-right:3px"></span>선택가능</span>'
      + '<span><span style="display:inline-block;width:10px;height:10px;background:#e94560;border-radius:2px;vertical-align:middle;margin-right:3px"></span>내 후보</span>';
    ov.appendChild(legend);

    const bw = document.createElement('div');
    Object.assign(bw.style, { display: 'flex', gap: '10px', padding: '12px 16px 20px', width: '100%', maxWidth: '460px', flexShrink: '0' });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    Object.assign(cancelBtn.style, {
      flex: '1', padding: '14px', border: '1px solid #444', borderRadius: '10px',
      background: 'transparent', color: '#aaa', fontSize: '15px', cursor: 'pointer',
    });
    cancelBtn.addEventListener('click', () => { ov.remove(); resolve(null); });
    const confirmBtn = document.createElement('button');
    Object.assign(confirmBtn.style, {
      flex: '2', padding: '14px', border: 'none', borderRadius: '10px',
      background: '#e94560', color: '#fff', fontSize: '15px', fontWeight: 'bold',
      cursor: 'pointer', transition: 'opacity 0.15s',
    });
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      ov.remove();
      resolve({ targets: [...selected], people });
    });
    bw.appendChild(cancelBtn);
    bw.appendChild(confirmBtn);
    ov.appendChild(bw);

    function updateStatus(){
      status.textContent = selected.length
        ? selected.map((t, i) => (i + 1) + '.' + t).join('  ')
        : (people === 2
          ? '후보를 2개 이상 선택하세요 (빈 2석 확보 시 점유, 인접 보장 없음)'
          : '선택된 좌석 없음');
      const ok = selected.length >= people;
      confirmBtn.disabled = !ok;
      confirmBtn.style.opacity = ok ? '1' : '0.4';
      confirmBtn.textContent = '감시 시작 (' + people + '명)';
      peopleBtns.forEach((b, i) => {
        const on = (i + 1) === people;
        b.style.background = on ? '#e94560' : 'transparent';
        b.style.color = on ? '#fff' : '#e94560';
      });
    }

    function renderGrid(){
      mapWrap.textContent = '';
      const screen = document.createElement('div');
      Object.assign(screen.style, { textAlign: 'center', color: '#555', fontSize: '11px', marginBottom: '8px', letterSpacing: '4px' });
      screen.textContent = 'SCREEN';
      mapWrap.appendChild(screen);

      if (!seats.length){
        const empty = document.createElement('p');
        empty.textContent = '좌석을 찾을 수 없습니다.';
        empty.style.textAlign = 'center';
        mapWrap.appendChild(empty);
        return;
      }

      const maxCol = Math.max(...seats.map(s => s.col));
      const maxRow = Math.max(...seats.map(s => s.row));
      const rowLabelMap = {};
      seats.forEach(s => { rowLabelMap[s.row] = s.label.replace(/[0-9]/g, ''); });

      const grid = document.createElement('div');
      Object.assign(grid.style, {
        display: 'grid',
        gridTemplateColumns: LABEL_W + 'px repeat(' + (maxCol + 1) + ', ' + CHIP + 'px) ' + LABEL_W + 'px',
        gridTemplateRows: 'repeat(' + (maxRow + 1) + ', ' + CHIP + 'px)',
        gap: GAP + 'px', width: 'fit-content', margin: '0 auto',
      });

      Object.entries(rowLabelMap).forEach(([row, label]) => {
        [1, maxCol + 3].forEach(col => {
          const lbl = document.createElement('div');
          lbl.textContent = label;
          Object.assign(lbl.style, {
            gridColumn: col, gridRow: parseInt(row, 10) + 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', color: '#666', fontWeight: 'bold',
          });
          grid.appendChild(lbl);
        });
      });

      const chipMap = {};
      seats.forEach(s => {
        const chip = document.createElement('button');
        const paintBase = () => {
          chip.style.background = s.sold ? '#4a1a1a' : '#1a3a5c';
          chip.style.color = s.sold ? '#ff6b6b' : '#7bb8e0';
          chip.textContent = s.label;
        };
        Object.assign(chip.style, {
          gridColumn: s.col + 2, /* +2: 라벨열 1칸 오프셋 */
          gridRow: s.row + 1,
          width: CHIP + 'px', height: CHIP + 'px',
          border: 'none', borderRadius: '4px', fontSize: '8px', cursor: 'pointer',
          padding: '0', lineHeight: CHIP + 'px', textAlign: 'center',
          transition: 'background 0.1s',
        });
        paintBase();
        chip.addEventListener('click', () => {
          const idx = selected.indexOf(s.label);
          if (idx >= 0){
            selected.splice(idx, 1);
            paintBase();
            selected.forEach((t, i) => {
              const c = chipMap[t];
              if (c) c.textContent = '[' + (i + 1) + ']';
            });
          } else {
            selected.push(s.label);
            chip.style.background = '#e94560';
            chip.style.color = '#fff';
            chip.textContent = '[' + selected.length + ']';
          }
          updateStatus();
        });
        chipMap[s.label] = chip;
        grid.appendChild(chip);
      });
      mapWrap.appendChild(grid);
    }

    async function setPeople(n){
      if (n === people){ updateStatus(); return; }
      people = n;
      selected = [];
      status.textContent = '인원 변경 중...';
      let err = null;
      try {
        await selectAdults(n);       /* 전체화면 뒤에서도 클릭 가능 (v1 검증) */
        await sleep(800);            /* 좌석맵 disabled 재계산 대기 */
        seats = collectSeats();
      } catch (e) {
        err = e;
      }
      renderGrid();
      updateStatus();
      if (err) status.textContent = '인원 변경 실패: ' + err.message;
    }

    renderGrid();
    updateStatus();
    document.body.appendChild(ov);
  });
}
