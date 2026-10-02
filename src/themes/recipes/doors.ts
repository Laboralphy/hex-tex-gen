import { hashSeed } from '../../core/hash';
import { varyPalette } from '../color';
import { pickInt, pickOne } from '../pick';
import {
    SALT_DOOR,
    SALT_DOOR_BANDS,
    SALT_DOOR_HANDLE,
    SALT_DOOR_PANELS,
    SALT_METAL_DOOR,
} from '../salts';
import type { Theme, TextureRecipe } from '../types';

/** the leaves of a door: one, hinged on the left so that it opens from right to left, or two */
type Leaves = 'single' | 'double';

/** lightness of the wood of a fancy door, as a share of the wood of the wall */
const DOOR_WOOD = 0.5;

/**
 * The wood of the fancy doors of interiors: the wood of the wall, much darker and of its
 * two middle colors only, so that the grain stays calm and the raised panels stand out.
 */
function doorWood(theme: Theme): { wood?: { palette: string[] } } {
    const wood = (theme.wall.wood as { palette?: string[] } | undefined)?.palette;
    return wood && wood.length >= 2
        ? {
              wood: {
                  palette: varyPalette(wood.length > 2 ? wood.slice(1, 3) : wood, {
                      hue: 0,
                      saturation: 1,
                      lightness: DOOR_WOOD,
                  }),
              },
          }
        : {};
}

/** the doors of each ambiance: fancy panelled doors in interiors, rough planks in caves */
const STYLES = { interior: 'fancy', dungeon: 'solid', cave: 'rough', church: 'solid' } as const;

/**
 * A door filling the whole texture, as wide and high as the walls, as worn as the
 * decorations of the theme; its bands, handle and panels drawn from the seed.
 * @param material wood, of a style, or metal
 * @param wood extra parameters of a wooden door drawn from the theme, such as a wood
 */
function doorRecipe(
    name: string,
    description: string,
    ambiance: string,
    leaves: Leaves,
    salt: number,
    material: { material: 'wood'; style: 'rough' | 'solid' | 'fancy' } | { material: 'metal' },
    wood: (theme: Theme) => Record<string, unknown> = () => ({}),
): TextureRecipe {
    return {
        name,
        description,
        ambiances: [ambiance],
        build(theme, seed, size) {
            const own = hashSeed(hashSeed(seed, salt), leaves === 'single' ? 0 : 1);
            const fancy = material.material === 'wood' && material.style === 'fancy';
            return {
                size,
                seed: own,
                patches: [
                    {
                        id: 'door',
                        patch: {
                            template: 'door',
                            size,
                            kind: leaves,
                            // a single door opens from right to left: its handle on the right
                            hinge: 'left',
                            ...material,
                            ...(material.material === 'wood' ? wood(theme) : {}),
                            ...(fancy
                                ? {
                                      panels: {
                                          columns:
                                              leaves === 'single'
                                                  ? pickInt(1, 2, own, SALT_DOOR_PANELS)
                                                  : 1,
                                          rows: pickInt(2, 4, own, SALT_DOOR_PANELS),
                                      },
                                  }
                                : {}),
                            // fancy doors have no iron straps across their panels
                            bands: { count: fancy ? 0 : pickInt(1, 3, own, SALT_DOOR_BANDS) },
                            handle: {
                                kind: pickOne(['ring', 'bar'] as const, own, SALT_DOOR_HANDLE),
                            },
                            age: theme.decor.age,
                        },
                        width: 100,
                        height: 100,
                    },
                ],
            };
        },
    };
}

/** the wooden doors of an ambiance, single and double, of its style */
function woodenDoors(ambiance: keyof typeof STYLES): TextureRecipe[] {
    const style = STYLES[ambiance];
    // fancy doors of the wood of the wall of planks, darker
    const wood = ambiance === 'interior' ? doorWood : undefined;
    return (['single', 'double'] as const).map((leaves) =>
        doorRecipe(
            `door-${leaves}`,
            `a ${style} wooden ${leaves} door, filling the texture${leaves === 'single' ? ', opening from right to left' : ''}`,
            ambiance,
            leaves,
            SALT_DOOR,
            { material: 'wood', style },
            wood,
        ),
    );
}

/** the wooden doors of dungeons, caves, interiors and churches */
export const [dungeonDoorSingle, dungeonDoorDouble] = woodenDoors('dungeon');
export const [caveDoorSingle, caveDoorDouble] = woodenDoors('cave');
export const [interiorDoorSingle, interiorDoorDouble] = woodenDoors('interior');
export const [churchDoorSingle, churchDoorDouble] = woodenDoors('church');

/** the metal doors of dungeons, single and double */
export const [metalDoorSingle, metalDoorDouble] = (['single', 'double'] as const).map((leaves) =>
    doorRecipe(
        `metal-door-${leaves}`,
        `a metal ${leaves} door, filling the texture${leaves === 'single' ? ', opening from right to left' : ''}`,
        'dungeon',
        leaves,
        SALT_METAL_DOOR,
        { material: 'metal' },
    ),
);
