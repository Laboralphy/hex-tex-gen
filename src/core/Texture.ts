import type { Color32 } from '@laboralphy/rainbow';
import { mod } from './math';

/** a corner of a rectangular area */
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * A point of interest reported by a generator, in pixels of the texture it rendered.
 */
export type AnchorPoint = {
    x: number;
    y: number;
    /**
     * the point is this corner of an area, such as the top-right corner of an opening:
     * the area extends from it to the left and downwards
     */
    corner?: Corner;
};

/** the corner a corner becomes once the axes are swapped */
const TRANSPOSED_CORNERS: Record<Corner, Corner> = {
    'top-left': 'top-left',
    'top-right': 'bottom-left',
    'bottom-left': 'top-right',
    'bottom-right': 'bottom-right',
};

/** the corner a corner becomes once mirrored */
function mirrorCorner(corner: Corner, horizontal: boolean, vertical: boolean): Corner {
    const [v, h] = corner.split('-');
    const vv = vertical ? (v === 'top' ? 'bottom' : 'top') : v;
    const hh = horizontal ? (h === 'left' ? 'right' : 'left') : h;
    return `${vv}-${hh}` as Corner;
}

/**
 * A 2D RGBA bitmap. Pixels are stored row by row, 4 bytes each (r, g, b, a),
 * which is the layout expected by PNG encoders and `ImageData`.
 */
export class Texture {
    public readonly data: Uint8ClampedArray;
    /** named anchors reported by the generator, see {@link TextureGenerator.anchors} */
    public anchors: Record<string, AnchorPoint[]> = {};
    /**
     * Pixels this texture erases from the textures it is drawn on, 1 per erased pixel:
     * openings let what is behind the wall show through.
     */
    public cut?: Uint8Array;

    constructor(
        public readonly width: number,
        public readonly height: number,
    ) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
            throw new RangeError(`Texture: invalid size ${width}x${height}`);
        }
        this.data = new Uint8ClampedArray(width * height * 4);
    }

    /**
     * Wraps coordinates so that textures behave as tiles.
     */
    private offset(x: number, y: number): number {
        return (mod(y, this.height) * this.width + mod(x, this.width)) << 2;
    }

    getPixel(x: number, y: number): Color32 {
        const i = this.offset(x, y);
        const d = this.data;
        return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
    }

    setPixel(x: number, y: number, color: Color32): void {
        const i = this.offset(x, y);
        const d = this.data;
        d[i] = (color >>> 24) & 0xff;
        d[i + 1] = (color >>> 16) & 0xff;
        d[i + 2] = (color >>> 8) & 0xff;
        d[i + 3] = color & 0xff;
    }

    fill(color: Color32): this {
        for (let y = 0; y < this.height; ++y) {
            for (let x = 0; x < this.width; ++x) {
                this.setPixel(x, y, color);
            }
        }
        return this;
    }

    /**
     * Draws another texture over this one ("over" compositing). Coordinates wrap, so a
     * texture drawn across an edge continues on the opposite side. Pixels of the source's
     * `cut` mask are erased first: they become transparent, as much as `opacity`.
     * @param opacity in [0, 1], multiplied with the source alpha
     */
    draw(source: Texture, x: number, y: number, opacity = 1): this {
        const s = source.data;
        const d = this.data;
        for (let sy = 0; sy < source.height; ++sy) {
            for (let sx = 0; sx < source.width; ++sx) {
                const si = (sy * source.width + sx) << 2;
                const di = this.offset(x + sx, y + sy);
                if (source.cut?.[si >> 2]) {
                    d[di + 3] *= 1 - opacity;
                }
                const a = (s[si + 3] / 255) * opacity;
                const da = d[di + 3] / 255;
                const oa = a + da * (1 - a);
                if (oa === 0) {
                    d[di] = d[di + 1] = d[di + 2] = d[di + 3] = 0;
                    continue;
                }
                for (let c = 0; c < 3; ++c) {
                    d[di + c] = (s[si + c] * a + d[di + c] * da * (1 - a)) / oa;
                }
                d[di + 3] = oa * 255;
            }
        }
        return this;
    }

    /**
     * A copy with the axes swapped, anchors and cut mask included. The top-left lighting of
     * a texture is kept, as transposing swaps its left and top edges.
     */
    transposed(): Texture {
        const t = new Texture(this.height, this.width);
        for (let y = 0; y < this.height; ++y) {
            for (let x = 0; x < this.width; ++x) {
                t.setPixel(y, x, this.getPixel(x, y));
            }
        }
        if (this.cut) {
            const cut = new Uint8Array(this.cut.length);
            for (let y = 0; y < this.height; ++y) {
                for (let x = 0; x < this.width; ++x) {
                    cut[x * this.height + y] = this.cut[y * this.width + x];
                }
            }
            t.cut = cut;
        }
        t.anchors = Object.fromEntries(
            Object.entries(this.anchors).map(([name, points]) => [
                name,
                points.map(({ x, y, corner }) => ({
                    x: y,
                    y: x,
                    ...(corner ? { corner: TRANSPOSED_CORNERS[corner] } : {}),
                })),
            ]),
        );
        return t;
    }

    /**
     * A mirrored copy, anchors and cut mask included. Mirroring also mirrors the light:
     * meant for evenly lit textures, such as cobwebs.
     * @param horizontal flips left and right
     * @param vertical flips top and bottom
     */
    mirrored(horizontal: boolean, vertical: boolean): Texture {
        const { width, height } = this;
        const mx = (x: number) => (horizontal ? width - 1 - x : x);
        const my = (y: number) => (vertical ? height - 1 - y : y);
        const t = new Texture(width, height);
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                t.setPixel(mx(x), my(y), this.getPixel(x, y));
            }
        }
        if (this.cut) {
            const cut = new Uint8Array(this.cut.length);
            for (let y = 0; y < height; ++y) {
                for (let x = 0; x < width; ++x) {
                    cut[my(y) * width + mx(x)] = this.cut[y * width + x];
                }
            }
            t.cut = cut;
        }
        t.anchors = Object.fromEntries(
            Object.entries(this.anchors).map(([name, points]) => [
                name,
                points.map(({ x, y, corner }) => ({
                    x: mx(x),
                    y: my(y),
                    ...(corner ? { corner: mirrorCorner(corner, horizontal, vertical) } : {}),
                })),
            ]),
        );
        return t;
    }

    clone(): Texture {
        const t = new Texture(this.width, this.height);
        t.data.set(this.data);
        t.cut = this.cut?.slice();
        t.anchors = Object.fromEntries(
            Object.entries(this.anchors).map(([name, points]) => [
                name,
                points.map((p) => ({ ...p })),
            ]),
        );
        return t;
    }
}
