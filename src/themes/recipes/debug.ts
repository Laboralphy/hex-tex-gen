import type { Placement } from '../../compose/types';
import type { Theme, TextureRecipe } from '../types';

/** the area of the swatches of the palette, in percent of the texture */
const SWATCHES = { x: 8, y: 4, width: 84, height: 48 };

/** the two progress bars, by the height of their top, in percent of the texture */
const BARS = [62, 78];

/** height of a bar, in percent of the texture */
const BAR = 8;

/** colors of the background, of the empty track of a bar, of its ticks and of the decor bar */
const BACKGROUND = '#101010';
const TRACK = '#3a3a3a';
const TICK = '#101010';
const DECOR = '#b0b0b0';

/** two decimals, so that the generated files stay readable */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * A rectangle of a solid color: an opening without reveals, filled with an opaque color.
 */
function rectangle(color: string, x: number, y: number, width: number, height: number): Placement {
    return {
        patch: { template: 'opening', depth: 0, back: { mode: 'color', color } },
        x: round2(x),
        y: round2(y),
        width: round2(width),
        height: round2(height),
        wrap: false,
    };
}

/**
 * The main palette of a theme: the colors of the stones, or of the wood of a wall of
 * planks; none when the wall has neither.
 */
export function mainPalette(theme: Theme): string[] {
    const wall = theme.wall as { stone?: { palette?: string[] }; wood?: { palette?: string[] } };
    return wall.stone?.palette ?? wall.wood?.palette ?? [];
}

/**
 * A progress bar from 0 to 1: its track, filled up to the value, with ticks at a quarter,
 * a half and three quarters, a pixel wide at least.
 * @param pixel the width of a pixel, in percent of the texture width
 */
function bar(y: number, value: number, color: string, pixel: number): Placement[] {
    const { x, width } = SWATCHES;
    const filled = width * Math.min(1, Math.max(0, value));
    const tick = Math.max(1.5, pixel);
    return [
        rectangle(TRACK, x, y, width, BAR),
        ...(filled > 0 ? [rectangle(color, x, y, filled, BAR)] : []),
        ...[0.25, 0.5, 0.75].map((t) =>
            rectangle(TICK, x + width * t - tick / 2, y, tick, BAR / 3),
        ),
    ];
}

/**
 * A texture to check a theme at a glance: its main palette as swatches, from the darkest
 * at the top, and two progress bars from 0 to 1, the age of the wall filled with the
 * lightest color of the palette, and the age of the decorations in grey.
 */
export const debug: TextureRecipe = {
    name: 'debug',
    description: 'the main palette of the theme as swatches, and its ages as progress bars',
    ambiances: ['dungeon', 'cave', 'interior'],
    build(theme, seed, size) {
        const palette = mainPalette(theme);
        const { x, y, width, height } = SWATCHES;
        const swatch = height / Math.max(1, palette.length);
        const wallAge = typeof theme.wall.age === 'number' ? theme.wall.age : 0;
        return {
            size,
            seed,
            background: BACKGROUND,
            patches: [
                ...palette.map((color, i) => rectangle(color, x, y + i * swatch, width, swatch)),
                ...bar(BARS[0], wallAge, palette[palette.length - 1] ?? DECOR, 100 / size[0]),
                ...bar(BARS[1], theme.decor.age, DECOR, 100 / size[0]),
            ],
        };
    },
};
