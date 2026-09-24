import { deepMerge } from '../core/object-fusion';
import { checkKeys, isPlainObject } from '../core/params';
import type { Texture } from '../core/Texture';
import { generators } from '../generators';
import type { Loader, PatchDefinition, ResolvedPatch } from './types';

/**
 * Merges a patch definition over its `extends` chain.
 * @param base file that relative `extends` paths are resolved against
 * @param chain files already visited, to detect cycles
 */
function mergeExtends(
    def: unknown,
    where: string,
    base: string | undefined,
    loader: Loader,
    chain: string[],
): Record<string, unknown> {
    if (!isPlainObject(def)) {
        throw new Error(`${where}: expected a JSON object`);
    }
    const { extends: parent, ...own } = def;
    if (parent === undefined) {
        return own;
    }
    if (typeof parent !== 'string') {
        throw new Error(`${where}: "extends" must be a file path`);
    }
    const parentFile = loader.resolve(base, parent);
    if (chain.includes(parentFile)) {
        throw new Error(`circular extends: ${[...chain, parentFile].join(' -> ')}`);
    }
    const parentDef = mergeExtends(loader.read(parentFile), parentFile, parentFile, loader, [
        ...chain,
        parentFile,
    ]);
    return deepMerge(parentDef, own);
}

/**
 * Checks template parameters against the template's defaults.
 */
export function checkPatchParams(patch: ResolvedPatch, where = patch.source): void {
    try {
        checkKeys(patch.params, generators[patch.template].defaults);
    } catch (e) {
        throw new Error(`${where}: ${(e as Error).message}`, { cause: e });
    }
}

/**
 * Loads a patch, resolving its `extends` chain and validating its parameters.
 * @param ref patch file path, or inline patch definition
 * @param from file containing the reference: relative paths are resolved against it
 */
export function loadPatch(
    ref: string | PatchDefinition,
    loader: Loader,
    from?: string,
): ResolvedPatch {
    const file = typeof ref === 'string' ? loader.resolve(from, ref) : undefined;
    const where = file ?? `inline patch in ${from ?? 'texture'}`;
    const def = file === undefined ? ref : loader.read(file);
    const merged = mergeExtends(def, where, file ?? from, loader, file ? [file] : []);

    const { template, seed, ...params } = merged;
    if (typeof template !== 'string') {
        throw new Error(`${where}: missing "template"`);
    }
    if (!(template in generators)) {
        const names = Object.keys(generators).join(', ');
        throw new Error(`${where}: unknown template "${template}" (available: ${names})`);
    }
    if (seed !== undefined && !Number.isInteger(seed)) {
        throw new Error(`${where}: "seed" must be an integer`);
    }
    const patch: ResolvedPatch = {
        template,
        seed: seed as number | undefined,
        params,
        source: where,
    };
    checkPatchParams(patch);
    return patch;
}

/**
 * Own size of a patch, in pixels.
 */
export function patchSize(patch: ResolvedPatch): [number, number] {
    const size = patch.params.size ?? generators[patch.template].defaults.size;
    if (
        !Array.isArray(size) ||
        size.length !== 2 ||
        !size.every((n) => Number.isInteger(n) && n > 0)
    ) {
        throw new Error(`${patch.source}: "size" must be [width, height] in pixels`);
    }
    return size as [number, number];
}

/**
 * Renders a patch at the given size; the patch is regenerated, not stretched.
 * @param width defaults to the patch's own width
 * @param height defaults to the patch's own height
 */
export function renderPatch(
    patch: ResolvedPatch,
    seed: number,
    width?: number,
    height?: number,
): Texture {
    const [ownWidth, ownHeight] = patchSize(patch);
    return generators[patch.template].generate({
        ...patch.params,
        width: width ?? ownWidth,
        height: height ?? ownHeight,
        seed,
    });
}
