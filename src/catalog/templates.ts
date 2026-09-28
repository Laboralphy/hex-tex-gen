import { generators } from '../generators';
import type { Category } from '../generators/types';

/**
 * A template as a picker shows it.
 */
export type TemplateInfo = {
    name: string;
    description: string;
    category: Category;
    /** transparent by design, laid over another patch */
    overlay: boolean;
    /** own size of the template, in pixels */
    size: [number, number];
    /** the template has an `age`, which sets its wear */
    ages: boolean;
    /** names and descriptions of the anchors it reports */
    anchors: Record<string, string>;
};

/**
 * Every built-in template, in the order of the registry.
 */
export function templateCatalog(): TemplateInfo[] {
    return Object.values(generators).map((g) => ({
        name: g.name,
        description: g.description,
        category: g.category,
        overlay: g.overlay === true,
        size: [...g.defaults.size] as [number, number],
        ages: 'age' in g.defaults,
        anchors: { ...(g.anchors ?? {}) },
    }));
}
