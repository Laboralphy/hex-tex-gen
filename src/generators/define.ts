import type { z } from 'zod';
import { parseWith } from '../core/schema';
import type { Texture } from '../core/Texture';
import type { ParamsSchema, RenderContext, TextureGenerator } from './types';

export type GeneratorDefinition<S extends ParamsSchema> = Omit<
    TextureGenerator<S>,
    'defaults' | 'generate'
> & {
    /** renders with validated parameters, defaults filled in */
    render(params: z.output<S>, context: RenderContext): Texture;
};

/**
 * Builds a generator from its schema and its rendering function: parameters are
 * validated and completed with their defaults before `render` is called.
 */
export function defineGenerator<S extends ParamsSchema>({
    render,
    ...definition
}: GeneratorDefinition<S>): TextureGenerator<S> {
    return {
        ...definition,
        defaults: definition.schema.parse({}),
        generate({ width, height, seed, ...params }) {
            const p = parseWith(definition.schema, params, 'parameter');
            return render(p, { width: width ?? p.size[0], height: height ?? p.size[1], seed });
        },
    };
}
