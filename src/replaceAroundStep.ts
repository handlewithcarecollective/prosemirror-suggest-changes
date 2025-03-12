import { type Node } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import {
  type ReplaceAroundStep,
  type ReplaceStep,
  type Step,
  replaceStep,
} from "prosemirror-transform";

import { applySuggestionsToSlice } from "./commands.js";
import { suggestReplaceStep } from "./replaceStep.js";

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
