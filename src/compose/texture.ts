import { Rainbow } from '@laboralphy/rainbow';
import { hash, hashSeed } from '../core/hash';
import { clamp, mod } from '../core/math';
import { deepMerge } from '../core/object-fusion';
import { parseWith, ValidationError } from '../core/schema';
import { Texture, type AnchorPoint } from '../core/Texture';
import { generators } from '../generators';
import { checkPatchParams, loadPatch, patchSize, renderPatch } from './patch';
import {
    textureDefinitionSchema,
    type Loader,
    type Placement,
    type ResolvedPatch,
    type TextureDefinition,
} from './types';

/**
 * Validates a texture definition.
 * @throws Error prefixed with `where`
 */
function parseTexture(def: unknown, where: string): TextureDefinition {
    try {
        return parseWith(textureDefinitionSchema, def);
    } catch (e) {
        if (e instanceof ValidationError) {
            throw new Error(`${where}: ${e.message}`, { cause: e });
        }
        throw e;
    }
}

export type RenderTextureOptions = {
    /** file the definition comes from: relative patch paths are resolved against it */
    file?: string;
    /** overrides the texture's global seed */
    seed?: number;
};

/**
 * A placement, loaded and sized, before rendering.
 */
type PreparedPlacement = {
    placement: Placement;
    where: string;
    patch: ResolvedPatch;
    seed: number;
    /** placed size, in pixels */
    width: number;
    height: number;
    /** position, in pixels; undefined for anchored placements */
    x?: number;
    y?: number;
    /** can hide the anchor points of the placements under it */
    opaque: boolean;
    /** may cross an edge of the texture and continue on the opposite side */
    wrap: boolean;
};

/** salt of the random ranks of anchor points, apart from the seeds of the copies */
const SALT_RATIO = 1;

/**
 * Loads, validates and sizes every placement, and checks anchor references.
 */
function preparePlacements(
    def: TextureDefinition,
    loader: Loader,
    where: string,
    options: RenderTextureOptions,
): PreparedPlacement[] {
    const [width, height] = def.size;
    const globalSeed = options.seed ?? def.seed ?? 0;
    const percent = (value: number, total: number) => Math.round((value / 100) * total);
    const ids = new Map<string, PreparedPlacement>();

    return def.patches.map((placement, i) => {
        const at = `${where}: patches[${i}]`;
        let patch = loadPatch(placement.patch, loader, options.file);
        if (placement.params) {
            patch = { ...patch, params: deepMerge(patch.params, placement.params) };
            checkPatchParams(patch, `${at}.params`);
        }
        const [ownWidth, ownHeight] = patchSize(patch);
        const w = placement.width === undefined ? ownWidth : percent(placement.width, width);
        const h = placement.height === undefined ? ownHeight : percent(placement.height, height);
        if (w < 1 || h < 1) {
            throw new Error(`${at}: placed size ${w}x${h} is empty`);
        }
        const anchor = placement.anchor;
        if (anchor) {
            const target = ids.get(anchor.to);
            if (!target) {
                throw new Error(`${at}.anchor: no previous placement with id "${anchor.to}"`);
            }
            if (target.placement.anchor) {
                throw new Error(`${at}.anchor: "${anchor.to}" is anchored itself`);
            }
            const declared = generators[target.patch.template].anchors ?? {};
            if (!(anchor.at in declared)) {
                const names = Object.keys(declared).join(', ') || 'none';
                throw new Error(
                    `${at}.anchor: template "${target.patch.template}" has no anchor "${anchor.at}" (available: ${names})`,
                );
            }
        }
        const wrap = placement.wrap ?? def.wrap ?? true;
        if (!wrap && !anchor && (w > width || h > height)) {
            throw new Error(
                `${at}: placed size ${w}x${h} is larger than the texture, it cannot stay inside with "wrap": false`,
            );
        }
        // a placement that must not wrap is shifted inside the texture
        const inside = (position: number, length: number, total: number) =>
            wrap ? position : clamp(position, 0, total - length);
        const prepared: PreparedPlacement = {
            placement,
            where: at,
            patch,
            seed: placement.seed ?? patch.seed ?? globalSeed,
            width: w,
            height: h,
            x: anchor ? undefined : inside(percent(placement.x ?? 0, width), w, width),
            y: anchor ? undefined : inside(percent(placement.y ?? 0, height), h, height),
            opaque:
                !anchor && !generators[patch.template].overlay && (placement.opacity ?? 1) === 1,
            wrap,
        };
        if (placement.id !== undefined) {
            if (ids.has(placement.id)) {
                throw new Error(`${at}: duplicate id "${placement.id}"`);
            }
            ids.set(placement.id, prepared);
        }
        return prepared;
    });
}

/**
 * Renders a texture definition: each patch is regenerated at its placed size and drawn
 * in order. Placements crossing an edge wrap around, so textures keep tiling, unless
 * `wrap` is false: placed patches are then shifted inside, and anchored copies that would
 * cross an edge are skipped.
 *
 * Seeds: placement seed, else patch file seed, else global seed.
 */
export function renderTexture(
    definition: unknown,
    loader: Loader,
    options: RenderTextureOptions = {},
): Texture {
    const where = options.file ?? 'texture';
    const def = parseTexture(definition, where);
    const [width, height] = def.size;
    const texture = new Texture(width, height).fill(Rainbow.parse(def.background ?? '#000'));
    const prepared = preparePlacements(def, loader, where, options);
    const ids = new Map(
        prepared.filter((p) => p.placement.id !== undefined).map((p) => [p.placement.id!, p]),
    );
    const rendered = new Map<PreparedPlacement, Texture>();

    // a point is hidden when an opaque placement drawn after `owner` covers it
    const isHidden = (owner: PreparedPlacement, point: AnchorPoint) =>
        prepared
            .slice(prepared.indexOf(owner) + 1)
            .some(
                (p) =>
                    p.opaque &&
                    mod(point.x - p.x!, width) < p.width &&
                    mod(point.y - p.y!, height) < p.height,
            );

    for (const p of prepared) {
        const opacity = p.placement.opacity ?? 1;
        const anchor = p.placement.anchor;
        if (!anchor) {
            const image = renderPatch(p.patch, p.seed, p.width, p.height);
            rendered.set(p, image);
            texture.draw(image, p.x!, p.y!, opacity);
            continue;
        }
        const target = ids.get(anchor.to)!;
        const points = rendered.get(target)!.anchors[anchor.at] ?? [];
        const [dx, dy] = anchor.offset ?? [0, 0];
        // candidates: the points selected by `only`, visible, and where the copy lands
        // inside the texture when it must not wrap
        const candidates = points
            .map((point, i) => {
                const at = { x: target.x! + point.x, y: target.y! + point.y };
                // mirrored copies: their top-left corner on the corner point, growing inwards
                const flipX = anchor.mirror === true && point.corner?.endsWith('right') === true;
                const flipY = anchor.mirror === true && point.corner?.startsWith('bottom') === true;
                return {
                    i,
                    at,
                    flipX,
                    flipY,
                    x: flipX ? at.x - p.width + 1 - dx : at.x + dx,
                    y: flipY ? at.y - p.height + 1 - dy : at.y + dy,
                };
            })
            .filter(({ i }) => !anchor.only || anchor.only.includes(i))
            .filter(({ at }) => !isHidden(target, at))
            .filter(
                ({ x, y }) =>
                    p.wrap ||
                    (mod(x, width) + p.width <= width && mod(y, height) + p.height <= height),
            );
        // ratio: keep the candidates of lowest random rank, an exact share of them; a
        // point's rank does not depend on the ratio, so raising the ratio only adds points
        const rank = (i: number) => hash(p.seed, SALT_RATIO, i);
        const kept = [...candidates]
            .sort((a, b) => rank(a.i) - rank(b.i))
            .slice(0, Math.round((anchor.ratio ?? 1) * candidates.length))
            .sort((a, b) => a.i - b.i);
        for (const { i, flipX, flipY, x, y } of kept) {
            // each copy gets its own seed, stable whatever points are skipped
            const seed = hashSeed(p.seed, i);
            const image = renderPatch(p.patch, seed, p.width, p.height);
            texture.draw(flipX || flipY ? image.mirrored(flipX, flipY) : image, x, y, opacity);
        }
    }
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
