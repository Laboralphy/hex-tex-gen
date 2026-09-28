import { z } from 'zod';
import { shade } from '../core/palette';
import { ageParam, shadowGroup, size } from '../core/schema';
import { Texture } from '../core/Texture';
import { dropShadow } from './common/drop-shadow';
import { defineGenerator } from './define';
import { planks, planksSchema, planksWear, type PlanksWear } from './planks';

/**
 * Parameters of the woodbeam template: the wood of `planks`, for a single beam. The whole
 * patch is the beam and its shadow.
 */
export const woodbeamSchema = z.strictObject({
    size: size()
        .default([64, 10])
        .describe(
            'own size of the beam, its shadow included: [length, thickness] for a horizontal beam, [thickness, length] for a vertical one',
        ),
    direction: z
        .enum(['horizontal', 'vertical'])
        .default('horizontal')
        .describe('direction of the beam'),
    profile: z
        .enum(['squared', 'log'])
        .default('squared')
        .describe(
            'squared: a sawn timber, flat with bevelled edges; log: a round log, shaded across its thickness',
        ),
    bevel: planksSchema.shape.bevel.describe(
        'edges of a squared beam lit from the top-left; a log has none',
    ),
    wood: planksSchema.shape.wood,
    knots: planksSchema.shape.knots,
    shadow: shadowGroup('beam'),
    age: ageParam(),
    weathering: planksSchema.shape.weathering,
    splits: planksSchema.shape.splits,
    grime: planksSchema.shape.grime,
});

export type WoodbeamParams = z.output<typeof woodbeamSchema>;

/**
 * Resolves the wear values of a wooden beam, those of `planks`: values set in the
 * parameters win, the others are derived from `age`. Its outline stays straight.
 */
export function woodbeamWear(p: WoodbeamParams): PlanksWear {
    return planksWear({ ...planks.defaults, ...p, edges: { roughness: 0 } });
}

/**
 * Brightness of a log across its thickness, lit from the top: a cylinder, its lower side
 * in shadow.
 * @param t position across the log, from -1 (top) to 1 (bottom)
 */
function logShading(t: number): number {
    const n = Math.sqrt(Math.max(0, 1 - t * t));
    // lit above its middle, dark below, its rims darkened where the log turns away
    return (0.45 + 0.75 * (0.6 * n - 0.55 * t)) * (0.75 + 0.25 * n);
}

/**
 * The body of a horizontal beam, without shadow: a single plank running its whole length,
 * with bevelled ends.
 */
function renderBody(p: WoodbeamParams, length: number, thickness: number, seed: number): Texture {
    const log = p.profile === 'log';
    const body = planks.generate({
        seed,
        size: [length, thickness],
        direction: 'horizontal',
        lines: { count: 1, widthVariation: 0 },
        planks: { length: [1, 1] },
        gap: { size: 0 },
        bevel: log ? { ...p.bevel, size: 0 } : p.bevel,
        wood: p.wood,
        knots: p.knots,
        nails: { ratio: 0 },
        age: p.age,
        weathering: p.weathering,
        splits: p.splits,
        edges: { roughness: 0 },
        grime: p.grime,
    });
    for (let y = 0; y < thickness; ++y) {
        const across = log ? logShading(((y + 0.5) / thickness) * 2 - 1) : 1;
        for (let x = 0; x < length; ++x) {
            // bevelled ends: lit on the left, dark on the right
            const end = x === 0 ? 1.25 : x === length - 1 ? 0.7 : 1;
            if (across * end !== 1) {
                body.setPixel(x, y, shade(body.getPixel(x, y), across * end));
            }
        }
    }
    return body;
}

/**
 * A wooden support beam, horizontal or vertical: a sawn timber or a round log, casting a
 * shadow on the wall, weathering and splitting with age. Like the metal `beam`, it frames
 * alcoves and doors, or props up the galleries of a mine.
 */
export const woodbeam = defineGenerator({
    name: 'woodbeam',
    description: 'Wooden support beam, horizontal or vertical: a sawn timber or a round log',
    category: 'architecture',
    schema: woodbeamSchema,
    overlay: true,
    anchors: {
        start: 'top-left corner of the beam',
        center: 'center of the beam',
    },
    render(p, { width, height, seed }) {
        const offset = p.shadow.offset;
        const bodyWidth = Math.max(1, width - offset);
        const bodyHeight = Math.max(1, height - offset);
        // a vertical beam is a horizontal one, transposed: the lighting stays top-left
        const body =
            p.direction === 'vertical'
                ? renderBody(p, bodyHeight, bodyWidth, seed).transposed()
                : renderBody(p, bodyWidth, bodyHeight, seed);
        // the body in the top-left of the patch, its shadow in the room left around it
        const texture = dropShadow(
            new Texture(width, height).draw(body, 0, 0),
            (i) => i % width < bodyWidth && Math.floor(i / width) < bodyHeight,
            offset,
            p.shadow.opacity,
        );
        texture.anchors = {
            start: [{ x: 0, y: 0 }],
            center: [{ x: Math.floor(bodyWidth / 2), y: Math.floor(bodyHeight / 2) }],
        };
        return texture;
    },
});
