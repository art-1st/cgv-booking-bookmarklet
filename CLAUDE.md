# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

CGV 좌석선택 페이지(`cgv.co.kr/cnm/selectVisitorCnt`)에서 매진 좌석의 취소표를 자동 감지·점유하는 bookmarklet. vanilla JS ESM 모듈을 esbuild로 IIFE 번들해 `javascript:` URL로 산출한다. 1인/2인 예매와 Telegram 알림을 지원한다.

- 설계 문서: `docs/superpowers/specs/2026-07-23-cgv-sniper-v2-design.md` — **DOM 로직의 근거인 실브라우저 실험 결과 10개 항목 포함. 좌석 관련 수정 전 필독.**

## 빌드

```bash
npm run build   # src/ → dist/bookmarklet.js(readable) + dist/bookmarklet.min.js(javascript: URL)
npm run watch   # src/ 변경 감지 재빌드
```

테스트 프레임워크 없음. 순수 로직은 `node -e`로 검증(모든 모듈은 import 부수효과가 없어 Node에서 import 가능), DOM 로직은 실페이지에서 `dist/bookmarklet.js`를 콘솔/agent-browser로 주입해 스모크 테스트.

## 아키텍처

진입점 `src/index.js`: 가드 → 재실행 정리 → 인원(기본 1) → 좌석맵 열기 → 후보 선택 UI → 감시 → 점유 → 알림.

| 모듈 | 책임 |
|------|------|
| `guard.js` | cgv.co.kr/좌석선택 페이지 확인, 아니면 confirm 후 `/cnm/movieBook` 이동 |
| `dom.js` | 셀렉터 상수(SEL)·타이밍 상수·sleep/jitter·seatLabel |
| `config.js` | localStorage `cgvSniper.config` (Telegram token/chat_id) |
| `visitors.js` | `selectAdults(n)` — 관람인원 '일반' n명 선택 |
| `seatmap.js` | 좌석맵 열기/수집/후보 매칭/active 좌석 조회 |
| `monitor.js` | 감시 루프 (새로고침 → 인원 재선택 → 후보 확인), `window.__cgvSniper` |
| `claim.js` | 점유 (자동 쌍 보정 `adjustSelection`, 실패 시 `deselectAll` 클린업) |
| `notify.js` | beep/진동/화면 알림 + Telegram sendMessage (실패 격리) |
| `ui/picker.js` | 후보 선택 오버레이 (1/2명 토글 — 토글 시 재수집·재렌더) |
| `ui/panel.js` | 감시 상태 패널 (중지, ⚙️ 알림설정) |
| `ui/settings.js` | Telegram 설정 모달 |

## 핵심 설계 제약 (수정 시 깨뜨리면 안 됨)

CGV는 React SPA이며 아래는 실브라우저 검증을 거친 결정이다 (상세 근거: 스펙 문서):

- **전체화면 좌석맵을 절대 닫지 않는다.** 닫으면 예매 세션이 종료된다. 새로고침(`button[title="새로고침"]`)·인원 선택은 전체화면 뒤에서도 JS 클릭이 동작하므로, 전체화면을 유지한 채 모든 작업을 수행한다.
- **좌석은 메인맵에서만 수집한다.** `.react-transform-component [class*=seatPositionWrap]` — 미니맵에 동일 좌석 버튼이 중복 존재한다.
- **인원 선택은 매 루프/점유 전에 재수행한다.** 사이트가 인원수 기준으로 좌석 `disabled`를 재계산한다(1인 예매는 외딴 빈 좌석을 만드는 선택이 차단될 수 있음 — 상영관/혼잡도에 따라 다름). 이 규칙을 재구현하지 말고 DOM의 `disabled` 상태를 읽어라.
- **2인 모드 자동 쌍 선택 대응.** 좌석 클릭 시 인접 좌석이 자동으로 함께 선택될 수 있고, 선택된 좌석 클릭 시 쌍 전체가 해제될 수 있다. `claim.js`는 매 클릭 후 `activeSeats()`를 재확인하며 조정한다. 비인접 2석 조합도 CGV가 허용한다.
- **성공 판정은 DOM 상태 전환으로만 한다.** 좌석 선택 성공 = [선택완료] 버튼 활성화, 점유 성공 = 결제 버튼 출현.
- **좌석 라벨은 `seatLabel()`로만 읽는다.** 스위트박스 좌석 textContent에는 voice-only "연접좌석" 접두어가 섞인다.
- **셀렉터는 부분 일치(`[class*=...]`)를 사용한다.** CGV가 해시된 CSS Module 클래스명을 쓴다. `[class*=NumberWrap]`은 데스크톱/모바일 중복으로 8개까지 매칭될 수 있다(label '일반'인 첫 wrap 사용).
- **소스에 backtick(템플릿 리터럴) 금지.** 스모크 테스트에서 `agent-browser eval "$(cat dist/bookmarklet.js)"` 셸 주입 안전성을 위해 문자열 연결만 사용한다.
- **import 부수효과 금지.** DOM/window 접근은 함수 안에서만 — Node에서 모든 모듈을 import해 검증할 수 있어야 한다.

## 상수

`src/dom.js`: `POLL_INTERVAL=5000(ms)`, `POLL_JITTER=1000(ms)` (실제 감시 간격 4~6초), `SEAT_UNIT=38(px)` — 좌석 grid 좌표 계산용.
