/** default rise of each arch, as a share of the width */
export const ARCH_RISE = { round: 0.5, pointed: 0.8 };

/**
 * Distance from a point to the curve of an arch, positive inside, and the direction the
 * curve faces there: its outward normal, from the opening towards the wall.
 * @param spring y of the springing line, where the arch starts
 * @returns undefined below the springing line, where the sides go on
 */
export function archDistance(
    shape: 'round' | 'pointed',
    width: number,
    spring: number,
    x: number,
    y: number,
): { d: number; nx: number; ny: number } | undefined {
    if (y >= spring) {
        return undefined;
    }
    const half = width / 2;
    if (shape === 'round') {
        // an ellipse through both springers and the crown
        const ex = (x - half) / half;
        const ey = (y - spring) / spring;
        const r = Math.hypot(ex, ey);
        const n = Math.hypot(ex / half, ey / spring) || 1;
        return { d: (1 - r) * Math.min(half, spring), nx: ex / half / n, ny: ey / spring / n };
    }
    // two arcs, each centered beyond the axis, meeting at the apex
    const c = Math.max(0, (spring * spring - half * half) / width);
    const radius = half + c;
    const arcs = [half + c, half - c].map((cx) => {
        const dx = x - cx;
        const dy = y - spring;
        const r = Math.hypot(dx, dy) || 1;
        return { d: radius - r, nx: dx / r, ny: dy / r };
    });
    return arcs[0].d < arcs[1].d ? arcs[0] : arcs[1];
}
