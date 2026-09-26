import type { ColorRGBAStruct } from '@laboralphy/rainbow';
import { mixRGBA } from '../../core/palette';

/** color faded paint and fabric tend to */
const FADED = { r: 0.78, g: 0.74, b: 0.66 };

/**
 * Paint or fabric faded by light: the color drifts towards a pale beige, keeping part of
 * its hue.
 * @param amount in [0, 1]: 0 leaves the color, 1 is fully faded
 */
export function fadeColor(rgba: ColorRGBAStruct, amount: number): ColorRGBAStruct {
    const target = {
        r: FADED.r * 0.6 + rgba.r * 0.4,
        g: FADED.g * 0.6 + rgba.g * 0.4,
        b: FADED.b * 0.6 + rgba.b * 0.4,
        a: rgba.a,
    };
    return mixRGBA(rgba, target, amount);
}
