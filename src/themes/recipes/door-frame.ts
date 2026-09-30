import { hashSeed } from '../../core/hash';
import { SALT_DOOR_FRAME, SALT_PLAIN_WALL } from '../salts';
import type { TextureRecipe } from '../types';

/** own width of the slot, in pixels: its strips keep theirs, the gap takes the rest */
const SLOT_WIDTH = 10;

/**
 * The plain wall of the set, same stones included, with the slot a sliding door disappears
 * into running down its middle: the side of a doorway, next to the door. The slot ages
 * with the wall.
 */
export const doorFrame: TextureRecipe = {
    name: 'door-frame',
    description: 'the plain wall, with a door slot running down its middle',
    ambiances: ['dungeon', 'cave'],
    build(theme, seed, size) {
        const [width, height] = size;
        const slot = Math.round((SLOT_WIDTH / width) * 10000) / 100;
        return {
            size,
            // the seed of the plain wall: the same stones on each side of the slot
            seed: hashSeed(seed, SALT_PLAIN_WALL),
            patches: [
                { id: 'wall', patch: theme.wall, width: 100, height: 100 },
                {
                    id: 'slot',
                    patch: {
                        template: 'slot',
                        size: [SLOT_WIDTH, height],
                        ...(typeof theme.wall.age === 'number' ? { age: theme.wall.age } : {}),
                    },
                    x: Math.round((50 - slot / 2) * 100) / 100,
                    y: 0,
                    width: slot,
                    height: 100,
                    wrap: false,
                    seed: hashSeed(seed, SALT_DOOR_FRAME),
                },
            ],
        };
    },
};
