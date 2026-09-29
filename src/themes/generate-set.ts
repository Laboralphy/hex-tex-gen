import { checkPatchParams } from '../compose/patch';
import { deepMerge } from '../core/object-fusion';
import { generators } from '../generators';
import { ambiances } from './ambiances';
import { pickOne } from './pick';
import { recipes } from './recipes';
import { SALT_AMBIANCE } from './salts';
import type { GenerateSetOptions, Theme, TextureSet } from './types';

/**
 * Draws the theme of a set: the ambiance given, else one drawn from the seed; explicit
 * theme values win over the drawn ones. The theme drawn for an ambiance does not depend
 * on whether the ambiance was given or drawn.
 */
export function drawTheme({ seed, ambiance, theme }: GenerateSetOptions): {
    ambiance: string;
    theme: Theme;
} {
    const name = ambiance ?? pickOne(Object.keys(ambiances), seed, SALT_AMBIANCE);
    if (!Object.hasOwn(ambiances, name)) {
        throw new Error(
            `unknown ambiance "${name}", expected one of: ${Object.keys(ambiances).join(', ')}`,
        );
    }
    const drawn = ambiances[name].theme(seed);
    const merged: Theme = theme ? deepMerge(drawn, theme) : drawn;
    const { template, ...params } = merged.wall;
    if (!Object.hasOwn(generators, template)) {
        throw new Error(`theme.wall: unknown template "${template}"`);
    }
    checkPatchParams({ template, params, source: 'theme.wall' });
    checkPatchParams({ template: 'splatter', params: { liquid: merged.liquid }, source: 'theme' });
    return { ambiance: name, theme: merged };
}

/**
 * Generates a set of textures sharing one theme from a single seed: two seeds give two
 * sets of a different look, the same seed always gives the same set. The textures are
 * texture definitions, to render with `renderTexture` or to save as texture files.
 */
export function generateSet(options: GenerateSetOptions): TextureSet {
    const { ambiance, theme } = drawTheme(options);
    const size = options.size ?? [64, 128];
    const textures = Object.fromEntries(
        recipes
            .filter((recipe) => recipe.ambiances.includes(ambiance))
            .map((recipe) => [recipe.name, recipe.build(theme, options.seed, size)]),
    );
    return { seed: options.seed, ambiance, theme, textures };
}
