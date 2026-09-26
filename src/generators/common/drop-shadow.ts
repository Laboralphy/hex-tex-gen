import { Rainbow } from '@laboralphy/rainbow';
import { mod } from '../../core/math';
import { Texture } from '../../core/Texture';

/**
 * The offset of a shadow expressed at the own size of a patch, in pixels at its rendered
 * size: never below one pixel, unless there is no shadow.
 * @param scale rendered size over own size
 */
export function scaledOffset(offset: number, scale: number): number {
    return offset > 0 ? Math.max(1, Math.round(offset * scale)) : 0;
}

/**
 * The drop shadow of a body on what is behind it, then the body over it: the light comes
 * from the top-left, so the shadow falls `offset` pixels to the bottom-right, wherever the
 * body does not cover it. It wraps around horizontally, so that tiling bodies keep tiling.
 * @param solid whether a pixel of the body, by index, casts a shadow
 * @param offset in pixels; 0 for no shadow
 * @param opacity darkness of the shadow, in [0, 1]
 */
export function dropShadow(
    body: Texture,
    solid: (i: number) => boolean,
    offset: number,
    opacity: number,
): Texture {
    const { width, height } = body;
    const texture = new Texture(width, height);
    if (offset > 0) {
        const shadowColor = Rainbow.fromRGBA({ r: 0, g: 0, b: 0, a: opacity });
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const sx = mod(x + offset, width);
                const sy = y + offset;
                if (solid(y * width + x) && sy < height && !solid(sy * width + sx)) {
                    texture.setPixel(sx, sy, shadowColor);
                }
            }
        }
    }
    return texture.draw(body, 0, 0);
}
