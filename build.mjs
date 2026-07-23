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
