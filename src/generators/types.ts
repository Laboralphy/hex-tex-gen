import type { z } from 'zod';
import type { Texture } from '../core/Texture';

export type GeneratorOptions = {
    /** rendered width in pixels; defaults to the generator's own size */
    width?: number;
    /** rendered height in pixels; defaults to the generator's own size */
    height?: number;
    seed: number;
};

/** parameters every generator has */
export type BaseParams = {
    /** own size of the generator's output, in pixels */
    size: [number, number];
};

/** schema of a generator's parameters: every property must have a default */
export type ParamsSchema = z.ZodType<BaseParams>;

/** what a generator renders at */
export type RenderContext = {
    width: number;
    height: number;
    seed: number;
};

export interface TextureGenerator<S extends ParamsSchema = ParamsSchema> {
    readonly name: string;
    readonly description: string;
    /** parameters: types, defaults, descriptions and validation */
    readonly schema: S;
    /** default parameters: the schema applied to an empty object */
    readonly defaults: z.output<S>;
    /**
     * Transparent by design, meant to be laid over another patch: an overlay never hides
     * the anchors of the patches under it.
     */
    readonly overlay?: boolean;
    /**
     * Names and descriptions of the anchors this generator reports. `generate` fills
     * `texture.anchors[name]` with the points, in pixels at the rendered size.
     */
    readonly anchors?: Record<string, string>;
    /**
     * Validates the parameters, fills in the defaults and renders.
     * @throws ValidationError on invalid parameters
     */
    generate(options: GeneratorOptions & z.input<S>): Texture;
}
