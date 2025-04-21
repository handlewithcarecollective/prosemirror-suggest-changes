import { type Node } from "prosemirror-model";
import { type EditorState, type Transaction } from "prosemirror-state";
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
  type Step,
} from "prosemirror-transform";

import { trackAddMarkStep } from "./addMarkStep.js";
import { trackAddNodeMarkStep } from "./addNodeMarkStep.js";
import { trackAttrStep } from "./attrStep.js";
import { suggestRemoveMarkStep } from "./removeMarkStep.js";
import { suggestRemoveNodeMarkStep } from "./removeNodeMarkStep.js";
import { suggestReplaceAroundStep } from "./replaceAroundStep.js";
import { suggestReplaceStep } from "./replaceStep.js";
import { type EditorView } from "prosemirror-view";
import { isSuggestChangesEnabled, suggestChangesKey } from "./plugin.js";

type StepHandler<S extends Step> = (
  trackedTransaction: Transaction,
  state: EditorState,
  doc: Node,
  step: S,
  prevSteps: Step[],
  suggestionId: number,
) => boolean;

function getStepHandler<S extends Step>(step: S): StepHandler<S> {
  if (step instanceof ReplaceStep) {
    return suggestReplaceStep as unknown as StepHandler<S>;
  }
  if (step instanceof ReplaceAroundStep) {
    return suggestReplaceAroundStep as unknown as StepHandler<S>;
  }
  if (step instanceof AddMarkStep) {
    return trackAddMarkStep as unknown as StepHandler<S>;
  }
  if (step instanceof RemoveMarkStep) {
    return suggestRemoveMarkStep as unknown as StepHandler<S>;
  }
  if (step instanceof AddNodeMarkStep) {
    return trackAddNodeMarkStep as unknown as StepHandler<S>;
  }
  if (step instanceof RemoveNodeMarkStep) {
    return suggestRemoveNodeMarkStep as unknown as StepHandler<S>;
  }
  if (step instanceof AttrStep) {
    return trackAttrStep as unknown as StepHandler<S>;
  }
  if (step instanceof AddNodeMarkStep) {
    return trackAddNodeMarkStep as unknown as StepHandler<S>;
  }

  // Default handler — simply rebase the step onto the
  // tracked transaction and apply it.
  return (
    trackedTransaction: Transaction,
    _state: EditorState,
    _doc: Node,
    step: S,
    prevSteps: Step[],
  ) => {
    const reset = prevSteps
      .reverse()
      .reduce<Step | null>(
        (acc, step) => acc?.map(step.getMap().invert()) ?? null,
        step,
      );

    const rebased = trackedTransaction.steps.reduce(
      (acc, step) => acc?.map(step.getMap()) ?? null,
      reset,
    );

    if (rebased) {
      trackedTransaction.step(rebased);
    }
    return false;
  };
}

/**
 * Given a standard transaction from ProseMirror, produce
 * a new transaction that tracks the changes from the original,
 * rather than applying them.
 *
 * For each type of step, we implement custom behavior to prevent
 * deletions from being removed from the document, instead adding
 * deletion marks, and ensuring that all insertions have insertion
 * marks.
 */
export function transformToSuggestionTransaction(
  originalTransaction: Transaction,
  state: EditorState,
) {
  const { deletion, insertion, modification } = state.schema.marks;
  if (!deletion) {
    throw new Error(
      `Failed to transform to suggestion: schema does not contain deletion mark. Did you forget to add it?`,
    );
  }
  if (!insertion) {
    throw new Error(
      `Failed to transform to suggestion: schema does not contain insertion mark. Did you forget to add it?`,
    );
  }
  if (!modification) {
    throw new Error(
      `Failed to transform to suggestion: schema does not contain modification mark. Did you forget to add it?`,
    );
  }

  // Find the highest change id in the document so far,
  // and use that as the starting point for new changes
  let suggestionId = 0;
  originalTransaction.docs[0]?.descendants((node) => {
    const mark = node.marks.find(
      (mark) =>
        mark.type === insertion ||
        mark.type === deletion ||
        mark.type === modification,
    );
    if (mark) {
      suggestionId = Math.max(suggestionId, mark.attrs["id"] as number);
      return false;
    }
    return true;
  });
  suggestionId++;

  // Create a new transaction from scratch. The original transaction
  // is going to be dropped in favor of this one.
  const trackedTransaction = state.tr;

  for (let i = 0; i < originalTransaction.steps.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const step = originalTransaction.steps[i]!;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const doc = originalTransaction.docs[i]!;

    const stepTracker = getStepHandler(step);
    if (
      stepTracker(
        trackedTransaction,
        state,
        doc,
        step,
        originalTransaction.steps.slice(0, i),
        suggestionId,
      )
    ) {
      // If the suggestionId was used by one of the step handlers,
      // increment it so that it's not reused.
      suggestionId++;
    }
    continue;
  }

  if (originalTransaction.selectionSet && !trackedTransaction.selectionSet) {
    // Map the original selection backwards through the original transaction,
    // and then forwards through the new one.

    const originalBaseDoc = originalTransaction.docs[0];
    const base = originalBaseDoc
      ? originalTransaction.selection.map(
          originalBaseDoc,
          originalTransaction.mapping.invert(),
        )
      : originalTransaction.selection;

    trackedTransaction.setSelection(
      base.map(trackedTransaction.doc, trackedTransaction.mapping),
    );
  }

  if (originalTransaction.scrolledIntoView) {
    trackedTransaction.scrollIntoView();
  }

  if (originalTransaction.storedMarksSet) {
    trackedTransaction.setStoredMarks(originalTransaction.storedMarks);
  }

  // @ts-expect-error Preserve original transaction meta exactly as-is
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  trackedTransaction.meta = originalTransaction.meta;

  return trackedTransaction;
}

/**
 * A `dispatchTransaction` decorator. Wrap your existing `dispatchTransaction`
 * function with `withSuggestChanges`, or pass no arguments to use the default
 * implementation (`view.setState(view.state.apply(tr))`).
 *
 * The result is a `dispatchTransaction` function that will intercept
 * and modify incoming transactions when suggest changes is enabled.
 * These modified transactions will suggest changes instead of directly
 * applying them, e.g. by marking a range with the deletion mark rather
 * than removing it from the document.
 */
export function withSuggestChanges(
  dispatchTransaction?: EditorView["dispatch"],
): EditorView["dispatch"] {
  const dispatch =
    dispatchTransaction ??
    function (this: EditorView, tr: Transaction) {
      this.updateState(this.state.apply(tr));
    };

  return function dispatchTransaction(this: EditorView, tr: Transaction) {
    const transaction =
      isSuggestChangesEnabled(this.state) &&
      !tr.getMeta("history$") &&
      !tr.getMeta("collab$") &&
      !("skip" in (tr.getMeta(suggestChangesKey) ?? {}))
        ? transformToSuggestionTransaction(tr, this.state)
        : tr;
    dispatch.call(this, transaction);
  };
}
