# Library

hex-tex-gen is a TypeScript library published as ESM and CommonJS, with type
declarations. The library itself never touches the file system and runs in Node.js and in
browsers; only the command line tool writes PNG files.

```sh
npm install @laboralphy/hex-tex-gen
```

## Rendering a template

Every template is exported by name, and all of them are in `generators`, indexed by name:

```ts
import { ashlar, generators } from '@laboralphy/hex-tex-gen';

const wall = ashlar.generate({ seed: 42, width: 128, height: 128, age: 0.7, mortar: { size: 3 } });
const moss = generators['moss'].generate({ seed: 42 });
```

`generate` validates the parameters, fills in the defaults, and returns a `Texture`:

| Member                    | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `width`, `height`         | size in pixels                                                             |
| `data`                    | `Uint8ClampedArray` of RGBA pixels, row by row (the layout of `ImageData`) |
| `getPixel(x, y)`          | color as a 32-bit `0xRRGGBBAA` integer; coordinates wrap around            |
| `setPixel(x, y, c)`       | sets a pixel; coordinates wrap around                                      |
| `draw(t, x, y, opacity?)` | draws another texture over this one, wrapping around the edges             |
| `anchors`                 | anchor points reported by the template, by name                            |

In a browser, `new ImageData(texture.data, texture.width, texture.height)` puts a texture
on a canvas.

Every template also exposes its `name`, `description`, `schema` (Zod), `defaults`,
`anchors` (names and descriptions) and `overlay` flag.

## Rendering texture files

Texture and patch files are read through a `Loader`, which resolves and reads JSON files:

```ts
import { createMemoryLoader, renderTextureFile, renderTexture } from '@laboralphy/hex-tex-gen';

const loader = createMemoryLoader({
  '/patches/castle.json': { template: 'ashlar', age: 0.5 },
  '/wall.json': {
    size: [64, 64],
    patches: [{ patch: './patches/castle.json', width: 100, height: 100 }],
  },
});

const wall = renderTextureFile('/wall.json', loader);
const other = renderTexture(
  { size: [64, 64], seed: 3, patches: [{ patch: '/patches/castle.json' }] },
  loader,
  { seed: 7 }, // overrides the global seed
);
```

`createMemoryLoader` reads from an object of absolute POSIX paths. For other sources
(files, `fetch`), implement `Loader`:

```ts
interface Loader {
  /** absolute path of `ref`, written in the file `from` (undefined: top level) */
  resolve(from: string | undefined, ref: string): string;
  /** parsed content of a JSON file */
  read(path: string): unknown;
}
```

Lower-level functions: `loadPatch` resolves a patch file and its `extends` chain,
`renderPatch` renders it at a given size, `patchSize` gives its own size.

## Validation

Invalid parameters throw a `ValidationError`, whose message lists every problem with its
path, and whose `issues` holds the Zod issues. Texture and patch functions throw errors
prefixed with the file.

The schemas are exported, to validate or build definitions in your own code:

| Export                                     | Validates                       |
| ------------------------------------------ | ------------------------------- |
| `ashlarSchema`, `mossSchema`, ...          | the parameters of each template |
| `textureDefinitionSchema`                  | texture files                   |
| `placementSchema`, `placementAnchorSchema` | placements and anchors          |
| `patchDefinitionSchema`                    | the header of patch files       |

`parseWith(schema, value)` parses with readable errors. `ashlarWear(params)` returns the
wear values of an `ashlar` wall, resolved from its `age`.

## Writing a template

A template is defined with `defineGenerator`: a Zod schema of its parameters, and a
`render` function receiving them validated, with their defaults:

```ts
import { z } from 'zod';
import { defineGenerator, DETAIL, LAYOUT, palette, size, Texture } from '@laboralphy/hex-tex-gen';

export const pillar = defineGenerator({
  name: 'pillar',
  description: 'Round stone pillar',
  schema: z.strictObject({
    size: size().default([32, 64]).describe('own size of the patch, in pixels'),
    rings: z.number().int().min(0).default(3).describe('number of rings').meta(LAYOUT),
    groove: z.number().int().min(0).default(1).describe('groove depth, in pixels').meta(DETAIL),
    colors: z
      .strictObject({
        palette: palette().default(['#333', '#999']).describe('stone colors'),
      })
      .prefault({})
      .describe('colors'),
  }),
  render(params, { width, height, seed }) {
    const texture = new Texture(width, height);
    // ...
    return texture;
  },
});
```

Rules:

- the schema is a `z.strictObject`, so that unknown keys are reported;
- every parameter has a `.default()` and a `.describe()`, and `size` is required: the
  descriptions feed `--list`, the JSON Schemas and the documentation;
- nested groups end with `.prefault({})`, so that their defaults apply when the group is
  omitted;
- pixel values are marked `.meta(LAYOUT)` when they scale with the patch (multiply them by
  `width / size[0]` or `height / size[1]`), or `.meta(DETAIL)` when they are real pixels;
- use `hash(seed, ...integers)` for randomness tied to a position rather than a sequence,
  and `FractalNoise` from `@laboralphy/algorithms` for tileable noise in tile units;
- a template can declare `anchors` (names and descriptions) and fill `texture.anchors` in
  `render`, and set `overlay: true` when it is transparent by design;
- helpers for schemas: `size()`, `range()` (a `[min, max]` pair), `ratio()` (a number in
  [0, 1]), `color()`, `palette()`.

To add a template to hex-tex-gen itself, put it in `src/generators/`, register it in
`src/generators/index.ts`, then run `npm run schemas` and `npm run docs`: the JSON
Schemas and the [template pages](templates/README.md) are generated from the schema.
