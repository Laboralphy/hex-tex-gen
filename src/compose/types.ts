/**
 * Access to JSON definition files. The library never touches the file system itself:
 * the CLI provides a Node loader, tests and browsers can use {@link createMemoryLoader}.
 */
export interface Loader {
    /**
     * Resolves a reference found in a file.
     * @param from file containing the reference; undefined for top-level references
     * @param ref path as written in the file, relative to `from`
     * @returns an absolute, normalized path, used as a key by {@link Loader.read}
     */
    resolve(from: string | undefined, ref: string): string;
    /** reads and parses a JSON file */
    read(path: string): unknown;
}

/**
 * Content of a patch file: a template name, its parameters, and optionally a parent
 * file whose content is deep-merged under this one.
 */
export type PatchDefinition = {
    /** parent patch file, relative to this file */
    extends?: string;
    /** generator name */
    template?: string;
    /** seed of this patch, unless the placement sets one */
    seed?: number;
    /** template parameters */
    [param: string]: unknown;
};

/**
 * A patch placed on a texture. Positions and sizes are percentages of the texture size.
 */
export type Placement = {
    /** patch file (relative to the texture file) or inline patch definition */
    patch: string | PatchDefinition;
    /** left edge, in percent of the texture width; defaults to 0 */
    x?: number;
    /** top edge, in percent of the texture height; defaults to 0 */
    y?: number;
    /** width, in percent of the texture width; defaults to the patch's own width */
    width?: number;
    /** height, in percent of the texture height; defaults to the patch's own height */
    height?: number;
    /** seed of this placement; defaults to the patch seed, then to the texture seed */
    seed?: number;
    /** template parameters deep-merged over the patch file */
    params?: Record<string, unknown>;
    /** in [0, 1]; defaults to 1 */
    opacity?: number;
};

/**
 * Content of a texture file.
 */
export type TextureDefinition = {
    /** texture size in pixels */
    size: [number, number];
    /** global seed; defaults to 0 */
    seed?: number;
    /** CSS color under the patches; defaults to opaque black */
    background?: string;
    /** patches, drawn in order */
    patches: Placement[];
};

/**
 * A patch definition with its `extends` chain resolved and its parameters validated.
 */
export type ResolvedPatch = {
    template: string;
    seed?: number;
    params: Record<string, unknown>;
    /** where the patch comes from, for error messages */
    source: string;
};
