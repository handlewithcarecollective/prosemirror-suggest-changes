import { type Node } from "prosemirror-model";
import {
  type EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { type ReplaceStep, type Step } from "prosemirror-transform";

import { findSuggestionMarkEnd } from "./findSuggestionMarkEnd.js";
import { rebasePos } from "./rebasePos.js";

/**
 * Transform a replace step into its equivalent tracked steps.
 *
 * Any deletions of slices that are _not_ within existing
 * insertion marks will be replaced with addMark steps that add
 * deletion marks to those ranges.
 *
 * Any deletions of slices that _are_ within existing insertion
 * marks will actually be deleted.
 *
 * Any slices that are to be inserted will also be marked with
 * insertion marks.
 *
 * If a deletion begins at the very end of a textblock, a zero-width
 * space will be inserted at the end of that texblock and given
 * a deletion mark.
 *
 * Similarly, if a deletion ends at the very beginning fo a textblock,
 * a zero-width space will be inserted at the beginning of that
 * textblock and given a deletion mark.
 *
 * If an insertion slice is open on either end, and there is no content
 * adjacent to the open end(s), zero-width spaces
 * will be added at the open end(s) and given insertion marks.
 *
 * After all of the above have been evaluated, if the resulting
 * insertion or deletion marks abut or join existing marks, they
 * will be joined and given the same ids. Any no-longer-necessary
 * zero-width spaces will be removed.
 */
export function suggestReplaceStep(
  trackedTransaction: Transaction,
  state: EditorState,
  doc: Node,
  step: ReplaceStep,
  prevSteps: Step[],
  suggestionId: string,
) {
  const { deletion, insertion } = state.schema.marks;
  if (!deletion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain deletion mark. Did you forget to add it?`,
    );
  }
  if (!insertion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain insertion mark. Did you forget to add it?`,
    );
  }

  // Check for insertion and deletion marks directly
  // adjacent to this step's boundaries. If they exist,
  // we'll use their ids, rather than producing a new one
  const nodeBefore = doc.resolve(step.from).nodeBefore;
  const markBefore =
    nodeBefore?.marks.find(
      (mark) => mark.type === deletion || mark.type === insertion,
    ) ?? null;
  const nodeAfter = doc.resolve(step.to).nodeAfter;
  const markAfter =
    nodeAfter?.marks.find(
      (mark) => mark.type === deletion || mark.type === insertion,
    ) ?? null;

  const markId =
    (markBefore?.attrs["id"] as string | undefined) ??
    (markAfter?.attrs["id"] as string | undefined) ??
    suggestionId;

  const insertedRanges: { from: number; to: number }[] = [];
  // Rebase this step's boundaries onto the newest doc
  let stepFrom = rebasePos(step.from, prevSteps, trackedTransaction.steps);
  let stepTo = rebasePos(step.to, prevSteps, trackedTransaction.steps);

  if (state.selection.empty && stepFrom !== stepTo) {
    trackedTransaction.setSelection(
      TextSelection.near(trackedTransaction.doc.resolve(stepFrom)),
    );
  }

  // Make a list of any existing insertions that fall within the
  // range that this step is trying to delete. These will be actually
  // deleted, rather than marked as deletions.
  trackedTransaction.doc.nodesBetween(stepFrom, stepTo, (node, pos) => {
    if (insertion.isInSet(node.marks)) {
      insertedRanges.push({
        from: Math.max(pos, stepFrom),
        to: Math.min(pos + node.nodeSize, step.to),
      });
      return false;
    }
    return true;
  });

  // Delete the previously-inserted ranges for real
  for (const range of insertedRanges) {
    trackedTransaction.delete(range.from, range.to);
  }

  // Update the step boundaries, since we may have just changed
  // the document
  stepFrom = rebasePos(step.from, prevSteps, trackedTransaction.steps);
  stepTo = rebasePos(step.to, prevSteps, trackedTransaction.steps);

  // If there's a deletion, we need to check for and handle
  // the case where it crosses a block boundary, so that we
  // can leave zero-width spaces as markers if there's no other
  // content to anchor the deletion to.
  if (stepFrom !== stepTo) {
    let $stepFrom = trackedTransaction.doc.resolve(stepFrom);
    let $stepTo = trackedTransaction.doc.resolve(stepTo);
    // When there are no characters to mark with deletions before
    // the end of a block, we add zero-width, non-printable
    // characters as markers to indicate that a deletion exists
    // and crosses a block boundary. This allows us to render the
    // deleted boundary with a widget, as well as properly handle
    // future, adjacent deletions and insertions.
    if (
      !$stepFrom.nodeAfter &&
      !deletion.isInSet($stepFrom.nodeBefore?.marks ?? [])
    ) {
      trackedTransaction.insertText("\u200B", stepFrom);
      stepTo++;
      $stepTo = trackedTransaction.doc.resolve(stepTo);
    }

    if (
      !$stepTo.nodeBefore &&
      !deletion.isInSet($stepTo.nodeAfter?.marks ?? [])
    ) {
      trackedTransaction.insertText("\u200B", stepTo);
      stepTo++;
      $stepTo = trackedTransaction.doc.resolve(stepTo);
    }

    // When we produce a deletion mark that directly abuts
    // an existing mark with a zero-width space, we delete
    // that space. We'll join the marks later, and can use
    // the joined marks to find deletions across the block
    // boundary
    if (
      $stepFrom.nodeBefore?.text?.endsWith("\u200B") &&
      !$stepTo.nodeAfter?.text?.startsWith("\u200B")
    ) {
      trackedTransaction.delete(stepFrom - 1, stepFrom);
      stepFrom--;
      stepTo--;
      $stepFrom = trackedTransaction.doc.resolve(stepFrom);
      $stepTo = trackedTransaction.doc.resolve(stepTo);
    }

    if (
      $stepTo.nodeAfter?.text?.startsWith("\u200B") &&
      !$stepFrom.nodeBefore?.text?.endsWith("\u200B")
    ) {
      trackedTransaction.delete(stepTo, stepTo + 1);
    }

    // If the user is deleting exactly a zero-width space,
    // delete the space and also shift the range back by one,
    // so that they actually mark the character before the
    // zero-width space as deleted. The user doesn't know
    // the zero-width space is there, so deleting it would
    // appear to do nothing
    if (
      $stepFrom.nodeBefore &&
      stepTo - stepFrom === 1 &&
      trackedTransaction.doc.textBetween(stepFrom, stepTo) === "\u200B"
    ) {
      trackedTransaction.delete(stepFrom, stepTo);
      stepFrom--;
      stepTo--;
      $stepFrom = trackedTransaction.doc.resolve(stepFrom);
      $stepTo = trackedTransaction.doc.resolve(stepTo);
      trackedTransaction.setSelection(TextSelection.near($stepFrom));
    }
  }

  // TODO: Even if the range doesn't map to a block
  // range, check whether it contains any whole
  // blocks, so that we can use node marks on those.
  //
  // If the deleted range maps precisely to a block
  // range. If they do, add node marks to the nodes
  // in the range, rather than using inline marks
  // on the content.
  const blockRange = trackedTransaction.doc
    .resolve(stepFrom)
    .blockRange(trackedTransaction.doc.resolve(stepTo));

  if (
    !blockRange ||
    blockRange.start !== stepFrom ||
    blockRange.end !== stepTo
  ) {
    trackedTransaction.addMark(
      stepFrom,
      stepTo,
      deletion.create({ id: markId }),
    );
  } else {
    trackedTransaction.doc.nodesBetween(
      blockRange.start,
      blockRange.end,
      (_, pos) => {
        if (pos < blockRange.start) return true;
        trackedTransaction.addNodeMark(pos, deletion.create({ id: markId }));
        return false;
      },
    );
  }

  // Detect when a new mark directly abuts an existing mark with
  // a different id and merge them
  if (nodeAfter && markAfter && markAfter.attrs["id"] !== markId) {
    const $nodeAfterStart = trackedTransaction.doc.resolve(stepTo);
    const nodeAfterEnd = $nodeAfterStart.pos + nodeAfter.nodeSize;
    trackedTransaction.removeMark(stepTo, nodeAfterEnd, markAfter.type);
    trackedTransaction.addMark(
      stepTo,
      nodeAfterEnd,
      markAfter.type.create({ id: markId }),
    );
    if (markAfter.type === deletion) {
      const insertionNode =
        trackedTransaction.doc.resolve(nodeAfterEnd).nodeAfter;
      if (insertionNode && insertion.isInSet(insertionNode.marks)) {
        const insertionNodeEnd = nodeAfterEnd + insertionNode.nodeSize;
        trackedTransaction.removeMark(
          nodeAfterEnd,
          insertionNodeEnd,
          insertion,
        );
        trackedTransaction.addMark(
          nodeAfterEnd,
          insertionNodeEnd,
          insertion.create({ id: markId }),
        );
      }
    }
  }

  // Handle insertions
  if (step.slice.content.size) {
    const $to = trackedTransaction.doc.resolve(stepTo);

    // Don't allow inserting content within an existing deletion
    // mark. Instead, shift the proposed insertion to the end
    // of the deletion.
    const insertFrom = findSuggestionMarkEnd($to, deletion);

    // We execute the insertion normally, on top of all of the existing
    // tracked changes.
    trackedTransaction.replace(insertFrom, insertFrom, step.slice);
    const insertStep =
      // We just created this step, so it we can assert that it exists
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      trackedTransaction.steps[trackedTransaction.steps.length - 1]!;
    let insertedTo = insertStep.getMap().map(insertFrom);

    // Then, we iterate through the newly inserted content and mark it
    // as inserted.
    trackedTransaction.doc.nodesBetween(insertFrom, insertedTo, (node, pos) => {
      const $pos = trackedTransaction.doc.resolve(pos);

      // If any of this node's ancestors are already marked as insertions,
      // we can skip it
      for (let d = $pos.depth; d >= 0; d--) {
        if (insertion.isInSet($pos.node(d).marks)) return;
      }

      // When an insertion constitutes only part of a node,
      // use inline marks to mark only the inserted portion
      const shouldAddInlineMarks =
        pos < insertFrom || pos + node.nodeSize > insertedTo || node.isInline;

      if (shouldAddInlineMarks) {
        trackedTransaction.addMark(
          Math.max(pos, insertFrom),
          Math.min(pos + node.nodeSize, insertedTo),
          insertion.create({ id: markId }),
        );
        return;
      }

      // Use a node mark when an entire node was newly inserted.
      trackedTransaction.addNodeMark(pos, insertion.create({ id: markId }));
    });

    const $insertFrom = trackedTransaction.doc.resolve(insertFrom);
    let $insertedTo = trackedTransaction.doc.resolve(insertedTo);

    // Like with deletions, identify when we've inserted a
    // node boundary and add zero-width spaces as anchors on
    // either side.
    if (!$insertFrom.nodeAfter) {
      trackedTransaction.insertText("\u200B", insertFrom);
      trackedTransaction.addMark(
        insertFrom,
        insertFrom + 1,
        insertion.create({ id: markId }),
      );
      insertedTo++;
      $insertedTo = trackedTransaction.doc.resolve(insertedTo);
    }

    if (!$insertedTo.nodeBefore) {
      trackedTransaction.insertText("\u200B", insertedTo);
      trackedTransaction.addMark(
        insertedTo,
        insertedTo + 1,
        insertion.create({ id: markId }),
      );
      insertedTo++;
      $insertedTo = trackedTransaction.doc.resolve(insertedTo);
    }

    if (insertFrom !== $to.pos) {
      trackedTransaction.setSelection(
        TextSelection.near(
          trackedTransaction.doc.resolve(insertFrom + step.slice.size),
        ),
      );
    }
  }
  return markId === suggestionId;
}
