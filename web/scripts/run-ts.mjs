// TS 시험 파일 하나를 esbuild 로 한 파일로 묶어 node 로 돌린다 (vitest 없이) — test-inventory.mjs 와 같은 방식.
//   node scripts/run-ts.mjs <시험.ts> [--node-paths <node_modules 폴더>] [인자…]
//   --node-paths: 다른 폴더(예: 옛 커밋 worktree)의 소스를 묶을 때 패키지를 찾을 곳
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
      }).replace(/import\.meta\.glob\(\s*'[^']+'\s*(?:,\s*\{[^}]*\})?\s*\)/g, '({})');
      return { contents: heads.join('\n') + '\n' + body, loader: args.path.endsWith('x') ? 'tsx' : 'ts' };
    });
  },
};

const args = process.argv.slice(2);
const entry = resolve(args.shift());
let nodePaths = [];
const i = args.indexOf('--node-paths');
if (i >= 0) { nodePaths = [resolve(args[i + 1])]; args.splice(i, 2); }
const dir = mkdtempSync(join(tmpdir(), 'bb-ts-test-'));
const out = join(dir, 'test.mjs');
try {
  await build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: out, logLevel: 'error', nodePaths,
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env': '{"DEV":false}' },
    loader: { '.css': 'empty' },
    plugins: [viteGlob],
  });
  process.argv = [process.argv[0], out, ...args];
  await import(pathToFileURL(out).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
