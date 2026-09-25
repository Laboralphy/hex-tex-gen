import { ashlar } from './ashlar';
import { banner } from './banner';
import { bricks } from './bricks';
import { moss } from './moss';
import { opening } from './opening';
import { panel } from './panel';
import { parchment } from './parchment';
import { planks } from './planks';
import { stone } from './stone';
import type { TextureGenerator } from './types';

export { ashlar, banner, bricks, moss, opening, panel, parchment, planks, stone };
export {
    ashlarSchema,
    ashlarWear,
    computeAshlarLayout,
    NO_PANEL,
    renderWall,
    WALL_ANCHORS,
    wallSchema,
} from './ashlar';
export { bannerSchema, bannerWear } from './banner';
export { bricksSchema } from './bricks';
export { mossSchema } from './moss';
export { openingSchema } from './opening';
export { panelSchema } from './panel';
export { parchmentSchema, parchmentWear } from './parchment';
export { computePlanksLayout, planksSchema, planksWear } from './planks';
export { stoneSchema } from './stone';
export type { AshlarBlock, AshlarParams, AshlarRow, AshlarWear, WallDefaults } from './ashlar';
export type { BannerParams, BannerWear } from './banner';
export type { BricksParams } from './bricks';
export type { MossParams } from './moss';
export type { OpeningParams } from './opening';
export type { PanelParams } from './panel';
export type { ParchmentParams, ParchmentWear } from './parchment';
export type { Plank, PlankColumn, PlanksParams, PlanksWear } from './planks';
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
    [ashlar, bricks, panel, planks, stone, moss, opening, parchment, banner].map((g) => [
        g.name,
        g as unknown as TextureGenerator,
    ]),
);
