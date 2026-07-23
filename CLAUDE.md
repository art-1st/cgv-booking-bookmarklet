# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

CGV 영화 예매 좌석 선택 페이지(`selectVisitorCnt`)에서 매진 좌석의 취소표를 자동 감지·점유하는 JavaScript bookmarklet. 빌드 도구, package.json, 테스트 없이 단일 소스 파일로 구성된다.

- `bookmarklet.js` — 원본 소스 (주석 포함). 파일 전체가 `javascript:void(function(){...})();` 형태
- `bookmarklet.min.js` — 북마크 등록용 minified 버전

## 빌드

`bookmarklet.js` 수정 후 반드시 minified 버전을 재생성하여 두 파일을 동기화한다:

```bash
npx --yes terser bookmarklet.js -c -m -o bookmarklet.min.js
```

## 아키텍처

전체가 하나의 IIFE이며 실행 흐름은 파일 하단의 async 진입점에서 시작한다:

```
selectOneAdult() → openSeatMap() → collectSeats() → createUI() (좌석 후보 선택 오버레이, Promise로 결과 반환)
→ startMonitoring() (감시 루프: 새로고침 → 인원 재선택 → 좌석 확인) → tryClaim() → notifyUser()
```

재실행/중지 제어는 전역 핸들 `window.__cgvSniper.stop()`으로 한다. 감시 주기는 상단 상수 `POLL_INTERVAL`(5000ms) ± `POLL_JITTER`(1000ms)로 조절한다.

## 핵심 설계 제약 (수정 시 깨뜨리면 안 됨)

CGV는 React SPA이며 아래 제약들은 실제 동작 검증을 거친 결정이다:

- **전체화면 좌석맵을 절대 닫지 않는다.** 닫기/뒤로가기 시 예매 세션 자체가 종료된다. 새로고침(`button[title="새로고침"]`)은 전체화면 뒤에서도 클릭 가능하므로, 전체화면을 유지한 채 감시·점유를 모두 수행한다.
- **좌석은 메인맵에서만 수집한다.** `.react-transform-component [class*=seatPositionWrap]` 내부만 사용 — 미니맵에 동일 좌석 버튼이 중복 존재한다.
- **인원 선택은 매 루프마다 재수행한다.** 새로고침이 인원 선택을 초기화할 수 있어 `startMonitoring()` 루프와 `tryClaim()` 시작 시 항상 `selectOneAdult()`를 호출한다 (1인 일반 예매 전용).
- **성공 판정은 DOM 상태 전환으로 한다.** 좌석 선택 성공은 좌석의 `active` 클래스가 아니라 **[선택완료] 버튼 활성화**로, 점유 성공은 **결제 버튼 출현(결제 화면 전환)**으로 판정한다.
- **셀렉터는 부분 일치(`[class*=...]`)를 사용한다.** CGV가 해시된 CSS 클래스명을 쓰기 때문이며, 매진 판정도 클래스명의 `Disabled`/`disabled` 포함 여부로 한다. 극장별 좌석 배치 차이는 좌석 버튼의 `style.left/top`을 `SEAT_UNIT`(38px)으로 나눈 grid 좌표로 동적 대응한다.
