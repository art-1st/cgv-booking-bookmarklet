import { SEL, SEAT_UNIT, sleep, seatLabel } from './dom.js';

export function getMainMap(){
  const area = document.querySelector(SEL.seatChoiceArea);
  if (!area) return null;
  return area.querySelector(SEL.mainMap) || area.querySelector(SEL.anyMap);
}

export function seatButtons(){
  const map = getMainMap();
  if (!map) return [];
  return [...map.querySelectorAll(SEL.seatBtn)]
    .filter(el => !/zone/i.test(el.className));
}

/* 가용 판정은 el.disabled 사용 (클래스 문자열 검사보다 견고 — 스펙 실험 7번) */
export function collectSeats(){
  return seatButtons().map(el => ({
    label: seatLabel(el),
    col: Math.round((parseFloat(el.style.left) || 0) / SEAT_UNIT),
    row: Math.round((parseFloat(el.style.top) || 0) / SEAT_UNIT),
    sold: el.disabled,
  }));
}

export async function openSeatMap(){
  const btn = [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === '선택' && b.closest(SEL.seatSelectWrap));
  if (!btn) throw new Error('[선택] 버튼을 찾을 수 없습니다.');
  btn.click();
  for (let i = 0; i < 30; i++){
    await sleep(200);
    if (seatButtons().length > 0) return;
  }
  throw new Error('좌석맵이 열리지 않았습니다.');
}

export function findSeatButton(label){
  return seatButtons().find(el => seatLabel(el) === label) || null;
}

/* targets 우선순위 순서를 유지한 채 현재 선택 가능(enabled)한 것만 반환 */
export function enabledCandidates(targets){
  return targets.filter(t => {
    const el = findSeatButton(t);
    return el && !el.disabled;
  });
}

export function activeSeats(){
  return seatButtons().filter(el =>
    el.className.split(/\s+/).some(c => c.startsWith('seatMap_active')));
}
