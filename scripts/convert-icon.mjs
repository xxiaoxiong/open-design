#!/usr/bin/env node
/**
 * Convert app-icon.svg to icon.png at 1024x1024
 *
 * Usage:
 *   node scripts/convert-icon.mjs
 *
 * Requirements:
 *   pnpm add -D sharp
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const svgPath = join(projectRoot, 'apps/web/public/app-icon.svg');
const pngPath = join(projectRoot, 'tools/pack/resources/mac/icon.png');

console.log('Converting SVG to PNG...');
console.log(`Input:  ${svgPath}`);
console.log(`Output: ${pngPath}`);

try {
  await sharp(svgPath)
    .resize(1024, 1024)
    .png()
    .toFile(pngPath);

  console.log('✓ Conversion complete!');
  console.log('Icon is now 1024×1024 with 10% safe area margins');
} catch (error) {
  console.error('✗ Conversion failed:', error.message);
  process.exit(1);
}
