import { ashlar } from './ashlar';
import { bricks } from './bricks';
import { moss } from './moss';
import { stone } from './stone';
import type { TextureGenerator } from './types';

export { ashlar, bricks, moss, stone };
export { ashlarSchema, ashlarWear, computeAshlarLayout } from './ashlar';
export { bricksSchema } from './bricks';
export { mossSchema } from './moss';
export { stoneSchema } from './stone';
export type { AshlarBlock, AshlarParams, AshlarRow, AshlarWear } from './ashlar';
export type { BricksParams } from './bricks';
export type { MossParams } from './moss';
export type { StoneParams } from './stone';
export { defineGenerator } from './define';
export type { GeneratorDefinition } from './define';
export type {
    BaseParams,
    GeneratorOptions,
    ParamsSchema,
    RenderContext,
    TextureGenerator,
} from './types';

/**
 * All built-in generators, indexed by name.
 */
export const generators: Record<string, TextureGenerator> = Object.fromEntries(
    [ashlar, stone, bricks, moss].map((g) => [g.name, g as unknown as TextureGenerator]),
);
