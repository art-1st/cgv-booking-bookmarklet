import { SEL, sleep, jitter } from './dom.js';
import { selectAdults } from './visitors.js';
import { enabledCandidates } from './seatmap.js';
import { tryClaim } from './claim.js';
import { notifySuccess, notifyAbort, showNoti } from './notify.js';
import { createPanel } from './ui/panel.js';
import { showSettings } from './ui/settings.js';

export async function startMonitoring(targets, people){
  let running = true;
  let count = 0;
  let panel = null;
  const stop = () => {
    running = false;
    panel?.remove();
    window.__cgvSniper = null;
  };
  window.__cgvSniper = { stop };

  panel = createPanel(targets, people, {
    onStop: () => { stop(); showNoti('감시가 중지되었습니다.', '#f39c12'); },
    onSettings: showSettings,
  });

  while (running){
    count++;
    panel.setStatus('감시 중... (' + count + '회 새로고침)');

    /* 1. 새로고침 (전체화면 뒤에서도 클릭 가능 — v1 검증) */
    const refresh = document.querySelector(SEL.refreshBtn);
    if (!refresh){ stop(); await notifyAbort('새로고침 버튼을 찾을 수 없습니다.'); break; }
    refresh.click();
    await sleep(1500);

    /* 2. 인원 재선택 — 사이트가 인원수 기준으로 disabled를 재계산하게 함 */
    try {
      await selectAdults(people);
    } catch (e) {
      stop(); await notifyAbort(e.message); break;
    }
    await sleep(500);

    /* 3. 후보 중 enabled 좌석 확인 */
    const avail = enabledCandidates(targets);
    if (avail.length >= people){
      const picks = avail.slice(0, people);
      panel.setStatus(picks.join(', ') + ' 발견! 점유 시도...');
      const claimed = await tryClaim(picks, people, targets);
      if (claimed){
        stop();
        await notifySuccess(claimed);
        break;
      }
      panel.setStatus('점유 실패, 계속 감시...');
    }

    await sleep(jitter());
  }
}
