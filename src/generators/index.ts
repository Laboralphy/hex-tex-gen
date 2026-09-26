import { ashlar } from './ashlar';
import { banner } from './banner';
import { bars } from './bars';
import { beam } from './beam';
import { bookshelf } from './bookshelf';
import { bricks } from './bricks';
import { chain } from './chain';
import { cobweb } from './cobweb';
import { column } from './column';
import { door } from './door';
import { entablature } from './entablature';
import { fieldstone } from './fieldstone';
import { metal } from './metal';
import { moss } from './moss';
import { opening } from './opening';
import { panel } from './panel';
import { parchment } from './parchment';
import { planks } from './planks';
import { shield } from './shield';
import { tapestry } from './tapestry';
import { glassWindow } from './window';
import type { TextureGenerator } from './types';

export {
    ashlar,
    banner,
    bars,
    beam,
    bookshelf,
    bricks,
    chain,
    cobweb,
    column,
    door,
    entablature,
    fieldstone,
    metal,
    moss,
    opening,
    panel,
    parchment,
    planks,
    shield,
    tapestry,
    glassWindow,
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
export { bannerSchema, bannerWear, hangingSchema, renderHanging } from './banner';
export { barsSchema, barsWear } from './bars';
export { beamSchema, beamWear } from './beam';
export { bookshelfSchema, bookshelfWear } from './bookshelf';
export { bricksSchema } from './bricks';
export { chainSchema, chainWear } from './chain';
export { cobwebSchema, cobwebWear } from './cobweb';
export { columnSchema, columnWear } from './column';
export { doorSchema } from './door';
export { entablatureSchema, entablatureWear } from './entablature';
export { fieldstoneSchema, fieldstoneWear, voronoiMasonry } from './fieldstone';
export { metalSchema, metalWear } from './metal';
export { mossSchema } from './moss';
export { openingSchema } from './opening';
export { panelSchema } from './panel';
export { parchmentSchema, parchmentWear } from './parchment';
export { computePlanksLayout, planksSchema, planksWear } from './planks';
export { shieldSchema, shieldWear } from './shield';
export { tapestrySchema } from './tapestry';
export { windowSchema, windowWear } from './window';
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
export type { BannerParams, BannerWear, HangingDefaults, HangingPattern } from './banner';
export type { BarsParams, BarsWear } from './bars';
export type { BeamParams, BeamWear } from './beam';
export type { BookshelfParams, BookshelfWear } from './bookshelf';
export type { BricksParams } from './bricks';
export type { ChainParams, ChainWear } from './chain';
export type { CobwebParams, CobwebWear } from './cobweb';
export type { ColumnParams, ColumnWear } from './column';
export type { DoorParams } from './door';
export type { EntablatureParams, EntablatureWear } from './entablature';
export type { FieldstoneParams } from './fieldstone';
export type { MetalParams, MetalWear } from './metal';
export type { MossParams } from './moss';
export type { OpeningParams } from './opening';
export type { PanelParams } from './panel';
export type { ParchmentParams, ParchmentWear } from './parchment';
export type { Plank, PlankColumn, PlanksParams, PlanksWear } from './planks';
export type { ShieldParams, ShieldWear } from './shield';
export type { TapestryParams } from './tapestry';
export type { WindowParams, WindowWear } from './window';
export { defineGenerator } from './define';
export type { GeneratorDefinition } from './define';
export { CATEGORIES } from './types';
export type {
    BaseParams,
    Category,
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
        bookshelf,
        moss,
        opening,
        column,
        entablature,
        bars,
        chain,
        glassWindow,
        cobweb,
        parchment,
        banner,
        tapestry,
        shield,
        beam,
    ].map((g) => [g.name, g as unknown as TextureGenerator]),
);
