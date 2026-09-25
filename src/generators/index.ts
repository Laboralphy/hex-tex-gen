import { ashlar } from './ashlar';
import { banner } from './banner';
import { beam } from './beam';
import { bricks } from './bricks';
import { door } from './door';
import { fieldstone } from './fieldstone';
import { metal } from './metal';
import { moss } from './moss';
import { opening } from './opening';
import { panel } from './panel';
import { parchment } from './parchment';
import { planks } from './planks';
import { stone } from './stone';
import type { TextureGenerator } from './types';

export {
    ashlar,
    banner,
    beam,
    bricks,
    door,
    fieldstone,
    metal,
    moss,
    opening,
    panel,
    parchment,
    planks,
    stone,
};
export {
    ashlarSchema,
    ashlarWear,
    computeAshlarLayout,
    checkPanelFits,
    NO_PANEL,
    panelGroup,
    panelRect,
    rectMasonry,
    renderMasonry,
    renderWall,
    WALL_ANCHORS,
    wallSchema,
} from './ashlar';
export { bannerSchema, bannerWear } from './banner';
export { beamSchema, beamWear } from './beam';
export { bricksSchema } from './bricks';
export { doorSchema } from './door';
export { fieldstoneSchema, fieldstoneWear, voronoiMasonry } from './fieldstone';
export { metalSchema, metalWear } from './metal';
export { mossSchema } from './moss';
export { openingSchema } from './opening';
export { panelSchema } from './panel';
export { parchmentSchema, parchmentWear } from './parchment';
export { computePlanksLayout, planksSchema, planksWear } from './planks';
export { stoneSchema } from './stone';
export type {
    AshlarBlock,
    AshlarParams,
    AshlarRow,
    AshlarWear,
    Masonry,
    MasonryParams,
    StoneBox,
    StoneHit,
    WallDefaults,
    WearParams,
} from './ashlar';
export type { BannerParams, BannerWear } from './banner';
export type { BeamParams, BeamWear } from './beam';
export type { BricksParams } from './bricks';
export type { DoorParams } from './door';
export type { FieldstoneParams } from './fieldstone';
export type { MetalParams, MetalWear } from './metal';
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
    [
        ashlar,
        bricks,
        panel,
        fieldstone,
        metal,
        planks,
        door,
        stone,
        moss,
        opening,
        parchment,
        banner,
        beam,
    ].map((g) => [g.name, g as unknown as TextureGenerator]),
);
