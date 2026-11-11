import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

if (manifest.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: manifest.json is ${manifest.version}, package.json is ${packageJson.version}`
  );
}

await access(path.join('dist', 'manifest.json'));
await mkdir('packages', { recursive: true });

const fileName = `markmine-${manifest.version}.zip`;
const outputPath = path.join('packages', fileName);
await rm(outputPath, { force: true });

await new Promise((resolve, reject) => {
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', resolve);
  output.on('error', reject);
  archive.on('warning', error => {
    if (error.code === 'ENOENT') {
      console.warn(error.message);
      return;
    }

    reject(error);
  });
  archive.on('error', reject);

  archive.pipe(output);
  archive.directory('dist', false);
  void archive.finalize();
});

const { size } = await stat(outputPath);
console.log(`Created ${outputPath} (${(size / 1024).toFixed(1)} KiB)`);
