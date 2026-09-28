import { ashlar } from './ashlar';
import { banner } from './banner';
import { bars } from './bars';
import { beam } from './beam';
import { bookshelf } from './bookshelf';
import { bricks } from './bricks';
import { cavewall } from './cavewall';
import { chain } from './chain';
import { cobweb } from './cobweb';
import { column } from './column';
import { dirt } from './dirt';
import { door } from './door';
import { entablature } from './entablature';
import { fieldstone } from './fieldstone';
import { grass } from './grass';
import { gravel } from './gravel';
import { metal } from './metal';
import { moss } from './moss';
import { opening } from './opening';
import { parchment } from './parchment';
import { planks } from './planks';
import { sand } from './sand';
import { shield } from './shield';
import { slot } from './slot';
import { stoneslab } from './stoneslab';
import { tapestry } from './tapestry';
import { glassWindow } from './window';
import { woodbeam } from './woodbeam';
import type { TextureGenerator } from './types';

export {
    ashlar,
    banner,
    bars,
    beam,
    bookshelf,
    bricks,
    cavewall,
    chain,
    cobweb,
    column,
    dirt,
    door,
    entablature,
    fieldstone,
    grass,
    gravel,
    metal,
    moss,
    opening,
    parchment,
    planks,
    sand,
    shield,
    slot,
    stoneslab,
    tapestry,
    glassWindow,
    woodbeam,
};
export {
    ashlarSchema,
    ashlarWear,
    computeAshlarLayout,
    checkPanelFits,
    masonryShape,
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
export { cavewallSchema } from './cavewall';
export { chainSchema, chainWear } from './chain';
export { cobwebSchema, cobwebWear } from './cobweb';
export { columnSchema, columnWear } from './column';
export { dirtSchema } from './dirt';
export { doorSchema } from './door';
export { entablatureSchema, entablatureWear } from './entablature';
export {
    fieldstoneSchema,
    fieldstoneWear,
    renderStoneField,
    stoneFieldSchema,
    voronoiMasonry,
} from './fieldstone';
export { grassSchema, grassWear } from './grass';
export { gravelSchema } from './gravel';
export { metalSchema, metalWear } from './metal';
export { mossSchema } from './moss';
export { openingSchema } from './opening';
export { parchmentSchema, parchmentWear } from './parchment';
export { computePlanksLayout, planksSchema, planksWear } from './planks';
export { sandSchema } from './sand';
export { shieldSchema, shieldWear } from './shield';
export { slotSchema, slotWear } from './slot';
export { stoneslabSchema, stoneslabWear } from './stoneslab';
export { tapestrySchema } from './tapestry';
export { windowSchema, windowWear } from './window';
export { woodbeamSchema, woodbeamWear } from './woodbeam';
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
export type { CavewallParams } from './cavewall';
export type { ChainParams, ChainWear } from './chain';
export type { CobwebParams, CobwebWear } from './cobweb';
export type { ColumnParams, ColumnWear } from './column';
export type { DirtTemplateParams } from './dirt';
export type { DoorParams } from './door';
export type { EntablatureParams, EntablatureWear } from './entablature';
export type { FieldstoneParams } from './fieldstone';
export type { GrassParams, GrassWear } from './grass';
export type { GravelParams } from './gravel';
export type { MetalParams, MetalWear } from './metal';
export type { MossParams } from './moss';
export type { OpeningParams } from './opening';
export type { ParchmentParams, ParchmentWear } from './parchment';
export type { Plank, PlankColumn, PlanksParams, PlanksWear } from './planks';
export type { SandParams } from './sand';
export type { ShieldParams, ShieldWear } from './shield';
export type { SlotParams, SlotWear } from './slot';
export type { StoneslabParams } from './stoneslab';
export type { TapestryParams } from './tapestry';
export type { WindowParams, WindowWear } from './window';
export type { WoodbeamParams } from './woodbeam';
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
        fieldstone,
        cavewall,
        dirt,
        grass,
        sand,
        gravel,
        metal,
        planks,
        door,
        bookshelf,
        moss,
        opening,
        stoneslab,
        column,
        entablature,
        slot,
        bars,
        chain,
        glassWindow,
        cobweb,
        parchment,
        banner,
        tapestry,
        shield,
        beam,
        woodbeam,
    ].map((g) => [g.name, g as unknown as TextureGenerator]),
);
