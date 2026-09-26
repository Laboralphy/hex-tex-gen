import type { ColorRGBAStruct } from '@laboralphy/rainbow';
import { mixRGBA } from '../../core/palette';

/**
 * Wood turned silver-grey by the weather: slightly blue, a bit lighter than the wood.
 * @param amount in [0, 1]: 0 leaves the color, 1 is fully weathered
 */
export function weatherWood(rgba: ColorRGBAStruct, amount: number): ColorRGBAStruct {
    const l = 0.3 * rgba.r + 0.59 * rgba.g + 0.11 * rgba.b;
    return mixRGBA(rgba, { r: l * 1.05, g: l * 1.08, b: l * 1.12, a: rgba.a }, amount);
}
