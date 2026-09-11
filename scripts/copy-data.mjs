import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const srcDir = join(root, 'files');
const publicDir = join(root, 'public', 'files');

if (!existsSync(srcDir)) {
  throw new Error(`Source data folder not found: ${srcDir}`);
}

mkdirSync(join(root, 'public'), { recursive: true });
if (existsSync(publicDir)) {
  rmSync(publicDir, { recursive: true, force: true });
}
mkdirSync(publicDir, { recursive: true });
cpSync(srcDir, publicDir, { recursive: true });
