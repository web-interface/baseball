// 보유 카드 저장소 시험 실행 — scripts/inventory.test.ts 를 esbuild 로 한 파일로 묶어 node 로 돌린다 (vitest 없이)
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** vite 의 import.meta.glob('<한 파일>', { eager: true, import: 'default' }) 을 보통 import 로 (node 에는 없음) */
const viteGlob = {
  name: 'vite-glob-eager',
  setup(b) {
    b.onLoad({ filter: /src[\\/].*\.tsx?$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      if (!src.includes('import.meta.glob(')) return undefined;
      let n = 0;
      const heads = [];
      const body = src.replace(/import\.meta\.glob\(\s*'([^'*]+)'\s*,\s*\{\s*eager:\s*true,\s*import:\s*'default'\s*\}\s*\)/g, (_, file) => {
        const v = `__glob${n++}`;
        heads.push(`import ${v} from '${file}';`);
        return `{ '${file}': ${v} }`;
      }).replace(/import\.meta\.glob\(\s*'[^']+'\s*\)/g, '({})');
      return { contents: heads.join('\n') + '\n' + body, loader: args.path.endsWith('x') ? 'tsx' : 'ts' };
    });
  },
};

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'bb-inv-test-'));
const out = join(dir, 'inventory.test.mjs');
try {
  await build({
    entryPoints: [join(here, 'inventory.test.ts')],
    bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: out, logLevel: 'error',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env': '{"DEV":false}' },
    loader: { '.css': 'empty' },
    plugins: [viteGlob],
  });
  await import(pathToFileURL(out).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
