/**
 * Splits a span into compartments along one axis: a frame at both ends, then `count`
 * compartments of nearly equal size, separated by dividers.
 * @param total length of the span, in pixels
 * @param frame width of the frame at each end, in pixels
 * @param divider width of the dividers between compartments, in pixels
 * @returns [start, end) of each compartment
 */
export function splitSpan(
    total: number,
    frame: number,
    divider: number,
    count: number,
): [number, number][] {
    const room = Math.max(count, total - 2 * frame - (count - 1) * divider);
    return Array.from({ length: count }, (_, i) => [
        frame + Math.round((i * room) / count) + i * divider,
        frame + Math.round(((i + 1) * room) / count) + i * divider,
    ]);
}
