import { runGuard } from './guard.js';
import { selectAdults } from './visitors.js';
import { openSeatMap, collectSeats } from './seatmap.js';
import { showPicker } from './ui/picker.js';
import { startMonitoring } from './monitor.js';

(async () => {
  try {
    if (!runGuard()) return;
    window.__cgvSniper?.stop(); /* 재실행 시 기존 감시 정리 */

    await selectAdults(1); /* 기본 1명 — picker에서 토글 가능 */
    await openSeatMap();
    const seats = collectSeats();
    if (!seats.length){ alert('좌석을 찾을 수 없습니다.'); return; }

    const picked = await showPicker(seats, 1);
    if (!picked || !picked.targets.length) return;

    await startMonitoring(picked.targets, picked.people);
  } catch (e) {
    alert('오류: ' + e.message);
  }
})();
