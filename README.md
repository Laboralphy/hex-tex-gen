# @laboralphy/hex-tex-gen

Procedural generator of Hexen/Doom-like 2D bitmap textures.

- a platform-neutral library producing RGBA bitmaps (`Texture`),
- a CLI (`hex-tex-gen`) writing them as PNG files.

Colors are handled with [`@laboralphy/rainbow`](https://www.npmjs.com/package/@laboralphy/rainbow),
noise with [`@laboralphy/algorithms`](https://www.npmjs.com/package/@laboralphy/algorithms).
Generated textures are seedable (same seed, same texture) and tile seamlessly.

## Textures and patches

Like Doom wall textures, a texture is a canvas on which **patches** are placed. Each patch
lives in its own JSON file: a `template` (a generator) and its parameters.

```jsonc
// patches/castle-stone.json
{ "template": "ashlar", "size": [64, 64], "rows": { "count": 4 } }

// patches/mossy-stone.json: deep-merged over its parent, arrays are replaced
{
  "extends": "./castle-stone.json",
  "stone": { "palette": ["#2a2e22", "#4d5540", "#6f7a58", "#94a074"] }
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
      "patch": "./patches/mossy-stone.json",
      "x": 80,
      "y": 0,
      "width": 50,
      "height": 50,
      "seed": 7,
      "opacity": 0.6,
      "params": { "rows": { "count": 2 } },
    },
  ],
}
```

| Placement key     | Description                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `patch`           | patch file, relative to the texture file, or an inline patch definition |
| `x`, `y`          | position, in percent of the texture size (default 0)                    |
| `width`, `height` | size, in percent of the texture size (default: the patch's own size)    |
| `seed`            | overrides the patch seed, which overrides the texture's global seed     |
| `params`          | template parameters deep-merged over the patch file                     |
| `opacity`         | in [0, 1] (default 1)                                                   |

Patches are **regenerated** at their placed size, never stretched. "Layout" parameters
(stone widths, row count...) are expressed at the patch's own `size` and scale with it;
"detail" parameters (mortar, bevel, cracks...) are real pixels and do not. Randomness is
position-based (`hash(seed, row, column...)`), so the same seed gives the same stones at
every size. Placements crossing an edge wrap around, so textures keep tiling.

See `examples/` for working files.

## CLI

```sh
hex-tex-gen render examples/castle-wall.json -o wall.png  # render a texture file
hex-tex-gen render examples/castle-wall.json -s 99         # override the global seed
hex-tex-gen patch examples/patches/mossy-stone.json -w 128 -H 128 -p mortar.size=3
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

To add a template, implement `TextureGenerator` in `src/generators/` (its defaults must
include `size`) and register it in `src/generators/index.ts`.

## Scripts

| Script          | Purpose                                    |
| --------------- | ------------------------------------------ |
| `npm run build` | build library (ESM + CJS + d.ts) and CLI   |
| `npm run cli`   | run the CLI from source                    |
| `npm test`      | run tests                                  |
| `npm run check` | typecheck, lint, format check, test, build |
