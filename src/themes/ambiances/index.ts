import type { Ambiance } from '../types';
import { cave } from './cave';
import { dungeon } from './dungeon';

export { cave } from './cave';
export { dungeon } from './dungeon';

/**
 * Every ambiance, by name. A seed with no ambiance draws one in this order: append new
 * ambiances at the end, knowing that the seeds drawing them will change sets.
 */
export const ambiances: Record<string, Ambiance> = { dungeon, cave };
