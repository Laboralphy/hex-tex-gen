import { pickFloat, pickWeighted } from './pick';
import { SALT_LIQUID, SALT_LIQUID_ALPHA, SALT_LIQUID_GLOSS } from './salts';

/** a liquid splashed on walls: its color, and [min, max] alpha and gloss */
type LiquidKind = { color: string; alpha: [number, number]; gloss: [number, number] };

/** the liquids ambiances draw from */
export const LIQUIDS = {
    blood: { color: '#5a1e12', alpha: [0.8, 0.95], gloss: [0.15, 0.35] },
    oldBlood: { color: '#3a1510', alpha: [0.75, 0.9], gloss: [0, 0.08] },
    slime: { color: '#4f7a1c', alpha: [0.65, 0.85], gloss: [0.3, 0.5] },
    water: { color: '#26404a', alpha: [0.5, 0.7], gloss: [0.3, 0.5] },
    ichor: { color: '#15130f', alpha: [0.8, 0.95], gloss: [0.2, 0.4] },
    wine: { color: '#4a0d24', alpha: [0.7, 0.85], gloss: [0.25, 0.45] },
} satisfies Record<string, LiquidKind>;

/**
 * Draws the liquid of a theme: a kind of liquid, each as likely as its weight, with its
 * alpha and gloss drawn in its ranges. The result is the `liquid` group of `splatter`.
 */
export function drawLiquid(
    weights: readonly (readonly [keyof typeof LIQUIDS, number])[],
    seed: number,
): Record<string, unknown> {
    const liquid: LiquidKind = LIQUIDS[pickWeighted(weights, seed, SALT_LIQUID)];
    return {
        color: liquid.color,
        alpha: pickFloat(liquid.alpha[0], liquid.alpha[1], seed, SALT_LIQUID_ALPHA),
        gloss: pickFloat(liquid.gloss[0], liquid.gloss[1], seed, SALT_LIQUID_GLOSS),
    };
}
