import type { TextureRecipe } from '../types';
import { plainWall } from './plain-wall';
import { splatteredWall } from './splattered-wall';

export { plainWall } from './plain-wall';
export { splatteredWall } from './splattered-wall';

/**
 * Every texture recipe, in the order of the textures of a set.
 */
export const recipes: TextureRecipe[] = [plainWall, splatteredWall];
