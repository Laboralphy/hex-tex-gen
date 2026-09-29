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
