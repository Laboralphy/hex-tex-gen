import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { Texture } from '../core/Texture';

export function encodePng(texture: Texture): Buffer {
    const png = new PNG({ width: texture.width, height: texture.height });
    png.data = Buffer.from(texture.data.buffer, texture.data.byteOffset, texture.data.byteLength);
    return PNG.sync.write(png);
}

export function writePng(texture: Texture, file: string): void {
    writeFileSync(file, encodePng(texture));
}
