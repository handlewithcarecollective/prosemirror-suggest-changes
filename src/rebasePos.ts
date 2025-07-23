import { type Step } from "prosemirror-transform";

/**
 * Rebase a position onto a new lineage of steps
 *
 * @param pos The position to rebase
 * @param back The old steps to undo, in the order they were originally applied
 * @param forth The new steps to map through
 */
export function rebasePos(pos: number, back: Step[], forth: Step[]) {
  const reset = back
    .slice()
    .reverse()
    .reduce((acc, step) => step.getMap().invert().map(acc), pos);
  return forth.reduce((acc, step) => step.getMap().map(acc), reset);
}
