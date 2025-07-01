import { type Node } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import { type AttrStep, type Step } from "prosemirror-transform";

import { rebasePos } from "./rebasePos.js";

/**
 * Transform an attr mark step into its equivalent tracked steps.
 *
 * Attr steps are processed normally, and then a modification
 * mark is added to the node as well, to track the change.
 */
export function trackAttrStep(
  trackedTransaction: Transaction,
  state: EditorState,
  _doc: Node,
  step: AttrStep,
  prevSteps: Step[],
  suggestionId: string,
): boolean {
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
      mark.attrs["type"] === "attr" &&
      mark.attrs["attrName"] === step.attr,
  );
  if (existingMod) {
    marks = existingMod.removeFromSet(marks);
  }
  marks = modification
    .create({
      id: suggestionId,
      type: "attr",
      attrName: step.attr,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      previousValue: node?.attrs[step.attr],
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      newValue: step.value,
    })
    .addToSet(marks);
  trackedTransaction.setNodeMarkup(
    rebasedPos,
    null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    { ...node?.attrs, [step.attr]: step.value },
    marks,
  );
  return true;
}
