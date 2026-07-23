import { SEL, sleep } from './dom.js';

/* 관람인원 '일반' n명 선택.
   [class*=NumberWrap]는 데스크톱/모바일 중복으로 8개 매칭될 수 있으나(스펙 실험 8번)
   label이 '일반'인 첫 wrap 사용이 동작 검증됨. */
export async function selectAdults(n){
  const wraps = document.querySelectorAll(SEL.numberWrap);
  if (!wraps.length) throw new Error('인원 선택 영역을 찾을 수 없습니다.');
  const normalWrap = [...wraps].find(w => {
    const l = w.querySelector(SEL.label);
    return l && l.textContent.trim() === '일반';
  }) || wraps[0];
  const btn = [...normalWrap.querySelectorAll(SEL.numBtn)]
    .find(b => b.textContent.trim() === String(n));
  if (!btn) throw new Error('일반 ' + n + '명 버튼을 찾을 수 없습니다.');
  if (btn.getAttribute('aria-pressed') === 'true') return;
  btn.click();
  await sleep(600);
}
