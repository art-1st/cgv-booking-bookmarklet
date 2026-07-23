import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const common = {
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  charset: 'utf8',
  write: false,
  /* minifier가 \n 이스케이프 문자열을 실제 개행이 든 template literal로
     바꾸는 것을 금지 — bookmarklet URL은 한 줄이어야 한다 */
  supported: { 'template-literal': false },
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

/* GitHub Pages 설치 페이지 — 드래그 가능한 <a href="javascript:..."> 링크 제공.
   href 속성값에 들어가므로 &, <, >, " 를 엔티티로 이스케이프(& 먼저). */
const escHtml = s => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const installHtml = [
'<!doctype html>',
'<html lang="ko">',
'<head>',
'<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>CGV 좌석 스나이퍼 설치</title>',
'<style>',
'  :root { color-scheme: dark; }',
'  * { box-sizing: border-box; }',
'  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;',
'    background: #16161f; color: #e8e8ef; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
'    line-height: 1.6; padding: 24px; }',
'  .card { width: 100%; max-width: 560px; background: #1a1a2e; border: 1px solid #2a2a40;',
'    border-radius: 18px; padding: 32px 28px; box-shadow: 0 12px 48px rgba(0,0,0,0.4); }',
'  h1 { margin: 0 0 4px; font-size: 22px; color: #e94560; }',
'  .sub { margin: 0 0 20px; color: #9aa; font-size: 14px; }',
'  .preview { display: block; width: 100%; border-radius: 10px; border: 1px solid #2a2a40; margin-bottom: 24px; }',
'  .drag-zone { text-align: center; padding: 24px; border: 2px dashed #3a3a55;',
'    border-radius: 14px; margin-bottom: 24px; }',
'  .drag-hint { margin: 0 0 16px; font-size: 13px; color: #aab; }',
'  a.bm { display: inline-block; padding: 14px 28px; background: #e94560; color: #fff !important;',
'    font-size: 16px; font-weight: 700; border-radius: 12px; text-decoration: none; cursor: grab;',
'    user-select: none; box-shadow: 0 4px 16px rgba(233,69,96,0.4); }',
'  a.bm:active { cursor: grabbing; }',
'  ol { margin: 0; padding-left: 20px; }',
'  ol li { margin-bottom: 8px; font-size: 14px; }',
'  h2 { font-size: 15px; margin: 24px 0 10px; color: #ccd; }',
'  code { background: #24243a; padding: 2px 6px; border-radius: 5px; font-size: 12px; }',
'  .note { margin-top: 24px; padding: 14px 16px; background: #24243a; border-radius: 10px;',
'    font-size: 13px; color: #99a; }',
'  a { color: #7bb8e0; }',
'</style>',
'</head>',
'<body>',
'  <div class="card">',
'    <h1>🎬 CGV 좌석 스나이퍼</h1>',
'    <p class="sub">매진된 인기 좌석의 취소표를 자동 감지·점유하는 북마클릿 (1·2인 예매 지원)</p>',
'    <img class="preview" src="preview.png" alt="CGV 좌석 스나이퍼 실행 화면">',
'    <div class="drag-zone">',
'      <p class="drag-hint">아래 버튼을 <b>북마크바로 드래그</b>하세요 👇</p>',
'      <a class="bm" href="' + escHtml(url) + '">🎬 CGV 좌석 스나이퍼</a>',
'    </div>',
'    <h2>설치 방법</h2>',
'    <ol>',
'      <li><b>데스크톱</b>: 위 버튼을 브라우저 북마크바로 드래그하세요.</li>',
'      <li><b>모바일</b>: 임의 페이지를 북마크한 뒤, 편집에서 URL을 위 버튼의 링크 주소로 교체하세요.</li>',
'    </ol>',
'    <h2>사용 방법</h2>',
'    <ol>',
'      <li>CGV에서 영화·극장·회차를 선택해 <b>좌석선택 페이지</b>에 진입합니다.</li>',
'      <li>등록한 북마크를 실행합니다. (다른 페이지면 예매 화면으로 안내합니다)</li>',
'      <li>인원(1·2명)을 고르고, 잡고 싶은 좌석을 <b>우선순위 순</b>으로 선택합니다.</li>',
'      <li><b>감시 시작</b> → 빈 자리가 나면 자동 점유하고 알림을 보냅니다.</li>',
'    </ol>',
'    <div class="note">',
'      일반(성인) 1·2인 예매 전용입니다. 좌석 점유 후 결제는 직접 진행하세요.',
'      자세한 내용과 Telegram 알림 설정은 <a href="https://github.com/art-1st/cgv-booking-bookmarklet">GitHub 저장소</a>를 참고하세요.',
'    </div>',
'  </div>',
'</body>',
'</html>',
''].join('\n');

await mkdir('docs', { recursive: true });
await writeFile('docs/index.html', installHtml);
await writeFile('docs/.nojekyll', ''); /* Jekyll 처리 비활성화 — 정적 파일 그대로 서빙 */

console.log('dist/bookmarklet.js     ' + readableCode.length + ' bytes');
console.log('dist/bookmarklet.min.js ' + url.length + ' bytes (bookmark URL)');
console.log('docs/index.html         ' + installHtml.length + ' bytes (GitHub Pages 설치 페이지)');
