import { z } from 'zod';
import { color, ratio, size } from '../core/schema';

/**
 * Access to JSON definition files. The library never touches the file system itself:
 * the CLI provides a Node loader, tests and browsers can use {@link createMemoryLoader}.
 */
export interface Loader {
    /**
     * Resolves a reference found in a file.
     * @param from file containing the reference; undefined for top-level references
     * @param ref path as written in the file, relative to `from`
     * @returns an absolute, normalized path, used as a key by {@link Loader.read}
     */
    resolve(from: string | undefined, ref: string): string;
    /** reads and parses a JSON file */
    read(path: string): unknown;
}

const jsonSchemaRef = z.string().optional().describe('JSON Schema of this file, for editors');

/**
 * Content of a patch file: a template name, its parameters, and optionally a parent
 * file whose content is deep-merged under this one. Template parameters are validated
 * by the template's own schema, once the `extends` chain is merged.
 */
export const patchDefinitionSchema = z
    .looseObject({
        $schema: jsonSchemaRef,
        extends: z
            .string()
            .optional()
            .describe('parent patch file, relative to this file, deep-merged under this one'),
        template: z.string().optional().describe('generator name'),
        seed: z
            .number()
            .int()
            .optional()
            .describe('seed of this patch, unless the placement sets one'),
    })
    .describe('a patch: a template and its parameters');

export type PatchDefinition = z.input<typeof patchDefinitionSchema>;

/**
 * Places a patch on the anchor points of a previous placement, once per point.
 */
export const placementAnchorSchema = z
    .strictObject({
        to: z.string().min(1).describe('`id` of a previous placement'),
        at: z.string().min(1).describe('anchor name, declared by the template of that placement'),
        only: z
            .array(z.number().int().min(0))
            .optional()
            .describe('indices of the anchor points to use; defaults to all of them'),
        offset: z
            .tuple([z.number().int(), z.number().int()])
            .optional()
            .describe('[dx, dy] shift from each anchor point, in pixels; defaults to [0, 0]'),
    })
    .describe(
        'repeats the patch on the anchor points of a previous placement; points hidden by a later opaque placement are skipped',
    );

export type PlacementAnchor = z.output<typeof placementAnchorSchema>;

/**
 * A patch placed on a texture. Positions and sizes are percentages of the texture size.
 */
export const placementSchema = z
    .strictObject({
        patch: z
            .union([z.string(), patchDefinitionSchema])
            .describe('patch file, relative to the texture file, or inline patch definition'),
        id: z
            .string()
            .min(1)
            .optional()
            .describe('name other placements use to anchor on this one'),
        anchor: placementAnchorSchema.optional(),
        x: z
            .number()
            .optional()
            .describe('left edge, in percent of the texture width; defaults to 0'),
        y: z
            .number()
            .optional()
            .describe('top edge, in percent of the texture height; defaults to 0'),
        width: z
            .number()
            .min(0)
            .optional()
            .describe("width, in percent of the texture width; defaults to the patch's own width"),
        height: z
            .number()
            .min(0)
            .optional()
            .describe(
                "height, in percent of the texture height; defaults to the patch's own height",
            ),
        seed: z
            .number()
            .int()
            .optional()
            .describe('seed of this placement; defaults to the patch seed, else the texture seed'),
        params: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('template parameters deep-merged over the patch'),
        opacity: ratio().optional().describe('opacity, in [0, 1]; defaults to 1'),
    })
    .refine((p) => !p.anchor || (p.x === undefined && p.y === undefined), {
        message: '"x" and "y" are set by the anchor, use "anchor.offset"',
    })
    .describe('a patch placed on the texture');

export type Placement = z.output<typeof placementSchema>;

/**
 * Content of a texture file.
 */
export const textureDefinitionSchema = z
    .strictObject({
        $schema: jsonSchemaRef,
        size: size().describe('texture size, in pixels'),
        seed: z.number().int().optional().describe('global seed; defaults to 0'),
        background: color()
            .optional()
            .describe('CSS color under the patches; defaults to opaque black'),
        patches: z.array(placementSchema).describe('patches, drawn in order'),
    })
    .describe('a texture: patches placed on a canvas');

export type TextureDefinition = z.output<typeof textureDefinitionSchema>;

/**
 * A patch definition with its `extends` chain resolved and its parameters validated.
 */
export type ResolvedPatch = {
    template: string;
    seed?: number;
    params: Record<string, unknown>;
    /** where the patch comes from, for error messages */
    source: string;
};
