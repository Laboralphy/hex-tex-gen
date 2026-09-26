import { Rainbow, type Color32, type ColorRGBAStruct } from '@laboralphy/rainbow';
import { clamp } from './math';

/**
 * Builds a 256-entry gradient palette from CSS color stops.
 * @param stops CSS colors spread evenly along the gradient
 */
export function createGradient(stops: string[]): Color32[] {
    if (stops.length < 2) {
        throw new Error('createGradient: at least two color stops are required');
    }
    const last = stops.length - 1;
    return Rainbow.createPalette(
        stops.map((css, i): [number, Color32] => [
            Math.round((i * 255) / last),
            Rainbow.parse(css),
        ]),
    );
}

/**
 * Picks a palette entry from a value in [0, 1].
 */
export function sample(palette: Color32[], t: number): Color32 {
    const i = Math.round(clamp(t) * (palette.length - 1));
    return palette[i];
}

/**
 * Blends a color towards another one, channels in [0, 1]; the alpha of `from` is kept.
 * @param t in [0, 1]: 0 gives `from`, 1 the color of `to`
 */
export function mixRGBA(from: ColorRGBAStruct, to: ColorRGBAStruct, t: number): ColorRGBAStruct {
    return {
        r: from.r + (to.r - from.r) * t,
        g: from.g + (to.g - from.g) * t,
        b: from.b + (to.b - from.b) * t,
        a: from.a,
    };
}

/**
 * Darkens (factor < 1) or lightens (factor > 1) a color, alpha is preserved.
 */
export function shade(color: Color32, factor: number): Color32 {
    const { r, g, b, a } = Rainbow.convertToRGBA(color);
    return Rainbow.fromRGBA({ r: r * factor, g: g * factor, b: b * factor, a });
}

/**
 * {@link shade} for a color with channels in [0, 1], made opaque: channels are clamped and
 * quantized like a pixel's.
 */
export function shadeRGBA(rgba: ColorRGBAStruct, factor: number): ColorRGBAStruct {
    return Rainbow.convertToRGBA(shade(Rainbow.fromRGBA({ ...rgba, a: 1 }), factor));
}
