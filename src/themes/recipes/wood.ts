import { varyPalette } from '../color';
import type { Theme } from '../types';

/**
 * The `wood` parameter of the beams set on a wall of planks: the wood of the planks, a
 * little darker so that the beams stand out of them; none when the wall has no wood.
 */
export function beamWood(theme: Theme): { wood?: { palette: string[] } } {
    const wood = (theme.wall.wood as { palette?: string[] } | undefined)?.palette;
    return wood
        ? { wood: { palette: varyPalette(wood, { hue: 0, saturation: 1, lightness: 0.8 }) } }
        : {};
}
