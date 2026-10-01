import type { Placement, TextureDefinition } from '../compose/types';

/**
 * A patch definition used by a theme: a template name and its parameters, as in a patch
 * file.
 */
export type ThemePatch = { template: string } & Record<string, unknown>;

/**
 * The style shared by every texture of a set, drawn once from the seed: textures built on
 * the same theme look like the same place.
 */
export type Theme = {
    /** the wall every wall texture of the set is built on */
    wall: ThemePatch;
    /** the liquid splashed on the walls: the `liquid` parameters of `splatter` */
    liquid: Record<string, unknown>;
    /** the decorations hung on the walls, such as banners */
    decor: {
        /** how worn the decorations are, in [0, 1]: 0 new, 1 ruined */
        age: number;
    };
    /**
     * a band laid over the wall right after it, in the textures showing the plain wall:
     * the entablature along the floor of interiors; none in other ambiances
     */
    trim?: Placement;
};

/**
 * Explicit theme values: deep-merged over the drawn theme, they always win. Arrays, such as
 * palettes, replace the drawn ones.
 */
export type ThemeOverrides = {
    wall?: Record<string, unknown>;
    liquid?: Record<string, unknown>;
    decor?: { age?: number };
};

/**
 * An ambiance, such as a dungeon or a cave: the ranges a seed draws a theme from.
 */
export interface Ambiance {
    readonly name: string;
    readonly description: string;
    /** draws the theme of a set from its seed */
    theme(seed: number): Theme;
}

/**
 * A kind of texture of a set, such as a plain wall or a door: builds a texture file on the
 * theme.
 */
export interface TextureRecipe {
    readonly name: string;
    readonly description: string;
    /** names of the ambiances the recipe belongs to: a cave has no window */
    readonly ambiances: readonly string[];
    /**
     * @param theme the theme of the set
     * @param seed the seed of the set: the recipe derives its own seeds from it
     * @param size the size of the texture, in pixels
     */
    build(theme: Theme, seed: number, size: [number, number]): TextureDefinition;
}

/**
 * Options of {@link generateSet}.
 */
export type GenerateSetOptions = {
    /** the seed every choice derives from */
    seed: number;
    /** ambiance name; drawn from the seed when unset */
    ambiance?: string;
    /** explicit theme values, winning over the drawn ones */
    theme?: ThemeOverrides;
    /** size of the textures, in pixels; defaults to [64, 128] */
    size?: [number, number];
};

/**
 * A set of textures sharing a theme, as texture definitions ready to render.
 */
export type TextureSet = {
    seed: number;
    ambiance: string;
    theme: Theme;
    /** texture definitions, by recipe name */
    textures: Record<string, TextureDefinition>;
};
