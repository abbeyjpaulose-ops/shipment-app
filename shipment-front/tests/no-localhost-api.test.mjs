import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..', 'src');

function collectFiles(dir, extensions, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, extensions, acc);
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  }
  return acc;
}

const files = collectFiles(SRC_DIR, new Set(['.ts', '.html', '.scss', '.css']));
const offenders = [];

for (const filePath of files) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes('http://localhost:3000/api')) {
    offenders.push(path.relative(path.resolve(__dirname, '..'), filePath));
  }
}

assert.equal(
  offenders.length,
  0,
  `Found hardcoded localhost API URLs in:\n${offenders.join('\n')}`
);

console.log('no-localhost-api.test.mjs passed');
