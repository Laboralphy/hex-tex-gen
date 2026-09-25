import { deepMerge } from '../core/object-fusion';
import { isPlainObject } from '../core/params';
import { parseWith, ValidationError } from '../core/schema';
import type { Texture } from '../core/Texture';
import { generators } from '../generators';
import type { BaseParams } from '../generators';
import {
    patchDefinitionSchema,
    type Loader,
    type PatchDefinition,
    type ResolvedPatch,
} from './types';

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
    try {
        parseWith(patchDefinitionSchema, def);
    } catch (e) {
        throw new Error(`${where}: ${(e as Error).message}`, { cause: e });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { extends: parent, $schema, ...own } = def;
    if (typeof parent !== 'string') {
        return own;
    }
    const parentFile = loader.resolve(base, parent);
    if (chain.includes(parentFile)) {
        throw new Error(`circular extends: ${[...chain, parentFile].join(' -> ')}`);
    }
    const parentDef = mergeExtends(loader.read(parentFile), parentFile, parentFile, loader, [
        ...chain,
        parentFile,
    ]);
    if (
        own.template !== undefined &&
        parentDef.template !== undefined &&
        own.template !== parentDef.template
    ) {
        throw new Error(
            `${where}: template "${own.template}" differs from "${parentDef.template}" in ${parentFile}`,
        );
    }
    return deepMerge(parentDef, own);
}

/**
 * Validates template parameters with the template's schema.
 * @returns the parameters, defaults filled in
 * @throws Error prefixed with `where`
 */
export function checkPatchParams(patch: ResolvedPatch, where = patch.source): BaseParams {
    try {
        return parseWith(generators[patch.template].schema, patch.params, 'parameter');
    } catch (e) {
        if (e instanceof ValidationError) {
            throw new Error(`${where}: ${e.message}`, { cause: e });
        }
        throw e;
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
    return checkPatchParams(patch).size;
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
