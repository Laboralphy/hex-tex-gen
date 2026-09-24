/**
 * Seedable pseudo-random number generator (mulberry32).
 * Same seed => same texture, which makes generation reproducible.
 */
export class Random {
    private state: number;

    constructor(seed: number = Date.now()) {
        this.state = seed >>> 0;
    }

    /**
     * @returns a float in [0, 1)
     */
    next(): number {
        let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * @returns an integer in [min, max]
     */
    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    /**
     * @returns a float in [min, max)
     */
    float(min: number, max: number): number {
        return min + this.next() * (max - min);
    }
}
