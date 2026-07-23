# CGV 좌석 스나이퍼 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 파일 bookmarklet을 모듈 + esbuild 빌드 체계로 정규화하고, 도메인 가드·2인 예매·Telegram 알림을 추가한다.

**Architecture:** src/ 아래 기능별 ESM 모듈(가드/설정/DOM 유틸/인원/좌석맵/감시/점유/알림/UI 3종)을 esbuild로 IIFE 번들 → minify → `javascript:void(...)` 래핑까지 자동화해 dist/에 산출한다. 모든 CGV 동작 판단은 사이트가 계산한 DOM 상태(`disabled`, `seatMap_active` 클래스, 버튼 활성화)를 읽는 방식이며, 스펙 문서의 실브라우저 실험 결과에 근거한다.

**Tech Stack:** vanilla JS (ESM), esbuild (유일한 devDependency), Node ≥ 18. 테스트 프레임워크 없음(사용자 결정) — 순수 로직은 `node -e` 스니펫으로, DOM 로직은 실페이지 스모크 테스트로 검증.

**Spec:** `docs/superpowers/specs/2026-07-23-cgv-sniper-v2-design.md` — 태스크 수행 전 반드시 읽을 것. 특히 "실험으로 검증된 CGV 동작" 10개 항목이 모든 DOM 로직의 근거다.

## Global Constraints

- 런타임 의존성 0개. devDependency는 esbuild 하나만.
- 모든 src 모듈은 **import 부수효과 금지** — DOM/window 접근은 함수 내부에서만. 모든 모듈이 Node에서 `import` 가능해야 한다(검증에 사용).
- 소스에서 **backtick(템플릿 리터럴) 금지**, 문자열 연결(`+`) 사용 — 스모크 테스트에서 셸로 코드를 주입할 때의 안전성 및 v1 코드 스타일 유지.
- 전체화면 좌석맵을 절대 닫지 않는다 (닫으면 예매 세션 종료 — v1 검증 제약).
- 좌석은 메인맵(`.react-transform-component [class*=seatPositionWrap]`)에서만 수집 (미니맵 중복 제외).
- 매 감시 루프/점유 시도 전 `selectAdults(n)` 재실행 (새로고침이 인원을 초기화할 수 있음).
- 성공 판정은 DOM 상태 전환으로만: 좌석 선택 성공 = [선택완료] 버튼 활성화, 점유 성공 = 결제 버튼 출현.
- 상수 고정값: `POLL_INTERVAL=5000`, `POLL_JITTER=1000`, `SEAT_UNIT=38`, localStorage 키 `'cgvSniper.config'`.
- UI 문구는 모두 한국어.
- 모든 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 추가.

---

### Task 1: git init + npm 스캐폴딩

**Files:**
- Create: `.gitignore`, `package.json`
- (커밋 대상) 기존 전체: `bookmarklet.js`, `bookmarklet.min.js`, `README.md`, `CLAUDE.md`, `docs/`

**Interfaces:**
- Produces: git 저장소, `npm run build` 스크립트 진입점(다음 태스크가 build.mjs 작성), esbuild 설치 상태

- [ ] **Step 1: 환경 확인**

Run: `node --version`
Expected: `v18` 이상 (esbuild 및 `node --watch-path` 요구)

- [ ] **Step 2: git init + v1 스냅샷 커밋**

v2 변경 전의 v1 상태를 이력으로 보존한다.

```bash
cd /Users/yoonhwan/dev/cgv-booking-bookmarklet
git init
printf 'node_modules/\n' > .gitignore
git add -A
git commit -m "chore: v1 스냅샷 (단일 파일 bookmarklet + v2 설계 스펙)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: 커밋 성공, `git log --oneline` 에 1개 커밋

- [ ] **Step 3: package.json 작성**

```json
{
  "name": "cgv-booking-bookmarklet",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "watch": "node --watch-path=./src --watch-path=./build.mjs build.mjs"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  }
}
```

- [ ] **Step 4: 의존성 설치**

Run: `npm install`
Expected: `node_modules/.bin/esbuild` 존재, package-lock.json 생성

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: npm 스캐폴딩 (esbuild)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: build.mjs 빌드 파이프라인

**Files:**
- Create: `build.mjs`, `src/index.js` (임시 스텁 — Task 10에서 최종본으로 교체)

**Interfaces:**
- Produces: `npm run build` → `dist/bookmarklet.js` (readable IIFE, 콘솔 디버깅용) + `dist/bookmarklet.min.js` (완성된 `javascript:` URL, 북마크 등록용)

- [ ] **Step 1: 임시 스텁 진입점 작성**

`src/index.js`:
```js
console.log('cgv-sniper v2 skeleton');
```

- [ ] **Step 2: build.mjs 작성**

```js
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const common = {
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  write: false,
};

const readable = await build(common);
const min = await build({ ...common, minify: true });

await mkdir('dist', { recursive: true });

const readableCode = readable.outputFiles[0].text;
await writeFile('dist/bookmarklet.js', readableCode);

/* esbuild IIFE 출력 "(()=>{...})();\n" → 끝 세미콜론 제거 후 javascript: URL로 래핑 */
const code = min.outputFiles[0].text.trim().replace(/;$/, '');
if (code.includes('\n')) {
  throw new Error('minified 출력이 한 줄이 아닙니다 — bookmarklet URL로 사용할 수 없습니다.');
}
const url = 'javascript:void(' + code + ')';
await writeFile('dist/bookmarklet.min.js', url);

console.log('dist/bookmarklet.js     ' + readableCode.length + ' bytes');
console.log('dist/bookmarklet.min.js ' + url.length + ' bytes (bookmark URL)');
```

- [ ] **Step 3: 빌드 실행 검증**

Run: `npm run build`
Expected: 두 줄의 바이트 크기 출력, 에러 없음

Run: `head -c 40 dist/bookmarklet.min.js`
Expected: `javascript:void((()=>{` 로 시작 (esbuild 버전에 따라 화살표 함수 형태는 다를 수 있으나 `javascript:void(` 접두어는 필수)

Run: `node -e "const s=require('fs').readFileSync('dist/bookmarklet.min.js','utf8'); if(!s.startsWith('javascript:void(')||s.includes('\n')) {console.log('FAIL');process.exit(1)} console.log('URL format OK')"`
Expected: `URL format OK`

- [ ] **Step 4: Commit**

```bash
git add build.mjs src/index.js dist/
git commit -m "feat: esbuild 빌드 파이프라인 (번들 → minify → javascript: URL 래핑)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: dom.js — 상수·셀렉터·헬퍼

**Files:**
- Create: `src/dom.js`

**Interfaces:**
- Produces (이후 전 태스크가 사용):
  - `POLL_INTERVAL: 5000`, `POLL_JITTER: 1000`, `SEAT_UNIT: 38` (number 상수)
  - `SEL` — 셀렉터 상수 객체 (아래 코드의 키 그대로)
  - `sleep(ms: number): Promise<void>`
  - `jitter(): number` — 4000..6000 범위
  - `seatLabel(el: Element): string` — voice-only 텍스트("연접좌석" 등)를 제외한 좌석 라벨

- [ ] **Step 1: 구현**

`src/dom.js`:
```js
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
```

- [ ] **Step 2: Node 검증 (순수 로직)**

Run:
```bash
node -e "import('./src/dom.js').then(m=>{for(let i=0;i<1000;i++){const j=m.jitter();if(j<4000||j>6000){console.log('FAIL',j);process.exit(1)}}console.log('jitter OK 4000..6000, SEL keys:',Object.keys(m.SEL).length)})"
```
Expected: `jitter OK 4000..6000, SEL keys: 9`

- [ ] **Step 3: Commit**

```bash
git add src/dom.js
git commit -m "feat: dom 유틸 모듈 (셀렉터 상수, sleep/jitter, voice-only 제외 좌석 라벨)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: config.js + guard.js

**Files:**
- Create: `src/config.js`, `src/guard.js`

**Interfaces:**
- Produces:
  - `loadConfig(storage?): object` — `{telegramBotToken?, telegramChatId?}`, 실패 시 `{}`
  - `saveConfig(cfg: object, storage?): void`
  - `checkLocation(loc?): 'other-domain' | 'other-page' | 'seat-page'`
  - `runGuard(loc?): boolean` — seat-page면 true, 아니면 confirm 후 이동 처리하고 false

- [ ] **Step 1: config.js 구현**

`src/config.js`:
```js
const KEY = 'cgvSniper.config';

export function loadConfig(storage = globalThis.localStorage){
  try {
    return JSON.parse(storage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function saveConfig(cfg, storage = globalThis.localStorage){
  storage.setItem(KEY, JSON.stringify(cfg || {}));
}
```

- [ ] **Step 2: guard.js 구현**

`src/guard.js`:
```js
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
```

- [ ] **Step 3: Node 검증**

Run:
```bash
node -e "import('./src/guard.js').then(m=>{console.log(m.checkLocation({hostname:'example.com',pathname:'/'}),m.checkLocation({hostname:'www.cgv.co.kr',pathname:'/cnm/movieBook'}),m.checkLocation({hostname:'cgv.co.kr',pathname:'/cnm/selectVisitorCnt'}))})"
```
Expected: `other-domain other-page seat-page`

Run:
```bash
node -e "import('./src/config.js').then(m=>{const s=new Map(),st={getItem:k=>s.get(k)??null,setItem:(k,v)=>s.set(k,v)};m.saveConfig({telegramBotToken:'t',telegramChatId:'c'},st);console.log(JSON.stringify(m.loadConfig(st)),JSON.stringify(m.loadConfig({getItem:()=>'not-json'})))})"
```
Expected: `{"telegramBotToken":"t","telegramChatId":"c"} {}`

- [ ] **Step 4: Commit**

```bash
git add src/config.js src/guard.js
git commit -m "feat: localStorage 설정 모듈 + 도메인/페이지 가드

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: visitors.js + seatmap.js

**Files:**
- Create: `src/visitors.js`, `src/seatmap.js`

**Interfaces:**
- Consumes: `SEL`, `sleep`, `SEAT_UNIT`, `seatLabel` (Task 3)
- Produces:
  - `selectAdults(n: number): Promise<void>` — 일반 n명 선택, 실패 시 throw
  - `getMainMap(): Element|null`
  - `seatButtons(): Element[]` — 메인맵의 좌석 버튼 (zone 제외)
  - `collectSeats(): {label, col, row, sold}[]`
  - `openSeatMap(): Promise<void>` — 실패 시 throw
  - `findSeatButton(label: string): Element|null`
  - `enabledCandidates(targets: string[]): string[]` — 우선순위 순 유지
  - `activeSeats(): Element[]` — `seatMap_active` 클래스 좌석

- [ ] **Step 1: visitors.js 구현**

`src/visitors.js`:
```js
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
```

- [ ] **Step 2: seatmap.js 구현**

`src/seatmap.js`:
```js
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
```

- [ ] **Step 3: Node import 검증**

Run:
```bash
node -e "Promise.all([import('./src/visitors.js'),import('./src/seatmap.js')]).then(([v,s])=>console.log('imports OK:',typeof v.selectAdults,typeof s.collectSeats,typeof s.enabledCandidates,typeof s.activeSeats))"
```
Expected: `imports OK: function function function function`

- [ ] **Step 4: Commit**

```bash
git add src/visitors.js src/seatmap.js
git commit -m "feat: 인원 선택(selectAdults) + 좌석맵 수집/매칭 모듈

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: notify.js — 로컬 알림 + Telegram

**Files:**
- Create: `src/notify.js`

**Interfaces:**
- Consumes: `loadConfig` (Task 4)
- Produces:
  - `beep(): void`, `vibrate(): void`
  - `showNoti(msg: string, bg: string): void` — 10초 후 자동 제거되는 중앙 알림
  - `getShowInfo(): string` — 페이지 헤딩에서 영화/극장 추출 (best-effort, 실패 시 '')
  - `sendTelegram(text: string, cfg?: object, fetchFn?): Promise<{skipped?:true} | {ok:boolean, error?:string}>`
  - `notifySuccess(seats: string[]): Promise<void>`
  - `notifyAbort(reason: string): Promise<void>`

- [ ] **Step 1: 구현**

`src/notify.js`:
```js
import { loadConfig } from './config.js';

export function beep(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.2, 0.4].forEach(d => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.3;
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.15);
    });
  } catch (e) {}
}

export function vibrate(){
  try { navigator.vibrate([300, 100, 300, 100, 300]); } catch (e) {}
}

export function showNoti(msg, bg){
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    padding: '32px 40px', borderRadius: '20px', background: bg,
    color: '#fff', fontSize: '22px', fontWeight: 'bold', zIndex: 1000000,
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)', textAlign: 'center',
    maxWidth: '85%', lineHeight: '1.5', whiteSpace: 'pre-line',
  });
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 10000);
}

/* 예매 컨텍스트 요약 (best-effort): 영화 제목 헤딩 추출, 못 찾으면 '' */
export function getShowInfo(){
  const h = [...document.querySelectorAll('h1,h2,h3')]
    .map(e => e.textContent.trim())
    .find(t => t && t.length < 60 && !/CGV|CJ|QR|관람인원|screen|범례|확인해/i.test(t));
  return h || '';
}

export async function sendTelegram(text, cfg = loadConfig(), fetchFn = globalThis.fetch){
  const token = cfg.telegramBotToken;
  const chat = cfg.telegramChatId;
  if (!token || !chat) return { skipped: true };
  try {
    const res = await fetchFn('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function notifySuccess(seats){
  beep();
  vibrate();
  showNoti('좌석 ' + seats.join(', ') + ' 점유 성공!\n결제를 진행하세요!', '#27ae60');
  await sendTelegram(['🎬 CGV 좌석 점유 성공!', getShowInfo(),
    '좌석: ' + seats.join(', '), new Date().toLocaleString('ko-KR')]
    .filter(Boolean).join('\n'));
}

export async function notifyAbort(reason){
  showNoti('감시 중단: ' + reason, '#f39c12');
  await sendTelegram('⚠️ CGV 좌석 감시 중단: ' + reason);
}
```

- [ ] **Step 2: Node 검증 (sendTelegram — fetch 스텁 주입)**

Run:
```bash
node -e "import('./src/notify.js').then(async m=>{const calls=[];const f=async(u,o)=>{calls.push({u,body:JSON.parse(o.body)});return{ok:true}};const r=await m.sendTelegram('hi',{telegramBotToken:'T',telegramChatId:'C'},f);console.log(JSON.stringify(r),calls[0].u,calls[0].body.chat_id,calls[0].body.text);const s=await m.sendTelegram('hi',{},f);console.log(JSON.stringify(s))})"
```
Expected: `{"ok":true} https://api.telegram.org/botT/sendMessage C hi` 다음 줄 `{"skipped":true}`

- [ ] **Step 3: Commit**

```bash
git add src/notify.js
git commit -m "feat: 알림 모듈 (beep/진동/화면 + Telegram sendMessage, 실패 격리)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: ui/panel.js + ui/settings.js

**Files:**
- Create: `src/ui/panel.js`, `src/ui/settings.js`

**Interfaces:**
- Consumes: `loadConfig`, `saveConfig` (Task 4), `sendTelegram` (Task 6)
- Produces:
  - `createPanel(targets: string[], people: number, {onStop, onSettings}): {setStatus(t: string): void, remove(): void}`
  - `showSettings(): void` — Telegram 설정 모달 (token/chat_id 입력, 테스트 전송, 저장)

- [ ] **Step 1: panel.js 구현**

`src/ui/panel.js`:
```js
export function createPanel(targets, people, { onStop, onSettings }){
  document.getElementById('cgv-sniper-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'cgv-sniper-panel';
  Object.assign(panel.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    padding: '12px 20px', borderRadius: '14px',
    background: 'rgba(26,26,46,0.95)', border: '1px solid #333',
    color: '#fff', fontSize: '13px', zIndex: 999998,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)', textAlign: 'center',
    maxWidth: '90%', backdropFilter: 'blur(8px)',
  });

  const tgt = document.createElement('div');
  Object.assign(tgt.style, { marginBottom: '6px', color: '#e94560', fontWeight: 'bold' });
  tgt.textContent = '[' + people + '명] ' + targets.join(', ');
  panel.appendChild(tgt);

  const st = document.createElement('div');
  st.style.marginBottom = '8px';
  st.textContent = '감시 준비 중...';
  panel.appendChild(st);

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'center' });

  const stopBtn = document.createElement('button');
  stopBtn.textContent = '중지';
  Object.assign(stopBtn.style, {
    padding: '8px 24px', border: '1px solid #e94560', borderRadius: '8px',
    background: 'transparent', color: '#e94560', fontSize: '13px', cursor: 'pointer',
  });
  stopBtn.addEventListener('click', onStop);
  row.appendChild(stopBtn);

  const setBtn = document.createElement('button');
  setBtn.textContent = '⚙️ 알림설정';
  Object.assign(setBtn.style, {
    padding: '8px 14px', border: '1px solid #555', borderRadius: '8px',
    background: 'transparent', color: '#aaa', fontSize: '13px', cursor: 'pointer',
  });
  setBtn.addEventListener('click', onSettings);
  row.appendChild(setBtn);

  panel.appendChild(row);
  document.body.appendChild(panel);

  return {
    setStatus: t => { st.textContent = t; },
    remove: () => panel.remove(),
  };
}
```

- [ ] **Step 2: settings.js 구현**

`src/ui/settings.js`:
```js
import { loadConfig, saveConfig } from '../config.js';
import { sendTelegram } from '../notify.js';

export function showSettings(){
  document.getElementById('cgv-sniper-settings')?.remove();
  const cfg = loadConfig();

  const wrap = document.createElement('div');
  wrap.id = 'cgv-sniper-settings';
  Object.assign(wrap.style, {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    background: 'rgba(0,0,0,0.7)', zIndex: 1000001,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: '-apple-system,sans-serif',
  });

  const box = document.createElement('div');
  Object.assign(box.style, {
    background: '#1a1a2e', border: '1px solid #333', borderRadius: '14px',
    padding: '20px', width: '320px', maxWidth: '90%', color: '#fff',
  });
  const title = document.createElement('h3');
  Object.assign(title.style, { margin: '0 0 12px', fontSize: '15px', color: '#e94560' });
  title.textContent = 'Telegram 알림 설정';
  box.appendChild(title);

  const mkInput = (ph, val) => {
    const i = document.createElement('input');
    i.placeholder = ph;
    i.value = val || '';
    Object.assign(i.style, {
      width: '100%', boxSizing: 'border-box', margin: '0 0 8px', padding: '10px',
      borderRadius: '8px', border: '1px solid #444', background: '#16213e',
      color: '#fff', fontSize: '13px',
    });
    return i;
  };
  const tokenIn = mkInput('Bot Token (예: 123456:ABC-DEF...)', cfg.telegramBotToken);
  const chatIn = mkInput('Chat ID (예: 123456789)', cfg.telegramChatId);
  box.appendChild(tokenIn);
  box.appendChild(chatIn);

  const result = document.createElement('div');
  Object.assign(result.style, { fontSize: '12px', minHeight: '16px', margin: '0 0 10px', color: '#888' });
  box.appendChild(result);

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px' });
  const mkBtn = (label, primary) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      flex: '1', padding: '10px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
      border: primary ? 'none' : '1px solid #444',
      background: primary ? '#e94560' : 'transparent',
      color: primary ? '#fff' : '#aaa',
    });
    return b;
  };
  const testBtn = mkBtn('테스트 전송', false);
  const saveBtn = mkBtn('저장', true);
  const closeBtn = mkBtn('닫기', false);

  const current = () => ({
    telegramBotToken: tokenIn.value.trim(),
    telegramChatId: chatIn.value.trim(),
  });

  testBtn.addEventListener('click', async () => {
    result.textContent = '전송 중...';
    const r = await sendTelegram('CGV 좌석 스나이퍼 테스트 메시지입니다.', current());
    result.textContent = r.skipped
      ? 'token/chat_id를 입력하세요.'
      : (r.ok ? '전송 성공! Telegram을 확인하세요.' : '전송 실패: ' + (r.error || 'API 오류'));
  });
  saveBtn.addEventListener('click', () => {
    saveConfig(current());
    result.textContent = '저장되었습니다.';
  });
  closeBtn.addEventListener('click', () => wrap.remove());

  row.appendChild(testBtn);
  row.appendChild(saveBtn);
  row.appendChild(closeBtn);
  box.appendChild(row);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
}
```

- [ ] **Step 3: Node import 검증**

Run:
```bash
node -e "Promise.all([import('./src/ui/panel.js'),import('./src/ui/settings.js')]).then(([p,s])=>console.log('imports OK:',typeof p.createPanel,typeof s.showSettings))"
```
Expected: `imports OK: function function`

- [ ] **Step 4: Commit**

```bash
git add src/ui/panel.js src/ui/settings.js
git commit -m "feat: 감시 패널 + Telegram 설정 모달 UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: ui/picker.js — 좌석 후보 선택 오버레이 (인원 토글)

**Files:**
- Create: `src/ui/picker.js`

**Interfaces:**
- Consumes: `sleep` (Task 3), `collectSeats` (Task 5), `selectAdults` (Task 5)
- Produces:
  - `showPicker(initialSeats: {label,col,row,sold}[], initialPeople: number): Promise<{targets: string[], people: number} | null>`
  - 확정 버튼은 `selected.length >= people`일 때만 활성화. 인원 토글 시 `selectAdults(n)` → 재수집 → 그리드 재렌더 (disabled 기준이 인원수에 따라 달라짐 — 스펙 실험 1번)

- [ ] **Step 1: 구현**

`src/ui/picker.js`:
```js
import { sleep } from '../dom.js';
import { collectSeats } from '../seatmap.js';
import { selectAdults } from '../visitors.js';

const CHIP = 30;   /* 좌석 칩 크기(px) */
const GAP = 2;
const LABEL_W = 24; /* 행 라벨 열 너비(px) */

export function showPicker(initialSeats, initialPeople){
  return new Promise(resolve => {
    document.getElementById('cgv-sniper-overlay')?.remove();

    let seats = initialSeats;
    let people = initialPeople || 1;
    let selected = [];

    const ov = document.createElement('div');
    ov.id = 'cgv-sniper-overlay';
    Object.assign(ov.style, {
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.85)', zIndex: 999999,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      fontFamily: '-apple-system,sans-serif', color: '#fff', overflow: 'hidden',
    });

    const hdr = document.createElement('div');
    Object.assign(hdr.style, { textAlign: 'center', padding: '16px 16px 4px', flexShrink: '0', width: '100%' });
    hdr.innerHTML = '<h2 style="margin:0 0 4px;font-size:17px;color:#e94560">좌석 스나이퍼</h2>'
      + '<p style="margin:0;font-size:12px;color:#888">잡고 싶은 좌석을 우선순위 순으로 터치하세요</p>';
    ov.appendChild(hdr);

    /* 인원 토글 */
    const peopleWrap = document.createElement('div');
    Object.assign(peopleWrap.style, { display: 'flex', gap: '8px', justifyContent: 'center', padding: '4px 0 8px', flexShrink: '0' });
    const peopleBtns = [1, 2].map(n => {
      const b = document.createElement('button');
      b.textContent = n + '명';
      Object.assign(b.style, {
        padding: '6px 18px', borderRadius: '16px', border: '1px solid #e94560',
        background: 'transparent', color: '#e94560', fontSize: '13px', cursor: 'pointer',
      });
      b.addEventListener('click', () => setPeople(n));
      peopleWrap.appendChild(b);
      return b;
    });
    ov.appendChild(peopleWrap);

    const status = document.createElement('div');
    Object.assign(status.style, {
      padding: '6px 16px', margin: '0 16px 8px', background: '#16213e',
      borderRadius: '8px', fontSize: '13px', color: '#e94560',
      textAlign: 'center', minHeight: '18px', wordBreak: 'break-all', flexShrink: '0',
    });
    ov.appendChild(status);

    const mapWrap = document.createElement('div');
    Object.assign(mapWrap.style, {
      flex: '1', overflow: 'auto', padding: '8px',
      WebkitOverflowScrolling: 'touch', width: '100%',
    });
    ov.appendChild(mapWrap);

    const legend = document.createElement('div');
    Object.assign(legend.style, { display: 'flex', gap: '16px', justifyContent: 'center', padding: '8px', fontSize: '11px', color: '#888', flexShrink: '0' });
    legend.innerHTML =
      '<span><span style="display:inline-block;width:10px;height:10px;background:#4a1a1a;border-radius:2px;vertical-align:middle;margin-right:3px"></span>선택불가(매진 포함)</span>'
      + '<span><span style="display:inline-block;width:10px;height:10px;background:#1a3a5c;border-radius:2px;vertical-align:middle;margin-right:3px"></span>선택가능</span>'
      + '<span><span style="display:inline-block;width:10px;height:10px;background:#e94560;border-radius:2px;vertical-align:middle;margin-right:3px"></span>내 후보</span>';
    ov.appendChild(legend);

    const bw = document.createElement('div');
    Object.assign(bw.style, { display: 'flex', gap: '10px', padding: '12px 16px 20px', width: '100%', maxWidth: '460px', flexShrink: '0' });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    Object.assign(cancelBtn.style, {
      flex: '1', padding: '14px', border: '1px solid #444', borderRadius: '10px',
      background: 'transparent', color: '#aaa', fontSize: '15px', cursor: 'pointer',
    });
    cancelBtn.addEventListener('click', () => { ov.remove(); resolve(null); });
    const confirmBtn = document.createElement('button');
    Object.assign(confirmBtn.style, {
      flex: '2', padding: '14px', border: 'none', borderRadius: '10px',
      background: '#e94560', color: '#fff', fontSize: '15px', fontWeight: 'bold',
      cursor: 'pointer', transition: 'opacity 0.15s',
    });
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      ov.remove();
      resolve({ targets: [...selected], people });
    });
    bw.appendChild(cancelBtn);
    bw.appendChild(confirmBtn);
    ov.appendChild(bw);

    function updateStatus(){
      status.textContent = selected.length
        ? selected.map((t, i) => (i + 1) + '.' + t).join('  ')
        : (people === 2
          ? '후보를 2개 이상 선택하세요 (빈 2석 확보 시 점유, 인접 보장 없음)'
          : '선택된 좌석 없음');
      const ok = selected.length >= people;
      confirmBtn.disabled = !ok;
      confirmBtn.style.opacity = ok ? '1' : '0.4';
      confirmBtn.textContent = '감시 시작 (' + people + '명)';
      peopleBtns.forEach((b, i) => {
        const on = (i + 1) === people;
        b.style.background = on ? '#e94560' : 'transparent';
        b.style.color = on ? '#fff' : '#e94560';
      });
    }

    function renderGrid(){
      mapWrap.textContent = '';
      const screen = document.createElement('div');
      Object.assign(screen.style, { textAlign: 'center', color: '#555', fontSize: '11px', marginBottom: '8px', letterSpacing: '4px' });
      screen.textContent = 'SCREEN';
      mapWrap.appendChild(screen);

      if (!seats.length){
        const empty = document.createElement('p');
        empty.textContent = '좌석을 찾을 수 없습니다.';
        empty.style.textAlign = 'center';
        mapWrap.appendChild(empty);
        return;
      }

      const maxCol = Math.max(...seats.map(s => s.col));
      const maxRow = Math.max(...seats.map(s => s.row));
      const rowLabelMap = {};
      seats.forEach(s => { rowLabelMap[s.row] = s.label.replace(/[0-9]/g, ''); });

      const grid = document.createElement('div');
      Object.assign(grid.style, {
        display: 'grid',
        gridTemplateColumns: LABEL_W + 'px repeat(' + (maxCol + 1) + ', ' + CHIP + 'px) ' + LABEL_W + 'px',
        gridTemplateRows: 'repeat(' + (maxRow + 1) + ', ' + CHIP + 'px)',
        gap: GAP + 'px', width: 'fit-content', margin: '0 auto',
      });

      Object.entries(rowLabelMap).forEach(([row, label]) => {
        [1, maxCol + 3].forEach(col => {
          const lbl = document.createElement('div');
          lbl.textContent = label;
          Object.assign(lbl.style, {
            gridColumn: col, gridRow: parseInt(row, 10) + 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', color: '#666', fontWeight: 'bold',
          });
          grid.appendChild(lbl);
        });
      });

      const chipMap = {};
      seats.forEach(s => {
        const chip = document.createElement('button');
        const paintBase = () => {
          chip.style.background = s.sold ? '#4a1a1a' : '#1a3a5c';
          chip.style.color = s.sold ? '#ff6b6b' : '#7bb8e0';
          chip.textContent = s.label;
        };
        Object.assign(chip.style, {
          gridColumn: s.col + 2, /* +2: 라벨열 1칸 오프셋 */
          gridRow: s.row + 1,
          width: CHIP + 'px', height: CHIP + 'px',
          border: 'none', borderRadius: '4px', fontSize: '8px', cursor: 'pointer',
          padding: '0', lineHeight: CHIP + 'px', textAlign: 'center',
          transition: 'background 0.1s',
        });
        paintBase();
        chip.addEventListener('click', () => {
          const idx = selected.indexOf(s.label);
          if (idx >= 0){
            selected.splice(idx, 1);
            paintBase();
            selected.forEach((t, i) => {
              const c = chipMap[t];
              if (c) c.textContent = '[' + (i + 1) + ']';
            });
          } else {
            selected.push(s.label);
            chip.style.background = '#e94560';
            chip.style.color = '#fff';
            chip.textContent = '[' + selected.length + ']';
          }
          updateStatus();
        });
        chipMap[s.label] = chip;
        grid.appendChild(chip);
      });
      mapWrap.appendChild(grid);
    }

    async function setPeople(n){
      if (n === people){ updateStatus(); return; }
      people = n;
      selected = [];
      status.textContent = '인원 변경 중...';
      try {
        await selectAdults(n);       /* 전체화면 뒤에서도 클릭 가능 (v1 검증) */
        await sleep(800);            /* 좌석맵 disabled 재계산 대기 */
        seats = collectSeats();
      } catch (e) {
        status.textContent = '인원 변경 실패: ' + e.message;
      }
      renderGrid();
      updateStatus();
    }

    renderGrid();
    updateStatus();
    document.body.appendChild(ov);
  });
}
```

- [ ] **Step 2: Node import 검증**

Run:
```bash
node -e "import('./src/ui/picker.js').then(m=>console.log('import OK:',typeof m.showPicker))"
```
Expected: `import OK: function`

- [ ] **Step 3: Commit**

```bash
git add src/ui/picker.js
git commit -m "feat: 좌석 후보 선택 오버레이 (1명/2명 인원 토글, 인원별 disabled 재수집)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: claim.js + monitor.js

**Files:**
- Create: `src/claim.js`, `src/monitor.js`

**Interfaces:**
- Consumes: `sleep`, `SEL`, `jitter`, `seatLabel` (Task 3), `selectAdults` (Task 5), `findSeatButton`/`activeSeats`/`enabledCandidates` (Task 5), `notifySuccess`/`notifyAbort`/`showNoti` (Task 6), `createPanel` (Task 7), `showSettings` (Task 7)
- Produces:
  - `deselectAll(): Promise<void>` — active 좌석 전부 해제 (쌍 해제 대응 반복)
  - `adjustSelection(targets: string[]): Promise<boolean>` — actives를 targets와 일치시키도록 한 클릭씩 조정, 최대 8회
  - `tryClaim(picks: string[], people: number, candidates?: string[]): Promise<string[] | null>` — 성공 시 실제 점유 좌석 배열, 실패 시 null (실패 시 선택 상태 클린업 보장)
  - `startMonitoring(targets: string[], people: number): Promise<void>` — `window.__cgvSniper = {stop}` 등록

- [ ] **Step 1: claim.js 구현**

핵심 로직 근거 (스펙 "실험으로 검증된 CGV 동작" 2·3·5번):
- 2인 모드에서 좌석 클릭 시 인접 좌석이 자동으로 함께 선택될 수 있다(자동 쌍).
- 자동 쌍으로 선택된 2석이 모두 후보(candidates) 안에 있으면 그대로 인정한다 — 목표 조합 강제보다 성공 확률이 높다.
- 선택된 좌석 클릭 시 쌍 전체가 해제될 수 있으므로 매 클릭 후 상태를 재확인한다.

`src/claim.js`:
```js
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
  const selectionOk = () => {
    const labels = activeSeats().map(seatLabel);
    return labels.length === people && labels.every(l => candidates.includes(l));
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
```

- [ ] **Step 2: monitor.js 구현**

`src/monitor.js`:
```js
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
```

- [ ] **Step 3: Node import 검증**

Run:
```bash
node -e "Promise.all([import('./src/claim.js'),import('./src/monitor.js')]).then(([c,m])=>console.log('imports OK:',typeof c.tryClaim,typeof c.adjustSelection,typeof c.deselectAll,typeof m.startMonitoring))"
```
Expected: `imports OK: function function function function`

- [ ] **Step 4: Commit**

```bash
git add src/claim.js src/monitor.js
git commit -m "feat: 감시 루프 + 점유 로직 (자동 쌍 보정, 후보 내 조합 인정, 실패 클린업)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: index.js 최종 조립 + v1 파일 제거

**Files:**
- Modify: `src/index.js` (Task 2의 스텁 전체 교체)
- Delete: `bookmarklet.js`, `bookmarklet.min.js` (루트 v1 파일 — dist/로 대체됨)

**Interfaces:**
- Consumes: `runGuard` (Task 4), `selectAdults` (Task 5), `openSeatMap`/`collectSeats` (Task 5), `showPicker` (Task 8), `startMonitoring` (Task 9)

- [ ] **Step 1: index.js 최종본 작성 (스텁 전체 교체)**

`src/index.js`:
```js
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
```

- [ ] **Step 2: 빌드 + 산출물 검증**

Run: `npm run build`
Expected: 성공, `dist/bookmarklet.min.js` 크기 대략 10~25KB 범위 (북마크 URL로 등록 가능한 크기)

Run: `node -e "const s=require('fs').readFileSync('dist/bookmarklet.min.js','utf8'); if(!s.startsWith('javascript:void(')||s.includes('\n')){console.log('FAIL');process.exit(1)} console.log('URL format OK,', s.length, 'bytes')"`
Expected: `URL format OK, <크기> bytes`

- [ ] **Step 3: v1 파일 제거**

```bash
git rm bookmarklet.js bookmarklet.min.js
```

- [ ] **Step 4: Commit**

```bash
git add src/index.js dist/
git commit -m "feat: v2 진입점 조립, v1 단일 파일 제거 (dist/ 산출물로 대체)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: 실페이지 스모크 테스트 (agent-browser, 사용자 협조 필요)

**Files:**
- Modify: 발견된 버그에 따라 해당 src 모듈 (수정 시 해당 모듈 재커밋)

**Interfaces:**
- Consumes: `dist/bookmarklet.js` (readable 번들 — 콘솔 주입용)

이 태스크는 실제 CGV 페이지가 필요하다. **사용자에게 CGV 로그인과 예매 컨텍스트(영화·극장·회차 선택) 준비를 요청**한 후 진행한다. `agent-browser eval`로 `"$(cat dist/bookmarklet.js)"`를 주입한다 (소스에 backtick이 없으므로 셸 주입 안전 — Global Constraints).

- [ ] **Step 1: 가드 — 타 도메인**

```bash
agent-browser open https://example.com
agent-browser eval "window.confirm = m => { window.__lastConfirm = m; return false; };"
agent-browser eval "$(cat dist/bookmarklet.js)"
agent-browser eval "window.__lastConfirm"
```
Expected: `"CGV 예매 페이지로 이동할까요?"` (confirm 스텁이 false를 반환하므로 이동하지 않음)

- [ ] **Step 2: 가드 — cgv.co.kr 내 다른 페이지**

```bash
agent-browser open https://cgv.co.kr/cnm/movieBook
agent-browser eval "window.confirm = m => { window.__lastConfirm = m; return false; };"
agent-browser eval "$(cat dist/bookmarklet.js)"
agent-browser eval "window.__lastConfirm"
```
Expected: `"예매 페이지로 이동합니다.\n영화·극장·회차 선택 후 좌석선택 화면에서 다시 실행하세요."`

- [ ] **Step 3: 좌석선택 페이지 — picker 렌더링 확인**

사용자가 좌석선택 페이지(`/cnm/selectVisitorCnt`)에 진입한 상태에서:
```bash
agent-browser eval "$(cat dist/bookmarklet.js)"
sleep 8
agent-browser screenshot picker_1p.png
```
Expected: 오버레이(제목 "좌석 스나이퍼", 인원 토글 [1명][2명], 좌석 그리드, 범례, 취소/감시 시작 버튼) 표시. 스크린샷으로 확인.

- [ ] **Step 4: 인원 토글 2명 → disabled 변화 확인**

```bash
agent-browser eval "document.querySelectorAll('#cgv-sniper-overlay button')[1].click()"
sleep 3
agent-browser screenshot picker_2p.png
agent-browser eval "(() => { const ov=document.getElementById('cgv-sniper-overlay'); return ov ? 'overlay OK' : 'FAIL'; })()"
```
Expected: `overlay OK`, 그리드가 재렌더됨. 혼잡한 상영관이면 1인↔2인 간 선택가능 좌석 수가 달라지는지 스크린샷 비교.

- [ ] **Step 5: 자동 쌍 해제 동작 특성 확인 (adjustSelection 가정 검증)**

2명 토글 상태에서 (picker 오버레이는 사이트 좌석맵 위에 떠 있으므로, 오버레이를 취소로 닫은 뒤 사이트 좌석맵에서 직접 실행):
```bash
agent-browser eval "(() => { const b=[...document.querySelectorAll('#cgv-sniper-overlay button')].find(x=>x.textContent==='취소'); b?.click(); return 'closed'; })()"
agent-browser eval "(() => { const mm=document.querySelector('.react-transform-component [class*=seatPositionWrap]'); const ss=[...mm.querySelectorAll('button[class*=seatNumber]')].filter(el=>!el.disabled); ss[0].click(); return 'clicked ' + ss[0].textContent.trim(); })()"
sleep 2
agent-browser eval "(() => { const mm=document.querySelector('.react-transform-component [class*=seatPositionWrap]'); const act=[...mm.querySelectorAll('button[class*=seatNumber]')].filter(el=>el.className.includes('active')); if(act.length<2) return 'no auto-pair (단독 선택)'; act[1].click(); return 'clicked auto-added: ' + act[1].textContent.trim(); })()"
sleep 2
agent-browser eval "(() => { const mm=document.querySelector('.react-transform-component [class*=seatPositionWrap]'); return 'actives after: ' + [...mm.querySelectorAll('button[class*=seatNumber]')].filter(el=>el.className.includes('active')).map(el=>el.textContent.trim()).join(','); })()"
```
Expected 기록: 자동 추가된 좌석 클릭 시 **그 좌석만 해제되는지 / 쌍 전체가 해제되는지**. 쌍 전체가 해제되고 비인접 후보 2석 조정이 8회 내 수렴하지 못하는 패턴이 관찰되면 `adjustSelection`의 클릭 순서를 조정(missing 우선 → 1슬롯 상태 만들기)하고 재검증한다. 테스트 후 active 좌석을 모두 해제해 정리한다.

- [ ] **Step 6: Telegram 테스트 전송 (선택)**

사용자가 bot token/chat_id를 제공하는 경우에만: 감시 패널 ⚙️ → 값 입력 → [테스트 전송] → Telegram 수신 확인 → [저장]. 제공하지 않으면 스킵 (미설정 시 로컬 알림만 동작하는 것 확인).

- [ ] **Step 7: 수정 사항 커밋**

발견된 버그 수정 후:
```bash
npm run build
git add -A
git commit -m "fix: 실페이지 스모크 테스트 반영

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
(수정 사항이 없으면 이 단계는 스킵)

---

### Task 12: README.md 재작성

**Files:**
- Modify: `README.md` (전체 교체)

- [ ] **Step 1: README.md 전체 교체**

```markdown
# CGV 좌석 스나이퍼 Bookmarklet

CGV 영화 예매 시 이미 매진된 인기 좌석의 **취소표를 자동으로 감지하여 점유**해주는 JavaScript Bookmarklet입니다. 1인/2인 예매를 지원하며, 점유 성공 시 Telegram으로도 알림을 받을 수 있습니다.

## 동작 원리

1. **가드** — CGV 좌석선택 페이지가 아니면 확인 후 예매 페이지로 이동시켜 줍니다
2. **인원 선택** — 실행 시 1명/2명 선택 (기본 1명)
3. **좌석 후보 선택** — 전체화면 좌석맵 기반 UI에서 잡고 싶은 좌석을 우선순위 순으로 선택 (매진 좌석 포함)
4. **자동 감시** — 페이지 새로고침 버튼을 주기적(5초 ± 1초)으로 클릭하며 후보 좌석의 가용 여부 확인
5. **자동 점유** — 빈 자리 발견 시(2인은 빈 2석 확보 시) 즉시 클릭 → 선택완료 → 서버 점유
6. **알림** — 비프음 + 진동 + 화면 알림 + Telegram(설정 시)

## 설치

### 1. 빌드

\`\`\`bash
npm install
npm run build
\`\`\`

### 2. Bookmarklet 등록

`dist/bookmarklet.min.js` 파일 내용 **전체**를 복사해 북마크 URL로 등록합니다. (`javascript:` 접두어가 이미 포함된 완성된 URL입니다.)

> **모바일**: 임의 페이지를 북마크 → 편집에서 URL을 교체

## 사용 방법

1. CGV에서 영화·극장·일시·회차를 선택하여 **좌석선택 페이지**에 진입
   - 다른 페이지에서 실행하면 확인 후 예매 페이지로 이동시켜 줍니다
2. Bookmarklet 실행
3. 전체화면 좌석맵이 열리고 **좌석 후보 선택 UI** 표시
4. 상단에서 **인원(1명/2명)** 선택 — 인원에 따라 선택 가능 좌석이 달라집니다
5. 잡고 싶은 좌석을 **우선순위 순서대로** 터치/클릭 (2명은 2개 이상 선택)
6. **[감시 시작]** 클릭
7. 하단 패널에서 감시 상태 확인, **⚙️ 알림설정**에서 Telegram 설정 가능
8. 빈 자리 발견 시 자동 점유 → 알림 수신 후 **결제를 진행하세요!**

### 감시 중지

하단 패널의 **[중지]** 버튼.

## Telegram 알림 설정

1. Telegram에서 [@BotFather](https://t.me/BotFather)로 봇 생성 → **Bot Token** 획득
2. 생성한 봇과 대화 시작(아무 메시지 전송) 후 `https://api.telegram.org/bot<TOKEN>/getUpdates` 에서 **chat id** 확인
3. 감시 패널 **⚙️ 알림설정**에 입력 → [테스트 전송]으로 확인 → [저장]
4. 설정은 브라우저 localStorage(cgv.co.kr)에 저장되며, 점유 성공/감시 중단 시 메시지가 전송됩니다

## 2인 예매 동작

- 후보 좌석 중 **빈 좌석 2개가 확보되는 순간** 우선순위 상위 2석을 점유합니다 (인접 보장 없음)
- CGV는 2인 모드에서 좌석 클릭 시 인접 좌석을 자동으로 함께 선택하는데, 자동 선택된 조합이 후보 안에 있으면 그대로 점유하고, 아니면 목표 조합으로 자동 조정합니다

## 개발

\`\`\`bash
npm run build   # dist/ 산출물 생성
npm run watch   # src/ 변경 감지 자동 재빌드
\`\`\`

- `src/` — 기능별 ESM 모듈 (진입점 `src/index.js`)
- `dist/bookmarklet.js` — readable 번들 (콘솔 디버깅용)
- `dist/bookmarklet.min.js` — 북마크 등록용 완성 URL
- 설계 문서: `docs/superpowers/specs/`

## 주의 사항

- **일반(성인) 1~2인 예매 전용**입니다
- CGV 웹사이트 구조 변경 시 동작하지 않을 수 있습니다
- 좌석 선택 규칙(1인 예매 시 외딴 좌석 차단 등)은 CGV가 상영관/혼잡도에 따라 계산하며, 이 도구는 그 결과(선택 가능 여부)를 그대로 따릅니다
- 동일 좌석을 다른 사용자가 먼저 점유할 수 있으며, 점유 실패 시 자동으로 감시를 계속합니다
- 취소 수수료, 예매 정책 등은 CGV 약관을 따르세요. 본 도구 사용의 책임은 사용자에게 있습니다
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README v2 재작성 (빌드/가드/2인/Telegram)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: CLAUDE.md 재작성

**Files:**
- Modify: `CLAUDE.md` (전체 교체)

- [ ] **Step 1: CLAUDE.md 전체 교체**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

CGV 좌석선택 페이지(`cgv.co.kr/cnm/selectVisitorCnt`)에서 매진 좌석의 취소표를 자동 감지·점유하는 bookmarklet. vanilla JS ESM 모듈을 esbuild로 IIFE 번들해 `javascript:` URL로 산출한다. 1인/2인 예매와 Telegram 알림을 지원한다.

- 설계 문서: `docs/superpowers/specs/2026-07-23-cgv-sniper-v2-design.md` — **DOM 로직의 근거인 실브라우저 실험 결과 10개 항목 포함. 좌석 관련 수정 전 필독.**

## 빌드

\`\`\`bash
npm run build   # src/ → dist/bookmarklet.js(readable) + dist/bookmarklet.min.js(javascript: URL)
npm run watch   # src/ 변경 감지 재빌드
\`\`\`

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
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md v2 재작성 (모듈 아키텍처, 검증된 제약 갱신)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 결과

- **Spec coverage**: 가드(T4·T10·T11), 2인 예매(T5 인원 일반화·T8 토글·T9 자동 쌍 보정), Telegram(T4 config·T6 전송·T7 설정 UI), 정규화(T1 git+npm·T2 빌드), v1 파일 제거(T10), 스모크 검증(T11), 문서 재작성(T12·T13) — 스펙 전 항목 매핑 확인.
- **Placeholder scan**: 모든 코드 스텝에 완전한 코드 포함. TBD/TODO 없음.
- **Type consistency**: `tryClaim → string[]|null`을 monitor가 `claimed`로 소비, `showPicker → {targets, people}|null`을 index가 소비, `createPanel(targets, people, {onStop, onSettings})`, `seatLabel`은 dom.js에서 export하고 seatmap/claim이 동일 경로에서 import — 일치 확인.
