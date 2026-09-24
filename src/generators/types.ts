import type { Texture } from '../core/Texture';

export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type GeneratorOptions = {
    /** rendered width in pixels; defaults to the generator's own size */
    width?: number;
    /** rendered height in pixels; defaults to the generator's own size */
    height?: number;
    seed: number;
};

/** parameters every generator has */
export type BaseParams = {
    /** own size of the generator's output, in pixels */
    size: [number, number];
};

export interface TextureGenerator<T extends BaseParams = BaseParams> {
    readonly name: string;
    readonly description: string;
    /** default values for the generator-specific parameters */
    readonly defaults: T;
    generate(options: GeneratorOptions & DeepPartial<T>): Texture;
}
