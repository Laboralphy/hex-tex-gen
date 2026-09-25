import { type AnchorPoint } from '../../core/Texture';
import type { AshlarParams } from './ashlar';

/**
 * Anchors of walls: `ashlar` and `bricks` report the same ones.
 */
export const WALL_ANCHORS = {
    rows: 'left edge and top of the stone faces of each row, just below the mortar',
    stones: 'top-left corner of the face of each stone, row by row',
    panel: 'top-left corner of the face of the panel, when enabled',
    panelCenter: 'center of the face of the panel, when enabled',
};

/** a stone of a wall, and its bounding box in pixels */
export type StoneBox = { row: number; block: number; x: number; y: number; w: number; h: number };

/** where a point of a wall falls */
export type StoneHit = {
    /** index of the stone in the masonry's stones */
    id: number;
    /** coordinates of the point in the stone's box */
    lx: number;
    ly: number;
    /** distance to the stone's edge, mortar excluded: negative in the mortar */
    d: number;
    /** the nearest edge is on the top or the left of the stone: lit */
    lit: boolean;
    /** the nearest edge is on the bottom or the right: the joint there is in shadow */
    shadowed: boolean;
    /** the nearest edge is the top one: where moss grows */
    top: boolean;
    /** distances to the left, top, right and bottom edges, for rectangular stones */
    edges?: { dl: number; dt: number; dr: number; db: number };
    /** the point is on the panel */
    panel: boolean;
};

/**
 * How stones are laid: their boxes, which stone a point falls on, and the anchors they
 * report. Rows of rectangles for `ashlar` and `bricks`, Voronoi cells for `fieldstone`.
 */
export interface Masonry {
    stones: StoneBox[];
    locate(x: number, y: number): StoneHit;
    anchors(): Record<string, AnchorPoint[]>;
}

/** parameters the stone renderer reads; the wear is resolved beforehand */
export type MasonryParams = Pick<
    AshlarParams,
    'size' | 'mortar' | 'bevel' | 'panel' | 'stone' | 'moss'
>;
