import { FractalNoise } from '@laboralphy/algorithms';
import { Rainbow } from '@laboralphy/rainbow';
import { hash, hashRange, hashSeed } from '../../core/hash';
import { mod } from '../../core/math';
import { createGradient, sample, shade } from '../../core/palette';
import { Texture } from '../../core/Texture';
import type { RenderContext } from '../types';
import { drawCracks } from './cracks';
import type { Masonry, MasonryParams } from './masonry';
import { growMoss } from './moss-growth';
import { SALT_STONE, SALT_CHIP, SALT_NOISE, SALT_GRAIN, SALT_SPALL } from './salts';
import { drawStains } from './stains';
import type { AshlarWear } from './wear';

/**
 * Renders the stones of a masonry: surface, bevel, mortar, and every wear effect.
 */
export function renderMasonry(
    p: MasonryParams,
    { width, height, seed }: RenderContext,
    masonry: Masonry,
    wear: AshlarWear,
): Texture {
    const scale = Math.min(width / p.size[0], height / p.size[1]);

    const texture = new Texture(width, height);
    const palette = createGradient(p.stone.palette);
    const mortarColor = Rainbow.parse(p.mortar.color);
    // surface noise scales with the patch; larger renders get extra octaves of detail
    const stoneNoise = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 0),
        period: p.stone.noise.period,
        octaves: p.stone.noise.octaves + Math.max(0, Math.round(Math.log2(scale))),
        persistence: p.stone.noise.persistence,
    });
    // detail noises have a fixed grain in real pixels
    const grain = (px: number) => Math.max(1, Math.round(px));
    const detailPeriod: [number, number] = [grain(width / 4), grain(height / 4)];
    const warpX = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 1),
        period: detailPeriod,
        octaves: 2,
    });
    const warpY = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 2),
        period: detailPeriod,
        octaves: 2,
    });
    const mortarNoise = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 3),
        period: [grain(width / 2), grain(height / 2)],
        octaves: 1,
    });

    const sy = height / p.size[1];
    // wear noises: fixed grain in real pixels, except grime which scales like the stones
    const edgeWear = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 4),
        period: [grain(width / 6), grain(height / 6)],
        octaves: 2,
    });
    const mortarHoles = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 5),
        period: [grain(width / 3), grain(height / 3)],
        octaves: 2,
    });
    const spallNoise = new FractalNoise({
        seed: hashSeed(seed, SALT_NOISE, 6),
        period: [grain(width / 3), grain(height / 3)],
        octaves: 2,
    });

    // stone index of each pixel, -1 for mortar
    const ids = new Int32Array(width * height).fill(-1);
    const stones = masonry.stones;
    // distance of each stone pixel to its edge, and whether that edge is the top one
    const dist = new Float32Array(width * height);
    const tops = new Uint8Array(width * height);

    // flaked patches, in the stone's own coordinates
    const spalls = stones.map(({ row: r, block: i }, id) => {
        if (hash(seed, SALT_SPALL, r, i, 0) >= wear.spalling.ratio) {
            return undefined;
        }
        const [min, max] = wear.spalling.size;
        return {
            x: stones[id].w * hashRange(0.25, 0.75, seed, SALT_SPALL, r, i, 1),
            y: stones[id].h * hashRange(0.25, 0.75, seed, SALT_SPALL, r, i, 2),
            radius: hashRange(min, max, seed, SALT_SPALL, r, i, 3),
        };
    });

    const mortarAfter = Math.ceil(p.mortar.size / 2);
    const roughness = wear.roughness;
    const radius = wear.erosion.corners;
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const u = x / width;
            const v = y / height;
            const wx = mod(x + 0.5 + (warpX.sample(u, v) - 0.5) * 2 * roughness, width);
            const wy = mod(y + 0.5 + (warpY.sample(u, v) - 0.5) * 2 * roughness, height);

            const hit = masonry.locate(wx, wy);
            const { id, lx, ly, d, lit, shadowed, edges, top } = hit;
            const inPanel = hit.panel;
            const stone = stones[id];
            const r = stone.row;
            const i = stone.block;
            // edges worn down in smooth waves
            const worn = d - wear.erosion.edges * edgeWear.sample(u, v);
            // corners of rectangular stones: rounded, or chipped
            const corners = edges && [
                [edges.dl, edges.dt],
                [edges.dr, edges.dt],
                [edges.dr, edges.db],
                [edges.dl, edges.db],
            ];

            let isMortar = worn < 0;
            // rounded corners
            if (!isMortar && corners && radius > 0) {
                isMortar = corners.some(
                    ([cx, cy]) =>
                        cx < radius &&
                        cy < radius &&
                        (radius - cx) ** 2 + (radius - cy) ** 2 > radius ** 2,
                );
            }
            if (!isMortar && corners && hash(seed, SALT_CHIP, r, i, 0) < wear.chips.ratio) {
                const [min, max] = wear.chips.size;
                const chip = hashRange(min, max, seed, SALT_CHIP, r, i, 1);
                const [cx, cy] = corners[Math.floor(hash(seed, SALT_CHIP, r, i, 2) * 4)];
                isMortar = cx + cy < chip;
            }

            if (isMortar) {
                const n = mortarNoise.sample(u, v);
                let brightness = 1 + (n - 0.5) * 2 * wear.mortar.noise;
                const erosion = wear.mortar.erosion;
                if (erosion > 0) {
                    // hollowed joints: pitted, and in the shadow of the stone above or
                    // on the left, the light coming from the top-left
                    brightness *= 1 - erosion * (0.2 + 0.4 * mortarHoles.sample(u, v));
                    if (shadowed) {
                        brightness *= 1 - erosion * 0.35;
                    }
                }
                texture.setPixel(x, y, shade(mortarColor, brightness));
                continue;
            }

            ids[y * width + x] = id;
            dist[y * width + x] = d;
            tops[y * width + x] = top ? 1 : 0;
            const ox = hash(seed, SALT_STONE, r, i, 0);
            const oy = hash(seed, SALT_STONE, r, i, 1);
            const n = stoneNoise.sample(u + ox, v + oy);
            const shift = (hash(seed, SALT_STONE, r, i, 2) - 0.5) * 2 * p.stone.paletteShift;
            const brightness =
                (1 + (hash(seed, SALT_STONE, r, i, 3) - 0.5) * 2 * wear.shadeVariation) *
                (1 + (hash(seed, SALT_GRAIN, x, y) - 0.5) * 2 * wear.grain);
            let color = sample(palette, 0.5 + (n - 0.5) * p.stone.contrast * 2 + shift);
            if (worn < (inPanel ? p.panel.bevel : p.bevel.size)) {
                color = shade(color, lit ? p.bevel.light : p.bevel.dark);
            }
            if (inPanel) {
                color = shade(color, p.panel.shade);
            }
            const spall = spalls[id];
            if (spall) {
                const sx = lx - spall.x;
                const sy = ly - spall.y;
                const f =
                    Math.hypot(sx, sy) / (spall.radius * (0.7 + 0.6 * spallNoise.sample(u, v)));
                if (f < 1) {
                    // recessed patch: its top-left rim in shadow, its bottom-right rim lit
                    color = shade(color, 1 - wear.spalling.depth);
                    if (f > 0.7) {
                        color = shade(color, sx + sy < 0 ? 0.75 : 1.25);
                    }
                }
            }
            texture.setPixel(x, y, shade(color, brightness * (hit.relief ?? 1)));
        }
    }

    drawCracks(texture, stones, ids, wear.cracks, seed);

    if (p.moss.coverage > 0) {
        growMoss(texture, p.moss, ids, dist, tops, seed);
    }

    drawStains(texture, stones, wear.stains, mortarAfter, sy, seed);

    texture.anchors = masonry.anchors();
    return texture;
}
