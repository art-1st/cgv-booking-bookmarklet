# CGV 좌석 스나이퍼 v2 설계

- 날짜: 2026-07-23
- 상태: 사용자 승인 완료 (구현 전)
- 대상: 기존 단일 파일 bookmarklet의 정규화(모듈 분리 + 빌드) 및 기능 고도화

## 배경 및 목표

CGV 좌석선택 페이지(`cgv.co.kr/cnm/selectVisitorCnt`)에서 매진 좌석의 취소표를 자동 감지·점유하는 bookmarklet의 v2. 세 가지 기능을 추가하면서 단일 파일 구조를 모듈 + 빌드 체계로 정규화한다.

1. **가드 UX**: 잘못된 도메인/페이지에서 실행 시 confirm 후 예매 페이지로 자동 이동
2. **2인 예매**: 실행 시 1명/2명 선택, 후보 중 빈 2석 확보 시 점유 (인접 무관)
3. **Telegram 알림**: localStorage 설정 기반 보조 알림 (점유 성공, 감시 비정상 중단)

## 확정된 결정 사항

| 축 | 결정 |
|----|------|
| 정규화 범위 | 모듈 분리 + esbuild 빌드 스크립트 (테스트 프레임워크 도입 안 함) |
| 언어 | vanilla JS (TypeScript 미도입) |
| 배포 | 인라인 bookmarklet (원격 로더 미채택) |
| 2인 전략 | 개별 후보 우선순위 리스트에서 상위 2석 확보 (인접 보장 없음) |
| Telegram 설정 | localStorage + 설정 UI (감시 패널 ⚙️ → 모달) |
| 가드 동작 | confirm 후 `https://cgv.co.kr/cnm/movieBook` 자동 이동 |

## 실험으로 검증된 CGV 동작 (2026-07-23, 실브라우저 확인)

v1에서 검증된 제약(전체화면 유지 필수, 메인맵만 수집, 매 루프 인원 재선택, DOM 상태 전환 기반 성공 판정)에 더해 아래를 새로 확인했다.

1. **인원수별 disabled 계산**: 사이트가 선택된 인원수에 따라 좌석 `disabled` 상태를 다르게 계산한다. 혼잡한 상영관(강남 5관, 잔여 40/172)에서 1인 모드는 "선택 시 외딴 빈 좌석 1개가 남는" 자리 5석을 차단했고, 2인 전환 시 정확히 그 5석이 풀렸다. 한산한 상영관(용산 IMAX, 잔여 198/624)에서는 1인 차단이 전혀 없었다. → **정책은 상영관/혼잡도에 따라 다르며, bookmarklet은 규칙을 재구현하지 않고 사이트가 계산한 disabled 상태만 읽는다.**
2. **2인 자동 쌍 선택**: 2인 모드에서 좌석 클릭 시 인접 빈 좌석까지 자동으로 2석 선택된다 (오른쪽 우선, 막히면 왼쪽). 고립 좌석 클릭 시 1석만 선택된다. 남은 슬롯이 1개면 클릭한 좌석만 추가된다.
3. **비인접 조합 허용**: 떨어진 2석(C12+F2)도 [선택완료]가 활성화된다. 자동 쌍은 편의 기능일 뿐 규칙이 아니다.
4. **선택완료 활성 조건**: 선택 좌석 수 == 인원수일 때만 활성화.
5. **선택 좌석 클래스**: `seatMap_active__*`. 선택된 쌍의 좌석을 클릭하면 쌍 전체가 해제될 수 있다.
6. **스위트박스 라벨 버그 원인**: 좌석 버튼 textContent에 스크린리더용 `<small class="voice-only">연접좌석</small>` 접두어가 포함된다 (예: "연접좌석L3"). 실제 라벨은 내부 `<span>`에 있다.
7. **`disabled` HTML 속성**: 선택 불가 좌석은 클래스뿐 아니라 button `disabled` 속성이 직접 설정된다 (클래스 문자열 검사보다 견고).
8. **NumberWrap 중복**: `[class*=NumberWrap]`이 8개 매칭된다 (데스크톱/모바일 중복 레이아웃). label이 "일반"인 wrap을 찾는 기존 방식은 첫 번째 매치를 사용하며 동작 확인됨.
9. **URL 구조**: 좌석선택 페이지는 `https://cgv.co.kr/cnm/selectVisitorCnt` (쿼리 없음, 예매 컨텍스트는 세션 상태). 예매 시작점은 `/cnm/movieBook`. 좌석선택 진입에는 로그인 필요.
10. **CSP 없음**: cgv.co.kr은 Content-Security-Policy 헤더를 보내지 않는다 (Telegram API fetch 및 향후 원격 로더 가능).

## 프로젝트 구조

```
cgv-booking-bookmarklet/
├── package.json            # esbuild devDependency + scripts (build, watch)
├── build.mjs               # 번들 → minify → "javascript:void(...)" 래핑 자동화
├── src/
│   ├── index.js            # 진입점: 가드 통과 후 부트스트랩
│   ├── guard.js            # 도메인/페이지 가드
│   ├── config.js           # localStorage 설정 읽기/쓰기
│   ├── dom.js              # 셀렉터 상수, sleep/jitter, 좌석 라벨 추출 헬퍼
│   ├── visitors.js         # selectAdults(n) — 일반 n명 선택
│   ├── seatmap.js          # 좌석맵 열기/수집/후보 매칭
│   ├── monitor.js          # 감시 루프
│   ├── claim.js            # 점유 시도 (1인/2인 공통)
│   ├── notify.js           # beep/진동/화면 알림 + Telegram 전송
│   └── ui/
│       ├── picker.js       # 좌석 후보 선택 오버레이 (인원 토글 포함)
│       ├── panel.js        # 감시 상태 패널
│       └── settings.js     # Telegram 설정 모달
├── dist/
│   ├── bookmarklet.js      # readable 번들 (디버깅용)
│   └── bookmarklet.min.js  # 완성된 javascript: URL — 복사해서 바로 북마크 등록
├── docs/superpowers/specs/ # 설계 문서
├── README.md
└── CLAUDE.md
```

- 기존 루트의 `bookmarklet.js` / `bookmarklet.min.js`는 제거하고 dist/ 산출물로 대체한다.
- 빌드 산출물은 `javascript:void(...)` 접두어까지 포함한 완성된 북마크 URL이다 (수동 래핑 단계 제거).

## 실행 플로우

```
실행 → 가드 → (재실행 시 기존 감시 정리: window.__cgvSniper?.stop())
     → 좌석맵 열기 → 후보 선택 UI(인원 토글 1명/2명, 기본 1명)
     → 감시 루프(새로고침 → selectAdults(n) → 후보 확인)
     → 점유(claim) → 알림(로컬 + Telegram)
```

### 가드 (guard.js)

| 상황 | 동작 |
|------|------|
| hostname이 `cgv.co.kr`/`*.cgv.co.kr` 아님 | `confirm("CGV 예매 페이지로 이동할까요?")` → 수락 시 `https://cgv.co.kr/cnm/movieBook` 이동, 거절 시 종료 |
| cgv.co.kr이지만 pathname이 `/cnm/selectVisitorCnt` 아님 | `confirm("예매 페이지로 이동합니다. 영화·극장·회차 선택 후 좌석선택 화면에서 다시 실행하세요.")` → `/cnm/movieBook` 이동 |
| 좌석선택 페이지 | 통과 |

### 인원 선택 (picker.js 내 토글)

- 오버레이 상단 **[1명] [2명]** 토글, 기본 1명.
- 토글 변경 시 `selectAdults(n)` 실행 → 좌석 재수집 → 그리드 재렌더. 인원수에 따라 사이트의 disabled 계산이 달라지므로 반드시 선택 후 상태를 표시한다.
- 2명 모드 안내 문구: "후보 중 빈 좌석 2개가 확보되면 점유합니다 (인접 보장 없음)".

### 좌석 수집 (seatmap.js)

- 메인맵만: `.react-transform-component [class*=seatPositionWrap]` (미니맵 제외, v1 제약 유지).
- 라벨 추출: voice-only 텍스트를 제외한 실제 라벨 사용 (스위트박스 "연접좌석" 접두어 버그 수정). 구현: 버튼 내 `span` 텍스트 우선, 없으면 textContent에서 voice-only 노드 텍스트 제거.
- 가용 판정: `el.disabled === false` (클래스 문자열 검사 대체).
- 매진 표시(후보 UI용): `disabled` + 클래스에 `Disabled` 포함 여부로 구분 유지.

### 감시 루프 (monitor.js)

1. `button[title="새로고침"]` 클릭 → 1.5s 대기 (버튼 소실 시 비정상 중단 처리)
2. `selectAdults(n)` 재선택 (새로고침이 인원을 초기화할 수 있음)
3. 후보 중 enabled 좌석 수집:
   - 1인: 1석 발견 → claim
   - 2인: 2석 이상 → 우선순위 상위 2석으로 claim
4. claim 실패 시 계속, 성공 시 종료. 대기: `POLL_INTERVAL`(5000ms) ± `POLL_JITTER`(1000ms)
5. 전체화면 좌석맵은 절대 닫지 않는다 (닫으면 예매 세션 종료 — v1 제약)

### 점유 (claim.js)

**1인**: v1 로직 유지 — 좌석 클릭 → [선택완료] 활성 대기 → 클릭 → 결제 버튼 출현 확인.

**2인 — 자동 쌍 선택 보정**:
1. 첫 번째 목표 좌석 클릭 → 대기
2. `seatMap_active` 좌석 목록 검증:
   - 사이트가 인접 좌석을 자동 선택할 수 있음 (예: F7 클릭 → F7+F8)
   - 자동 선택이 목표 조합과 다르면: 원치 않는 active 해제 → 두 번째 목표 클릭
3. actives == 목표 2석이 될 때까지 조정 (최대 3회, 실패 시 전체 해제 후 감시 복귀)
4. [선택완료] 활성 확인 → 클릭 → 결제 버튼 출현 확인 → 성공
5. **실패 시 클린업 보장**: active 좌석 전부 해제 (다음 루프 오염 방지)

성공 판정은 v1과 동일하게 DOM 상태 전환으로만 한다: 좌석 선택 성공 = [선택완료] 버튼 활성화, 점유 성공 = 결제 버튼 출현.

## Telegram 알림

- **저장**: `localStorage["cgvSniper.config"]` = `{"telegramBotToken": "...", "telegramChatId": "..."}` (cgv.co.kr 도메인 스코프)
- **설정 UI**: 감시 패널 ⚙️ 버튼 → 모달 (token, chat_id 입력, [테스트 전송], [저장])
- **전송**: `fetch("https://api.telegram.org/bot<token>/sendMessage", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({chat_id, text})})` — Telegram Bot API는 CORS 허용, cgv.co.kr은 CSP 없음 (확인됨)
- **알림 시점**:
  1. 점유 성공: 영화·극장·회차(페이지에서 추출 가능한 범위) + 좌석 + 시각
  2. 감시 비정상 중단: 원인 (예: 새로고침 버튼 소실)
- **실패 격리**: 전송 실패는 try/catch로 격리, 패널에만 표시. 예매 플로우에 영향을 주지 않는다.
- 미설정 시 로컬 알림(beep + 진동 + 화면)만 동작. v1 로컬 알림은 그대로 유지.

## 에러 처리

| 상황 | 처리 |
|------|------|
| 가드/초기화 실패 (인원 영역·좌석맵 못 찾음) | `alert` + 종료 (v1 방식) |
| 감시 중 DOM 소실 (새로고침 버튼 등) | 패널 상태 표시 + Telegram 알림(설정 시) + 루프 중지 |
| claim 중 좌석 뺏김/조정 실패 | active 전부 해제 → 감시 복귀 |
| Telegram 전송 실패 | 콘솔 + 패널 표시만, 플로우 계속 |

## 검증 방법

- `npm run build` 성공 + 산출물 크기 확인 (인라인 등록 가능 범위)
- dist 번들을 실제 CGV 좌석선택 페이지 콘솔에 붙여 스모크 테스트 (agent-browser로 재현 가능):
  - 가드: 타 도메인/예매 홈/좌석선택 각각에서 실행
  - 1인/2인 토글에 따른 그리드 disabled 표시 변화
  - 2인 자동 쌍 보정 로직 (좌석 클릭 → actives 검증)
  - Telegram 테스트 전송
- 실제 점유([선택완료] 클릭)는 실좌석을 점유하므로 스모크 테스트에서 제외하거나 즉시 취소 가능한 회차로 한정
- 테스트 프레임워크는 도입하지 않는다 (사용자 결정)

## 문서 재작성

- **README.md**: 새 사용법 (빌드 → 등록 → 실행 → 인원 선택 → Telegram 설정), 동작 원리, 실험으로 확인된 CGV 좌석 정책 요약
- **CLAUDE.md**: 모듈 구조, 빌드 명령, 핵심 설계 제약 (v1 제약 + 본 문서의 실험 발견 사항)

## Out of Scope

- 3인 이상 예매, 청소년/우대/경로 권종
- 원격 로더 배포 (향후 옵션 — CSP 없음 확인으로 기술적 가능성은 열려 있음)
- 테스트 프레임워크, CI
- 결제 자동화 (점유 후 결제는 사용자 몫 — v1과 동일)
