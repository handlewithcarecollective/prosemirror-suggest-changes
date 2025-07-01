import { type Node } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import {
  type RemoveMarkStep,
  type ReplaceStep,
  type Step,
  replaceStep,
} from "prosemirror-transform";

import { applySuggestionsToSlice } from "./commands.js";
import { suggestReplaceStep } from "./replaceStep.js";

/**
 * Transform a remove mark step into its equivalent tracked steps.
 *
 * Add mark steps are treated as replace steps in this model. An
 * equivalent replace step will be generated, and then processed via
 * trackReplaceStep().
 */
export function suggestRemoveMarkStep(
  trackedTransaction: Transaction,
  state: EditorState,
  doc: Node,
  step: RemoveMarkStep,
  prevSteps: Step[],
  suggestionId: string,
): boolean {
  const applied = step.apply(doc).doc;
  if (!applied) return false;
  const slice = applied.slice(step.from, step.to);
  const replace = replaceStep(
    doc,
    step.from,
    step.to,
    applySuggestionsToSlice(slice),
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
