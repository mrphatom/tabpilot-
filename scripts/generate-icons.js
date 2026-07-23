import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('public/favicon.svg', 'utf-8');

if (!existsSync('public/icons')) mkdirSync('public/icons', { recursive: true });

const sizes = [16, 48, 128];
for (const size of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  writeFileSync(`public/icons/icon${size}.png`, resvg.render().asPng());
}

console.log('Icons generated: 16, 48, 128');
