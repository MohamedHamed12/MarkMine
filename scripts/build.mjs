import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const entries = {
  'service-worker': 'src/background/service-worker.ts',
  content: 'src/content/index.ts',
  popup: 'src/popup.ts',
  options: 'src/options.ts',
  'converter-worker': 'src/converter/worker.ts'
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist/styles', { recursive: true });

for (const [name, entry] of Object.entries(entries)) {
  await build({
    entryPoints: [entry],
    outfile: `dist/${name}.js`,
    bundle: true,
    minify: false,
    sourcemap: true,
    target: 'chrome120',
    format: name === 'service-worker' ? 'esm' : 'iife',
    platform: 'browser'
  });
}

await Promise.all([
  cp('manifest.json', 'dist/manifest.json'),
  cp('popup.html', 'dist/popup.html'),
  cp('options.html', 'dist/options.html'),
  cp('styles', 'dist/styles', { recursive: true }),
  cp('_locales', 'dist/_locales', { recursive: true })
]);
