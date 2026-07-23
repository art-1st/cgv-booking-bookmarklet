import { sleep } from '../dom.js';
import { collectSeats } from '../seatmap.js';
import { selectAdults } from '../visitors.js';

const CHIP = 30;   /* 좌석 칩 크기(px) */
const GAP = 2;
const LABEL_W = 24; /* 행 라벨 열 너비(px) */
const DRAG_THRESHOLD = 6; /* 이 거리(px) 미만의 Shift+드래그는 Shift+클릭으로 처리 */

export function showPicker(initialSeats, initialPeople){
  return new Promise(resolve => {
    document.getElementById('cgv-sniper-overlay')?.remove();

    let seats = initialSeats;
    let people = initialPeople || 1;
    let selected = [];
    let anchor = null;   /* 마지막으로 클릭한 좌석 label — Shift+클릭 사각형의 기준점 */
    let chipMap = {};    /* label -> chip 엘리먼트 (renderGrid에서 갱신) */

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
      + '<p style="margin:0;font-size:12px;color:#888">잡고 싶은 좌석을 우선순위 순으로 터치 · Shift+클릭/드래그로 범위 선택</p>';
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
      textAlign: 'center', minHeight: '18px', flexShrink: '0',
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

    /* ── 선택 상태 헬퍼 ── */
    function seatByLabel(label){ return seats.find(s => s.label === label); }

    /* selected 기준으로 모든 chip의 색/번호를 다시 칠한다 (범위 선택 후 일괄 갱신). */
    function repaintChips(){
      seats.forEach(s => {
        const chip = chipMap[s.label];
        if (!chip) return;
        const idx = selected.indexOf(s.label);
        if (idx >= 0){
          chip.style.background = '#e94560';
          chip.style.color = '#fff';
          chip.textContent = '[' + (idx + 1) + ']';
        } else {
          chip.style.background = s.sold ? '#4a1a1a' : '#1a3a5c';
          chip.style.color = s.sold ? '#ff6b6b' : '#7bb8e0';
          chip.textContent = s.label;
        }
      });
    }

    function toggleSeat(label){
      const idx = selected.indexOf(label);
      if (idx >= 0) selected.splice(idx, 1);
      else selected.push(label);
    }

    /* 두 좌석이 이루는 격자 사각형 내의 실제 좌석을 우선순위 순(행→열)으로 누적 선택.
       같은 행이면 행 범위, 같은 열이면 열 범위, 그 외엔 직사각형. */
    function addRectByLabels(aLabel, bLabel){
      const a = seatByLabel(aLabel), b = seatByLabel(bLabel);
      if (!a || !b) return;
      addRect(a.row, a.col, b.row, b.col);
    }

    function addRect(rowA, colA, rowB, colB){
      const r1 = Math.min(rowA, rowB), r2 = Math.max(rowA, rowB);
      const c1 = Math.min(colA, colB), c2 = Math.max(colA, colB);
      seats
        .filter(s => s.row >= r1 && s.row <= r2 && s.col >= c1 && s.col <= c2)
        .sort((x, y) => x.row - y.row || x.col - y.col)
        .forEach(s => { if (!selected.includes(s.label)) selected.push(s.label); });
    }

    /* 화면 사각형(rect)과 겹치는 좌석을 우선순위 순으로 누적 선택 (Shift+드래그 러버밴드). */
    function addByScreenRect(rect){
      seats
        .map(s => ({ s, chip: chipMap[s.label] }))
        .filter(({ chip }) => {
          if (!chip) return false;
          const c = chip.getBoundingClientRect();
          return c.left < rect.right && c.right > rect.left && c.top < rect.bottom && c.bottom > rect.top;
        })
        .map(({ s }) => s)
        .sort((x, y) => x.row - y.row || x.col - y.col)
        .forEach(s => { if (!selected.includes(s.label)) selected.push(s.label); });
    }

    function updateStatus(){
      status.textContent = selected.length
        ? selected.length + '석 선택됨'
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
      chipMap = {};
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

      seats.forEach(s => {
        const chip = document.createElement('button');
        Object.assign(chip.style, {
          gridColumn: s.col + 2, /* +2: 라벨열 1칸 오프셋 */
          gridRow: s.row + 1,
          width: CHIP + 'px', height: CHIP + 'px',
          border: 'none', borderRadius: '4px', fontSize: '8px', cursor: 'pointer',
          padding: '0', lineHeight: CHIP + 'px', textAlign: 'center',
          transition: 'background 0.1s',
        });
        chip.addEventListener('click', e => {
          if (e.shiftKey && anchor && anchor !== s.label){
            addRectByLabels(anchor, s.label); /* Shift+클릭: anchor→현재 사각형 */
          } else {
            toggleSeat(s.label);
          }
          anchor = s.label;
          repaintChips();
          updateStatus();
        });
        chipMap[s.label] = chip;
        grid.appendChild(chip);
      });

      /* Shift+드래그 러버밴드 선택 (데스크톱). 일반 드래그는 스크롤로 남겨둔다. */
      grid.addEventListener('mousedown', e => {
        if (!e.shiftKey) return;
        e.preventDefault(); /* 텍스트 선택/스크롤 방지 */
        const x0 = e.clientX, y0 = e.clientY;
        const boxEl = document.createElement('div');
        Object.assign(boxEl.style, {
          position: 'fixed', border: '1px solid #e94560',
          background: 'rgba(233,69,96,0.2)', zIndex: 1000000, pointerEvents: 'none',
          left: x0 + 'px', top: y0 + 'px', width: '0px', height: '0px',
        });
        document.body.appendChild(boxEl);
        let moved = 0;
        const onMove = ev => {
          const x1 = ev.clientX, y1 = ev.clientY;
          moved = Math.max(moved, Math.abs(x1 - x0) + Math.abs(y1 - y0));
          Object.assign(boxEl.style, {
            left: Math.min(x0, x1) + 'px', top: Math.min(y0, y1) + 'px',
            width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px',
          });
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const rect = boxEl.getBoundingClientRect();
          boxEl.remove();
          if (moved >= DRAG_THRESHOLD){ /* 실제 드래그일 때만 러버밴드 적용 */
            addByScreenRect(rect);
            repaintChips();
            updateStatus();
          }
          /* 이동이 거의 없으면 chip의 click(Shift+클릭)이 처리하도록 둔다 */
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      mapWrap.appendChild(grid);
      repaintChips();
    }

    async function setPeople(n){
      if (n === people){ updateStatus(); return; }
      people = n;
      selected = [];
      anchor = null;
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
