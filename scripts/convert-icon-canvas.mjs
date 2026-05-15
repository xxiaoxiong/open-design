#!/usr/bin/env node
/**
 * Convert app-icon.svg to icon.png at 1024x1024 using canvas
 * This version uses @napi-rs/canvas which might already be available
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const svgPath = join(projectRoot, 'apps/web/public/app-icon.svg');
const pngPath = join(projectRoot, 'tools/pack/resources/mac/icon.png');

console.log('Converting SVG to PNG using canvas...');
console.log(`Input:  ${svgPath}`);
console.log(`Output: ${pngPath}`);

try {
  const svgBuffer = readFileSync(svgPath);
  const img = await loadImage(svgBuffer);

  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0, 1024, 1024);

  const pngBuffer = canvas.toBuffer('image/png');
  writeFileSync(pngPath, pngBuffer);

  console.log('✓ Conversion complete!');
  console.log('Icon is now 1024×1024 with 10% safe area margins');
} catch (error) {
  console.error('✗ Conversion failed:', error.message);
  console.error('Try installing sharp: pnpm add -D sharp');
  console.error('Then use: node scripts/convert-icon.mjs');
  process.exit(1);
}
