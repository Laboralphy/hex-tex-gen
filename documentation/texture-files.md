# Texture files

A texture file places patches on a canvas:

```json
{
  "$schema": "../schemas/texture.schema.json",
  "size": [128, 128],
  "seed": 1234,
  "background": "#000",
  "patches": [
    { "id": "wall", "patch": "./patches/castle-stone.json", "width": 100, "height": 100 },
    { "patch": "./patches/large-blocks.json", "y": 75, "width": 100, "height": 25, "seed": 7 }
  ]
}
```

| Key          | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `size`       | texture size in pixels, `[width, height]`                          |
| `seed`       | global seed, 0 by default; `hex-tex-gen render -s` overrides it    |
| `background` | CSS color under the patches, opaque black by default               |
| `patches`    | placements, drawn in order: later ones are drawn over earlier ones |
| `$schema`    | JSON Schema of the file, for editors; ignored when rendering       |

Every key is listed in the [file reference](reference/file-reference.md).

```sh
hex-tex-gen render castle-wall.json -o castle-wall.png
```

## Placements

A placement draws a patch on the texture:

| Key               | Description                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `patch`           | patch file, relative to the texture file, or [inline patch](patch-files.md#inline-patches) |
| `x`, `y`          | top-left corner, in **percent** of the texture size; 0 by default                          |
| `width`, `height` | size, in **percent** of the texture size; the patch's own size by default                  |
| `seed`            | seed of this placement; the patch seed, else the texture seed, by default                  |
| `params`          | template parameters deep-merged over the patch file, for this placement only               |
| `opacity`         | in [0, 1], 1 by default                                                                    |
| `id`              | name other placements use to [anchor](#anchors) on this one                                |
| `anchor`          | repeats the patch on the anchor points of a previous placement, see [below](#anchors)      |

Positions and sizes are percentages, rounded to the nearest pixel: `"y": 75` on a 128-pixel
texture is pixel 96. Omit `width` or `height` to keep the patch's own size on that axis,
in pixels.

The patch is **regenerated** at its placed size, never stretched: see
[Own size and resizing](concepts.md#own-size-and-resizing). A placement crossing an edge
wraps around to the opposite edge, so textures keep tiling.

`params` tweaks a patch for one placement without writing a new file:

```json
{ "patch": "./patches/castle-stone.json", "params": { "age": 0.9, "rows": { "count": 6 } } }
```

`opacity` blends the patch over what is already drawn; patches with transparent pixels,
such as [`moss`](templates/moss.md), blend with their own alpha too.

## Anchors

Templates report **anchor points**: named points computed while rendering, in pixels of
the rendered patch. The walls ([`ashlar`](templates/ashlar.md#anchors),
[`bricks`](templates/bricks.md#anchors) and [`panel`](templates/panel.md#anchors)) report:

| Anchor        | Points                                                             |
| ------------- | ------------------------------------------------------------------ |
| `rows`        | the top-left of the stone faces of each row, just below the mortar |
| `stones`      | the top-left corner of each stone face                             |
| `panel`       | the top-left corner of the face of the slab, when `panel.enabled`  |
| `panelCenter` | the center of the face of the slab, when `panel.enabled`           |

An anchor places the **top-left corner** of each copy on its point. To center a patch on a
point, such as a switch on `panelCenter`, shift it by half its size with `offset`: see
[`panel`](templates/panel.md#usage).

A placement with an `anchor` is repeated on the anchor points of a previous placement,
instead of being placed with `x` and `y`:

```json
{
  "size": [128, 128],
  "seed": 1234,
  "patches": [
    { "id": "wall", "patch": "./patches/castle-stone.json", "width": 100, "height": 100 },
    {
      "id": "base",
      "patch": "./patches/large-blocks.json",
      "y": 75,
      "width": 100,
      "height": 25,
      "seed": 7
    },
    {
      "patch": "./patches/moss.json",
      "anchor": { "to": "wall", "at": "rows" },
      "width": 100,
      "height": 25,
      "seed": 11
    },
    {
      "patch": "./patches/moss.json",
      "anchor": { "to": "base", "at": "rows", "only": [0] },
      "width": 100,
      "height": 25,
      "seed": 14
    }
  ]
}
```

![moss anchored under every joint](images/anchors.png)

The moss hangs right under each joint, whatever the seed, the size or the number of rows
of the wall: anchors follow the patch they belong to.

| Anchor key | Description                                                                     |
| ---------- | ------------------------------------------------------------------------------- |
| `to`       | `id` of a previous placement, which must not be anchored itself                 |
| `at`       | anchor name, declared by the template of that placement                         |
| `only`     | indices of the points to use, from 0; all of them by default                    |
| `ratio`    | share of the visible points to use, from 0 to 1, picked at random; 1 by default |
| `offset`   | `[dx, dy]` shift from each point, in **pixels**; `[0, 0]` by default            |

Rules:

- **hidden points are skipped**: a point covered by an opaque placement drawn after the
  anchor's target is not used. Above, the fourth row of the wall is hidden by the large
  blocks, and gets no moss. Overlays (such as `moss`), anchored placements and placements
  with an `opacity` below 1 hide nothing;
- **each copy has its own seed**, derived from the placement seed and the index of its
  point, so the copies differ, and filtering points with `only` does not change the look
  of the ones kept;
- **`ratio` picks a random share of the points**: `0.5` keeps half of them, exactly
  (rounded), chosen with the placement seed. Only the points left by `only` and not hidden
  count: with 8 visible rows, `"ratio": 0.5` gives 4 of them. Raising the ratio only adds
  points, lowering it only removes some, so the amount can be tuned without the rest
  moving; change the `seed` of the placement to pick another subset;
- an anchored placement cannot set `x` or `y`: use `offset`;
- `width` and `height` still size each copy, in percent of the texture.

## Errors

A texture is validated before anything is rendered. Errors name the file and the path of
each problem, with array indices:

```
castle-wall.json: patches[2].anchor: no previous placement with id "wal"
castle-wall.json: patches[1].opacity: Too big: expected number to be <=1
```
