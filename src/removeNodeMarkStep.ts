import { type Node } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import { type RemoveNodeMarkStep, type Step } from "prosemirror-transform";

import { rebasePos } from "./rebasePos.js";

/**
 * Transform a remove node mark step into its equivalent tracked steps.
 *
 * Remove node mark steps are processed normally, and then a modification
 * mark is added to the node as well, to track the change.
 */
export function suggestRemoveNodeMarkStep(
  trackedTransaction: Transaction,
  state: EditorState,
  _doc: Node,
  step: RemoveNodeMarkStep,
  prevSteps: Step[],
  suggestionId: number,
) {
  const { modification } = state.schema.marks;
  if (!modification) {
    throw new Error(
      `Failed to apply modifications to node: schema does not contain modification mark. Did you forget to add it?`,
    );
  }

  const rebasedPos = rebasePos(step.pos, prevSteps, trackedTransaction.steps);
  const $pos = trackedTransaction.doc.resolve(rebasedPos);
  const node = $pos.nodeAfter;
  let marks = node?.marks ?? [];
  const existingMod = marks.find(
    (mark) =>
      mark.type === modification &&
      mark.attrs["type"] === "mark" &&
      mark.attrs["newValue"] &&
      step.mark.eq(state.schema.markFromJSON(mark.attrs["newValue"])),
  );
  if (existingMod) {
    trackedTransaction.removeNodeMark(rebasedPos, existingMod);
    trackedTransaction.removeNodeMark(
      rebasedPos,
      state.schema.markFromJSON(existingMod.attrs["newValue"]),
    );
    return false;
  }
  marks = step.mark.removeFromSet(marks);
  marks = modification
    .create({
      id: suggestionId,
      type: "mark",
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      previousValue: step.mark.toJSON(),
      newValue: null,
    })
    .addToSet(marks);
  trackedTransaction.setNodeMarkup(rebasedPos, null, null, marks);
  return true;
}
