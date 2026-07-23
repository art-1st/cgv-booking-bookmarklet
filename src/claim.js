import { sleep, seatLabel } from './dom.js';
import { findSeatButton, activeSeats } from './seatmap.js';
import { selectAdults } from './visitors.js';

function findEnabledButtonByText(text){
  return [...document.querySelectorAll('button')]
    .find(b => b.textContent.trim() === text && !b.disabled) || null;
}

/* active 좌석 전부 해제. 한 클릭이 쌍 전체를 해제할 수 있으므로 반복 확인. */
export async function deselectAll(){
  for (let i = 0; i < 6 && activeSeats().length; i++){
    activeSeats()[0].click();
    await sleep(200);
  }
}

/* actives가 정확히 targets가 되도록 한 클릭씩 조정. */
export async function adjustSelection(targets){
  for (let i = 0; i < 8; i++){
    const labels = activeSeats().map(seatLabel);
    const extra = labels.find(l => !targets.includes(l));
    const missing = targets.find(t => !labels.includes(t));
    if (!extra && !missing) return true;
    const label = extra || missing;
    const el = findSeatButton(label);
    if (!el) return false;
    if (label === missing && el.disabled) return false; /* 다른 사용자에게 뺏김 */
    el.click();
    await sleep(300);
  }
  return false;
}

/* picks: 이번에 점유 시도할 좌석(우선순위 상위 people개).
   candidates: 전체 후보 — 자동 쌍 결과가 후보 내 조합이면 그대로 인정.
   성공 시 실제 점유한 좌석 라벨 배열, 실패 시 null (선택 상태 클린업 보장). */
export async function tryClaim(picks, people, candidates = picks){
  /* 확보된 people석 중 최소 1석이 후보면 인정 — CGV 2인 모드는 좌석 클릭 시
     빈 인접석을 자동으로 함께 선택하므로(실측), 딸려온 인접석이 후보 밖이어도
     받아들인다. length === people 조건으로 정확히 인원수만큼만 확보됐음을 보장. */
  const selectionOk = () => {
    const labels = activeSeats().map(seatLabel);
    return labels.length === people && labels.some(l => candidates.includes(l));
  };
  try {
    await selectAdults(people);
    await sleep(300);

    for (const t of picks){
      if (selectionOk()) break; /* 자동 쌍으로 이미 완성됨 */
      const el = findSeatButton(t);
      if (!el || el.disabled){ await deselectAll(); return null; }
      el.click();
      await sleep(300);
    }

    if (!selectionOk() && !(await adjustSelection(picks))){
      await deselectAll();
      return null;
    }

    let done = null;
    for (let i = 0; i < 10; i++){
      await sleep(200);
      done = findEnabledButtonByText('선택완료');
      if (done) break;
    }
    if (!done){ await deselectAll(); return null; }

    const claimed = activeSeats().map(seatLabel); /* 화면 전환 전에 캡처 */
    done.click();

    for (let i = 0; i < 15; i++){
      await sleep(200);
      const pay = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('결제'));
      if (pay) return claimed;
    }
    await deselectAll();
    return null;
  } catch (e) {
    await deselectAll();
    return null;
  }
}
