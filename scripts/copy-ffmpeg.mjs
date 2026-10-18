import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('node_modules/@ffmpeg/core/dist/umd');
const destination = resolve('public/ffmpeg');

if (!existsSync(source)) {
  throw new Error('No se encontró @ffmpeg/core. Ejecuta npm install antes de compilar.');
}
mkdirSync(destination, { recursive: true });
for (const file of readdirSync(source)) {
  if (file.startsWith('ffmpeg-core')) {
    cpSync(resolve(source, file), resolve(destination, file));
  }
}
const required = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
for (const file of required) {
  if (!existsSync(resolve(destination, file))) {
    throw new Error('Falta el archivo local de FFmpeg: ' + file);
  }
}
console.log('Archivos FFmpeg copiados para uso sin conexión.');
