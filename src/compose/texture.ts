import { Rainbow } from '@laboralphy/rainbow';
import { deepMerge } from '../core/object-fusion';
import { isPlainObject } from '../core/params';
import { Texture } from '../core/Texture';
import { checkPatchParams, loadPatch, patchSize, renderPatch } from './patch';
import type { Loader, Placement, TextureDefinition } from './types';

const TEXTURE_KEYS = ['size', 'seed', 'background', 'patches'];
const PLACEMENT_KEYS = ['patch', 'x', 'y', 'width', 'height', 'seed', 'params', 'opacity'];

function checkObjectKeys(obj: Record<string, unknown>, allowed: string[], where: string): void {
    for (const key of Object.keys(obj)) {
        if (!allowed.includes(key)) {
            throw new Error(`${where}: unknown key "${key}" (allowed: ${allowed.join(', ')})`);
        }
    }
}

function checkNumber(
    value: unknown,
    where: string,
    { integer = false, min = -Infinity, max = Infinity } = {},
): void {
    if (
        value !== undefined &&
        (typeof value !== 'number' ||
            (integer && !Number.isInteger(value)) ||
            value < min ||
            value > max)
    ) {
        const kind = integer ? 'an integer' : 'a number';
        const range = max < Infinity ? ` in [${min}, ${max}]` : min > -Infinity ? ` >= ${min}` : '';
        throw new Error(`${where}: expected ${kind}${range}, got ${JSON.stringify(value)}`);
    }
}

function checkTexture(def: unknown, where: string): asserts def is TextureDefinition {
    if (!isPlainObject(def)) {
        throw new Error(`${where}: expected a JSON object`);
    }
    checkObjectKeys(def, TEXTURE_KEYS, where);
    const { size, seed, background, patches } = def;
    if (
        !Array.isArray(size) ||
        size.length !== 2 ||
        !size.every((n) => Number.isInteger(n) && n > 0)
    ) {
        throw new Error(`${where}: "size" must be [width, height] in pixels`);
    }
    checkNumber(seed, `${where}: seed`, { integer: true });
    if (background !== undefined && typeof background !== 'string') {
        throw new Error(`${where}: "background" must be a CSS color`);
    }
    if (!Array.isArray(patches)) {
        throw new Error(`${where}: "patches" must be an array`);
    }
    patches.forEach((placement, i) => checkPlacement(placement, `${where}: patches[${i}]`));
}

function checkPlacement(placement: unknown, where: string): asserts placement is Placement {
    if (!isPlainObject(placement)) {
        throw new Error(`${where}: expected an object`);
    }
    checkObjectKeys(placement, PLACEMENT_KEYS, where);
    if (typeof placement.patch !== 'string' && !isPlainObject(placement.patch)) {
        throw new Error(`${where}: "patch" must be a file path or a patch definition`);
    }
    checkNumber(placement.x, `${where}.x`);
    checkNumber(placement.y, `${where}.y`);
    checkNumber(placement.width, `${where}.width`, { min: 0 });
    checkNumber(placement.height, `${where}.height`, { min: 0 });
    checkNumber(placement.seed, `${where}.seed`, { integer: true });
    checkNumber(placement.opacity, `${where}.opacity`, { min: 0, max: 1 });
    if (placement.params !== undefined && !isPlainObject(placement.params)) {
        throw new Error(`${where}: "params" must be an object`);
    }
}

export type RenderTextureOptions = {
    /** file the definition comes from: relative patch paths are resolved against it */
    file?: string;
    /** overrides the texture's global seed */
    seed?: number;
};

/**
 * Renders a texture definition: each patch is regenerated at its placed size and drawn
 * in order. Placements crossing an edge wrap around, so textures keep tiling.
 *
 * Seeds: placement seed, else patch file seed, else global seed.
 */
export function renderTexture(
    def: unknown,
    loader: Loader,
    options: RenderTextureOptions = {},
): Texture {
    const where = options.file ?? 'texture';
    checkTexture(def, where);
    const [width, height] = def.size;
    const globalSeed = options.seed ?? def.seed ?? 0;
    const texture = new Texture(width, height).fill(Rainbow.parse(def.background ?? '#000'));

    def.patches.forEach((placement, i) => {
        const at = `${where}: patches[${i}]`;
        let patch = loadPatch(placement.patch, loader, options.file);
        if (placement.params) {
            patch = { ...patch, params: deepMerge(patch.params, placement.params) };
            checkPatchParams(patch, `${at}.params`);
        }
        const [ownWidth, ownHeight] = patchSize(patch);
        const percent = (value: number, total: number) => Math.round((value / 100) * total);
        const w = placement.width === undefined ? ownWidth : percent(placement.width, width);
        const h = placement.height === undefined ? ownHeight : percent(placement.height, height);
        if (w < 1 || h < 1) {
            throw new Error(`${at}: placed size ${w}x${h} is empty`);
        }
        const seed = placement.seed ?? patch.seed ?? globalSeed;
        const image = renderPatch(patch, seed, w, h);
        texture.draw(
            image,
            percent(placement.x ?? 0, width),
            percent(placement.y ?? 0, height),
            placement.opacity ?? 1,
        );
    });
    return texture;
}

/**
 * Loads a texture file and renders it.
 */
export function renderTextureFile(
    ref: string,
    loader: Loader,
    options: Omit<RenderTextureOptions, 'file'> = {},
): Texture {
    const file = loader.resolve(undefined, ref);
    return renderTexture(loader.read(file), loader, { ...options, file });
}
