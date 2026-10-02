import { Rainbow } from '@laboralphy/rainbow';
import { clamp, mod } from '../core/math';

/**
 * How a palette is varied: every color is shifted the same way, so the palette keeps its
 * gradient from darkest to lightest.
 */
export type PaletteVariation = {
    /** hue rotation, in turns: 0.1 is 36 degrees */
    hue: number;
    /** saturation factor */
    saturation: number;
    /** lightness factor */
    lightness: number;
};

/**
 * A palette with every color shifted in hue, saturation and lightness, as hex colors.
 */
export function varyPalette(palette: readonly string[], v: PaletteVariation): string[] {
    return palette.map((css) => {
        const { h, s, l, a } = Rainbow.convertToHSLA(Rainbow.parse(css));
        return Rainbow.renderHex6(
            Rainbow.fromHSLA({
                h: mod(h + v.hue, 1),
                s: clamp(s * v.saturation),
                l: clamp(l * v.lightness),
                a,
            }),
        );
    });
}

/**
 * A color darkened by a lightness factor, as a hex color.
 */
export function darken(css: string, factor: number): string {
    const { h, s, l, a } = Rainbow.convertToHSLA(Rainbow.parse(css));
    return Rainbow.renderHex6(Rainbow.fromHSLA({ h, s, l: clamp(l * factor), a }));
}

/**
 * A palette blended towards another one, color by color, as hex colors.
 * @param t in [0, 1]: 0 gives `from`, 1 gives `to`
 */
export function blendPalette(from: readonly string[], to: readonly string[], t: number): string[] {
    return from.map((css, i) => {
        const a = Rainbow.convertToRGBA(Rainbow.parse(css));
        const b = Rainbow.convertToRGBA(Rainbow.parse(to[Math.min(i, to.length - 1)]));
        return Rainbow.renderHex6(
            Rainbow.fromRGBA({
                r: a.r + (b.r - a.r) * t,
                g: a.g + (b.g - a.g) * t,
                b: a.b + (b.b - a.b) * t,
                a: a.a,
            }),
        );
    });
}
