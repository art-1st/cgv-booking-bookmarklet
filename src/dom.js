export const POLL_INTERVAL = 5000;
export const POLL_JITTER = 1000;
export const SEAT_UNIT = 38; /* 좌석 CSS 단위 크기(px) */

export const SEL = {
  seatChoiceArea: '[class*=seatChoiceArea]',
  mainMap: '.react-transform-component [class*=seatPositionWrap]',
  anyMap: '[class*=seatPositionWrap]',
  seatBtn: 'button[class*=seatNumber]',
  seatSelectWrap: '[class*=seatSelectWrap]',
  refreshBtn: 'button[title="새로고침"]',
  numberWrap: '[class*=NumberWrap]',
  numBtn: '[class*=btn-num]',
  label: '[class*=label]',
};

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const jitter = () =>
  POLL_INTERVAL + Math.floor(Math.random() * POLL_JITTER * 2) - POLL_JITTER;

/* 좌석 버튼의 실제 라벨.
   스위트박스 좌석은 <small class="voice-only">연접좌석</small> 접두어가
   textContent에 섞이므로(스펙 실험 6번) voice-only 노드를 제거하고 읽는다. */
export function seatLabel(el){
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.voice-only').forEach(n => n.remove());
  return clone.textContent.trim();
}
