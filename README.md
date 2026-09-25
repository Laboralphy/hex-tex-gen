# @laboralphy/hex-tex-gen

Procedural generator of Hexen/Doom-like 2D bitmap textures.

- a platform-neutral library producing RGBA bitmaps (`Texture`),
- a CLI (`hex-tex-gen`) writing them as PNG files.

Colors are handled with [`@laboralphy/rainbow`](https://www.npmjs.com/package/@laboralphy/rainbow),
noise with [`@laboralphy/algorithms`](https://www.npmjs.com/package/@laboralphy/algorithms).
Generated textures are seedable (same seed, same texture) and tile seamlessly.

The full documentation is in [`documentation/`](documentation/README.md): concepts, file
formats, command line, library, and a reference of every template parameter.

## Textures and patches

Like Doom wall textures, a texture is a canvas on which **patches** are placed. Each patch
lives in its own JSON file: a `template` (a generator) and its parameters.

```jsonc
// patches/castle-stone.json
{ "template": "ashlar", "size": [64, 64], "rows": { "count": 4 } }

// patches/large-blocks.json: deep-merged over its parent, arrays are replaced
{
  "extends": "./castle-stone.json",
  "rows": { "count": 2, "heightVariation": 0 },
  "blocks": { "width": [24, 40], "minJointOffset": 10 },
  "mortar": { "size": 3 }
}
```

```jsonc
// castle-wall.json
{
  "size": [128, 128],
  "seed": 1234,
  "background": "#000",
  "patches": [
    { "patch": "./patches/castle-stone.json", "width": 100, "height": 100 },
    {
      "patch": "./patches/large-blocks.json",
      "x": 0,
      "y": 75,
      "width": 100,
      "height": 25,
      "seed": 7,
      "params": { "mortar": { "color": "#1a1612" } },
    },
  ],
}
```

| Placement key     | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `patch`           | patch file, relative to the texture file, or an inline patch definition    |
| `id`              | name other placements use to anchor on this one                            |
| `anchor`          | repeats the patch on the anchor points of a previous placement (see below) |
| `x`, `y`          | position, in percent of the texture size (default 0)                       |
| `width`, `height` | size, in percent of the texture size (default: the patch's own size)       |
| `seed`            | overrides the patch seed, which overrides the texture's global seed        |
| `params`          | template parameters deep-merged over the patch file                        |
| `opacity`         | in [0, 1] (default 1)                                                      |

Patches are **regenerated** at their placed size, never stretched. "Layout" parameters
(stone widths, row count...) are expressed at the patch's own `size` and scale with it;
"detail" parameters (mortar, bevel, cracks...) are real pixels and do not. Randomness is
position-based (`hash(seed, row, column...)`), so the same seed gives the same stones at
every size. Placements crossing an edge wrap around, so textures keep tiling.

### Anchors

Generators report named **anchor points** at the size they rendered, such as the top of
each row of stone faces, just below the mortar. A placement can be repeated on the anchor
points of a previous placement instead of being positioned with `x`, `y`:

```jsonc
{
  "size": [128, 128],
  "patches": [
    { "id": "wall", "patch": "./patches/castle-stone.json", "width": 100, "height": 100 },
    {
      "patch": "./patches/moss.json",
      "anchor": { "to": "wall", "at": "rows", "only": [0, 2], "offset": [0, 1] },
      "width": 100,
      "height": 25,
    },
  ],
}
```

| Anchor key | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| `to`       | `id` of a previous placement                                  |
| `at`       | anchor name, declared by the generator (`hex-tex-gen --list`) |
| `only`     | indices of the points to use (default: all)                   |
| `offset`   | `[dx, dy]` shift in pixels (default `[0, 0]`)                 |

Anchors follow the target whatever its seed, size or parameters. Points hidden by a later
opaque placement are skipped (overlay generators such as `moss`, and placements with an
`opacity` below 1, hide nothing). Each copy gets its own seed, derived from the placement
seed and the point index.

| Template | Anchor   | Points                                                             |
| -------- | -------- | ------------------------------------------------------------------ |
| `ashlar` | `rows`   | left edge and top of the stone faces of each row, below the mortar |
| `ashlar` | `stones` | top-left corner of the face of each stone                          |

### Aging

`ashlar` has an `age` parameter, from 0 (new) to 1 (ruined), 0.3 by default. It sets every
wear parameter left unset: chips, cracks, rough outlines, surface grain, differences
between stones, and four weathering effects:

| Group            | Effect                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `erosion`        | rounded corners (`corners`) and edges worn in waves (`edges`)      |
| `stains`         | dark streaks running down from the stones, and grime over the wall |
| `spalling`       | flaked, recessed patches on stone faces                            |
| `mortar.erosion` | hollowed joints: darker, pitted, shadowed by the stones above      |

Values set explicitly win over `age`, so `age` gives the overall look and individual
parameters fine-tune it: `{ "age": 0.8, "stains": { "ratio": 0 } }` is a ruined wall
without streaks. `hex-tex-gen --list` marks the derived parameters with `(from age)`.

See `examples/` for working files.

## Validation and editor support

Every parameter is described by a [Zod](https://zod.dev) schema: its type, range, default
value, description, and whether it is a layout or a detail value. Patch files, texture
files and CLI parameters are validated against these schemas, and every issue is reported
with its file and path:

```
patches/castle-stone.json: unknown parameter "blocks.widht"; mortar.size: Invalid input: expected int, received number
```

The schemas are also exported as JSON Schemas in `schemas/`. Reference them with
`$schema` to get completion, documentation and validation in VS Code or JetBrains:

```jsonc
{ "$schema": "../schemas/patch.schema.json", "template": "ashlar", "mortar": { "size": 3 } }
```

Patch files get the parameters of their `template`: a file extending another one should
repeat the `template` to get completion (it must match its parent's). `hex-tex-gen --list`
prints every parameter with its default and description.

## CLI

```sh
hex-tex-gen render examples/castle-wall.json -o wall.png  # render a texture file
hex-tex-gen render examples/castle-wall.json -s 99         # override the global seed
hex-tex-gen ashlar -s 42                                   # a generator with its defaults
hex-tex-gen --list                                         # generators and their parameters
```

During development, run it from source with `npm run cli -- <args>`.

## Library

```ts
import { createMemoryLoader, renderTextureFile, ashlar } from '@laboralphy/hex-tex-gen';

// a single generator
const texture = ashlar.generate({ seed: 42, width: 128, height: 128, mortar: { size: 1 } });
texture.data; // Uint8ClampedArray, RGBA, row by row

// texture files, read through a Loader (the CLI provides one reading the file system)
const loader = createMemoryLoader({
  '/patches/stone.json': { template: 'ashlar' },
  '/wall.json': { size: [64, 64], patches: [{ patch: './patches/stone.json' }] },
});
const wall = renderTextureFile('/wall.json', loader);
```

To add a template, define it with `defineGenerator` in `src/generators/` and register it
in `src/generators/index.ts`, then run `npm run schemas`:

```ts
export const pillar = defineGenerator({
  name: 'pillar',
  description: 'Round stone pillar',
  schema: z.strictObject({
    size: size().default([32, 64]).describe('own size of the patch, in pixels'),
    rings: z.number().int().min(0).default(3).describe('number of rings').meta(LAYOUT),
    palette: palette().default(['#333', '#999']).describe('stone colors'),
  }),
  // parameters are validated, with defaults filled in, before render is called
  render(params, { width, height, seed }) {
    const texture = new Texture(width, height);
    // ...
    return texture;
  },
});
```

Every property needs a default (nested objects use `.prefault({})`), and `size` is
required. Mark layout values with `.meta(LAYOUT)` and detail values with `.meta(DETAIL)`.
A template can declare `anchors` (names and descriptions) and fill `texture.anchors` in
`render`, and set `overlay: true` when it is transparent by design.

## Scripts

| Script            | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `npm run build`   | build library (ESM + CJS + d.ts) and CLI                      |
| `npm run cli`     | run the CLI from source                                       |
| `npm run schemas` | regenerate the JSON Schemas in `schemas/`                     |
| `npm run docs`    | regenerate the reference pages and images of `documentation/` |
| `npm test`        | run tests                                                     |
| `npm run check`   | typecheck, lint, format check, test, build                    |
