import type { Ambiance } from '../types';
import { cave } from './cave';
import { church } from './church';
import { dungeon } from './dungeon';
import { interior } from './interior';

export { cave } from './cave';
export { church } from './church';
export { dungeon } from './dungeon';
export { interior } from './interior';

/**
 * Every ambiance, by name. A seed with no ambiance draws one in this order: append new
 * ambiances at the end, knowing that the seeds drawing them will change sets.
 */
export const ambiances: Record<string, Ambiance> = { dungeon, cave, interior, church };
