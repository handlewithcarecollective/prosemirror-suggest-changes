import { type Slice, type Node } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import {
  type ReplaceAroundStep,
  type ReplaceStep,
  type Step,
  replaceStep,
} from "prosemirror-transform";

import { applySuggestionsToSlice } from "./commands.js";
import { suggestReplaceStep } from "./replaceStep.js";

function expandSliceUntilFlat(
  doc: Node,
  slice: Slice,
  from: number,
  to: number,
) {
  if (!slice.openStart && !slice.openEnd) {
    return {
      slice,
      from,
      to,
    };
  }
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);

  const expandedFrom = slice.openStart
    ? $from.before($from.depth - (slice.openStart - 1))
    : from;
  const expandedTo = slice.openEnd
    ? $to.before($to.depth - (slice.openStart - 1))
    : to;

  const expanded = doc.slice(expandedFrom, to);

  return { slice: expanded, from: expandedFrom, to: expandedTo };
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
  const applied = step.apply(doc).doc;
  if (!applied) return false;
  const from = step.getMap().map(step.from, -1);
  const to = step.getMap().map(step.to, 1);
  const slice = applied.slice(from, to);
  const {
    slice: expanded,
    from: expandedFrom,
    to: expandedTo,
  } = expandSliceUntilFlat(applied, slice, from, to);
  const replace = replaceStep(
    doc,
    step.getMap().invert().map(expandedFrom),
    step.getMap().invert().map(expandedTo),
    applySuggestionsToSlice(expanded),
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
