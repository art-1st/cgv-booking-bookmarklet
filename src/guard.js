export const BOOKING_HOME = 'https://cgv.co.kr/cnm/movieBook';
export const SEAT_PATH = '/cnm/selectVisitorCnt';

export function checkLocation(loc = location){
  const onCgv = loc.hostname === 'cgv.co.kr' || loc.hostname.endsWith('.cgv.co.kr');
  if (!onCgv) return 'other-domain';
  if (!loc.pathname.startsWith(SEAT_PATH)) return 'other-page';
  return 'seat-page';
}

/* seat-page면 true. 아니면 confirm 후 예매 홈으로 이동시키고 false. */
export function runGuard(loc = location){
  const where = checkLocation(loc);
  if (where === 'seat-page') return true;
  const msg = where === 'other-domain'
    ? 'CGV 예매 페이지로 이동할까요?'
    : '예매 페이지로 이동합니다.\n영화·극장·회차 선택 후 좌석선택 화면에서 다시 실행하세요.';
  if (confirm(msg)) location.href = BOOKING_HOME;
  return false;
}
