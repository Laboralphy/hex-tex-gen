import { ashlar } from './ashlar';
import { bricks } from './bricks';
import { moss } from './moss';
import { stone } from './stone';
import type { TextureGenerator } from './types';

export { ashlar, bricks, moss, stone };
export { computeAshlarLayout } from './ashlar';
export type { AshlarBlock, AshlarParams, AshlarRow } from './ashlar';
export type { BricksParams } from './bricks';
export type { MossParams } from './moss';
export type { StoneParams } from './stone';
export type { BaseParams, DeepPartial, GeneratorOptions, TextureGenerator } from './types';

/**
 * All built-in generators, indexed by name.
 */
export const generators: Record<string, TextureGenerator> = Object.fromEntries(
    [ashlar, stone, bricks, moss].map((g) => [g.name, g as TextureGenerator]),
);
