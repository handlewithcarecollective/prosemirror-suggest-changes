import { type Node } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import {
  AddNodeMarkStep,
  AttrStep,
  RemoveNodeMarkStep,
  type ReplaceAroundStep,
  type ReplaceStep,
  type Step,
  replaceStep,
} from "prosemirror-transform";

import { trackAddNodeMarkStep } from "./addNodeMarkStep.js";
import { trackAttrStep } from "./attrStep.js";
import { applySuggestionsToSlice } from "./commands.js";
import { rebasePos } from "./rebasePos.js";
import { suggestRemoveNodeMarkStep } from "./removeNodeMarkStep.js";
import { suggestReplaceStep } from "./replaceStep.js";

/**
 * This detects and handles changes from `setNodeMarkup` so that these are tracked as a modification
 * instead of a deletion + insertion
 * (https://github.com/handlewithcarecollective/prosemirror-suggest-changes/issues/7)
 */
function suggestSetNodeMarkup(
  trackedTransaction: Transaction,
  state: EditorState,
  doc: Node,
  step: ReplaceAroundStep,
  prevSteps: Step[],
  suggestionId: number,
) {
  if (
    step.insert === 1 &&
    step.slice.size === 2 &&
    step.gapTo === step.to - 1 &&
    step.gapFrom === step.from + 1 &&
    (step as ReplaceAroundStep & { structure: boolean }).structure
  ) {
    const { modification } = state.schema.marks;
    if (!modification) {
      throw new Error(
        `Failed to apply modifications to node: schema does not contain modification mark. Did you forget to add it?`,
      );
    }

    const newNode = step.slice.content.firstChild;
    let from = rebasePos(step.from, prevSteps, trackedTransaction.steps);
    let oldNode = trackedTransaction.doc.resolve(from).nodeAfter;

    if (!newNode || !oldNode) {
      throw new Error(
        "Failed to apply modifications to node: unexpected ReplaceAroundStep as oldNode / newNode is null",
      );
    }

    const addedMarks = newNode.marks.filter(
      (m) => !oldNode?.marks.some((m2) => m2.eq(m)),
    );

    addedMarks.forEach((mark) => {
      if (mark.type === modification) {
        return;
      }
      trackAddNodeMarkStep(
        trackedTransaction,
        state,
        doc,
        new AddNodeMarkStep(step.from, mark),
        prevSteps,
        suggestionId,
      );
    });

    from = rebasePos(step.from, prevSteps, trackedTransaction.steps);
    oldNode = trackedTransaction.doc.resolve(step.from).nodeAfter;
    if (!oldNode) {
      throw new Error(
        "Failed to apply modifications to node: unexpected ReplaceAroundStep as oldNode is null",
      );
    }

    const removedMarks = oldNode.marks.filter(
      (m) => !newNode.marks.some((m2) => m2.eq(m)),
    );

    removedMarks.forEach((mark) => {
      if (mark.type === modification) {
        return;
      }
      suggestRemoveNodeMarkStep(
        trackedTransaction,
        state,
        doc,
        new RemoveNodeMarkStep(step.from, mark),
        prevSteps,
        suggestionId,
      );
    });

    if (newNode.type.name !== oldNode.type.name) {
      // Code below is similar to trackAttrStep()
      const rebasedPos = rebasePos(
        step.from,
        prevSteps,
        trackedTransaction.steps,
      );
      const $pos = trackedTransaction.doc.resolve(rebasedPos);
      const node = $pos.nodeAfter;

      if (!node) {
        throw new Error("Failed to apply modifications to node: no node found");
      }

      let marks = node.marks;
      const existingMod = marks.find(
        (mark) =>
          mark.type === modification && mark.attrs["type"] === "nodeType",
      );
      if (existingMod) {
        marks = existingMod.removeFromSet(marks);
      }
      marks = modification
        .create({
          id: suggestionId,
          type: "nodeType",
          previousValue: node.type.name,
          newValue: newNode.type.name,
        })
        .addToSet(marks);

      trackedTransaction.setNodeMarkup(rebasedPos, newNode.type, null, marks);
    }

    const attrNames = new Set([
      ...Object.keys(newNode.attrs),
      ...Object.keys(oldNode.attrs),
    ]);
    for (const attr of attrNames) {
      if (newNode.attrs[attr] !== oldNode.attrs[attr]) {
        // delegate to trackAttrStep to handle the attribute change
        trackAttrStep(
          trackedTransaction,
          state,
          doc,
          new AttrStep(step.from, attr, newNode.attrs[attr]),
          prevSteps,
          suggestionId,
        );
      }
    }

    return true;
  }
  return false;
}

/**
 * Transform a replace around step into its equivalent tracked steps.
 *
 * Replace around steps are treated as replace steps in this model. An
 * equivalent replace step will be generated, and then processed via
 * trackReplaceStep().
 */
export function suggestReplaceAroundStep(
  trackedTransaction: Transaction,
  state: EditorState,
  doc: Node,
  step: ReplaceAroundStep,
  prevSteps: Step[],
  suggestionId: number,
) {
  const handled = suggestSetNodeMarkup(
    trackedTransaction,
    state,
    doc,
    step,
    prevSteps,
    suggestionId,
  );

  if (handled) {
    return true;
  }

  const applied = step.apply(doc).doc;
  if (!applied) return false;
  const from = step.getMap().map(step.from, -1);
  const to = step.getMap().map(step.to, 1);
  const blockRange = applied.resolve(from).blockRange(applied.resolve(to));
  if (!blockRange) return false;
  const replace = replaceStep(
    doc,
    step.getMap().invert().map(blockRange.start),
    step.getMap().invert().map(blockRange.end),
    applySuggestionsToSlice(applied.slice(blockRange.start, blockRange.end)),
  );
  if (!replace) return false;
  return suggestReplaceStep(
    trackedTransaction,
    state,
    doc,
    replace as ReplaceStep,
    prevSteps,
    suggestionId,
  );
}
