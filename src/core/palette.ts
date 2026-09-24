import { Rainbow, type Color32 } from '@laboralphy/rainbow';

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
    const i = Math.round(Math.max(0, Math.min(1, t)) * (palette.length - 1));
    return palette[i];
}

/**
 * Darkens (factor < 1) or lightens (factor > 1) a color, alpha is preserved.
 */
export function shade(color: Color32, factor: number): Color32 {
    const { r, g, b, a } = Rainbow.convertToRGBA(color);
    return Rainbow.fromRGBA({ r: r * factor, g: g * factor, b: b * factor, a });
}
