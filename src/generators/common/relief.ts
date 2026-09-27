import { clamp } from '../../core/math';

/**
 * Brightness of a rounded stone at a point: a dome lit from the top-left, steeper towards
 * its edge, the crevice around it in shadow.
 * @param ox horizontal offset of the point from the middle of the stone
 * @param oy vertical offset of the point from the middle of the stone
 * @param d distance from the point to the edge of the stone
 * @param radius radius of the stone
 * @param amount roundness, in [0, 1]: 0 leaves the stone flat, at a brightness of 1
 */
export function domeLight(
    ox: number,
    oy: number,
    d: number,
    radius: number,
    amount: number,
): number {
    const r = Math.hypot(ox, oy) || 1;
    const edge = clamp(1 - d / Math.max(1, radius));
    const slope = Math.min(0.95, edge ** 1.5);
    const [nx, ny, nz] = [(ox / r) * slope, (oy / r) * slope, Math.sqrt(1 - slope * slope)];
    const lambert = Math.max(0, -0.55 * nx - 0.55 * ny + 0.63 * nz);
    const shaded = (0.3 + lambert) / 0.93;
    const occlusion = 1 - 0.4 * edge ** 3;
    return 1 + (shaded * occlusion - 1) * amount;
}

/**
 * Distance to the edge of a stone whose corners are carved along a circle: in a corner,
 * where the two nearest edges are both close, the stone is rounded off.
 * @param d distance to the nearest edge
 * @param d2 distance to the second nearest edge
 * @param radius radius of the rounded corners
 */
export function roundCorner(d: number, d2: number, radius: number): number {
    return d < radius && d2 < radius ? radius - Math.hypot(radius - d, radius - d2) : d;
}
