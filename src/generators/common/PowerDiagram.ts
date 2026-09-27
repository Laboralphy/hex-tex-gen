import { hash } from '../../core/hash';
import { wrapOffset } from '../../core/math';

/** where a point falls in a power diagram: the same fields as a Voronoi sample */
export type PowerSample = {
    /** id of the cell */
    cell: number;
    /** position of the site of that cell */
    center: [number, number];
    /** perpendicular distance to the nearest border of the cell */
    border: number;
    /** id of the cell across that nearest border */
    neighbor: number;
    /** distance to the second nearest border: both are small in the corners of a cell */
    border2: number;
};

/** random candidates drawn for each site: more spread the sites more evenly */
const CANDIDATES = 8;

/** weight of the heaviest site, as a share of the radius of an average cell */
const WEIGHT = 1.6;

/**
 * Seeded, tileable power diagram: a Voronoi diagram whose sites carry weights, so that
 * heavy sites claim large cells and light ones small cells, like boulders of every size in
 * a heap. Sites are spread evenly at random, with no grid; distances wrap around the tile. The
 * distance to the border is exact: the perpendicular distance to the nearest of the
 * straight borders shared with the other cells.
 */
export class PowerDiagram {
    private readonly xs: Float64Array;
    private readonly ys: Float64Array;
    private readonly weights: Float64Array;
    /** offsets from the sites to the sampled point, reused from one sample to the next */
    private readonly dx: Float64Array;
    private readonly dy: Float64Array;

    /**
     * @param size [width, height] of the tile
     * @param count number of sites
     * @param variation spread of the cell sizes, in [0, 1]: 0 gives cells of a similar size
     */
    constructor(
        seed: number,
        private readonly size: [number, number],
        private readonly count: number,
        variation: number,
    ) {
        const [width, height] = size;
        // the radius of a cell of an even share of the tile
        const radius = Math.sqrt((width * height) / count / Math.PI);
        this.xs = new Float64Array(count);
        this.ys = new Float64Array(count);
        this.weights = new Float64Array(count);
        this.dx = new Float64Array(count);
        this.dy = new Float64Array(count);
        // sites spread evenly but with no grid: each one is the farthest from the sites
        // already placed among a few random candidates; the weights then make the sizes vary
        for (let i = 0; i < count; ++i) {
            let bestDistance = -1;
            for (let k = 0; k < CANDIDATES; ++k) {
                const x = hash(seed, i, k, 0) * width;
                const y = hash(seed, i, k, 1) * height;
                let nearest = Infinity;
                for (let j = 0; j < i; ++j) {
                    nearest = Math.min(
                        nearest,
                        Math.hypot(
                            wrapOffset(x, this.xs[j], width),
                            wrapOffset(y, this.ys[j], height),
                        ),
                    );
                }
                if (nearest > bestDistance) {
                    bestDistance = nearest;
                    this.xs[i] = x;
                    this.ys[i] = y;
                }
            }
            this.weights[i] = (WEIGHT * variation * radius * hash(seed, i, 2)) ** 2;
        }
    }

    /**
     * The cell a point falls in, and its distance to the border of that cell.
     */
    sample(x: number, y: number): PowerSample {
        const [width, height] = this.size;
        const { dx, dy } = this;
        let cell = 0;
        let best = Infinity;
        for (let i = 0; i < this.count; ++i) {
            dx[i] = wrapOffset(x, this.xs[i], width);
            dy[i] = wrapOffset(y, this.ys[i], height);
            const power = dx[i] * dx[i] + dy[i] * dy[i] - this.weights[i];
            if (power < best) {
                best = power;
                cell = i;
            }
        }
        // the nearest border: the bisector of the powers, a straight line, to every other site
        let border = Infinity;
        let border2 = Infinity;
        let neighbor = cell;
        for (let j = 0; j < this.count; ++j) {
            if (j === cell) {
                continue;
            }
            const power = dx[j] * dx[j] + dy[j] * dy[j] - this.weights[j];
            const gap = Math.hypot(dx[j] - dx[cell], dy[j] - dy[cell]);
            const d = gap > 0 ? (power - best) / (2 * gap) : Infinity;
            if (d < border) {
                border2 = border;
                border = d;
                neighbor = j;
            } else if (d < border2) {
                border2 = d;
            }
        }
        return { cell, center: [this.xs[cell], this.ys[cell]], border, neighbor, border2 };
    }
}
