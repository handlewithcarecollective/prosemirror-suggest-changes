import { type Node } from "prosemirror-model";
import {
  type EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { type ReplaceStep, type Step } from "prosemirror-transform";

import { findSuggestionMarkEnd } from "./findSuggestionMarkEnd.js";
import { rebasePos } from "./rebasePos.js";
import { findTextblockAncestor, getSuggestionMarks } from "./utils.js";
import { type SuggestionId } from "./generateId.js";
import { type BoundarySuggestion } from "./schema.js";

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
  suggestionId: SuggestionId,
) {
  const { deletion, insertion, blockBoundarySuggestion } = getSuggestionMarks(
    state.schema,
  );

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
    (markBefore?.attrs["id"] as SuggestionId | undefined) ??
    (markAfter?.attrs["id"] as SuggestionId | undefined) ??
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
  // ranges are reverted, applying them in this order saves rebasing
  // since deletions won't affect earlier deletions
  insertedRanges.reverse();
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
    const $stepFrom = trackedTransaction.doc.resolve(stepFrom);
    const $stepTo = trackedTransaction.doc.resolve(stepTo);
    const stepFromTextblock = findTextblockAncestor($stepFrom);
    const stepToTextblock = findTextblockAncestor($stepTo);

    const stepFromBlockBoundarySuggestion = blockBoundarySuggestion.isInSet(
      trackedTransaction.doc.nodeAt(stepFromTextblock)?.marks ?? [],
    )?.attrs;
    const stepToBlockBoundarySuggestion = blockBoundarySuggestion.isInSet(
      trackedTransaction.doc.nodeAt(stepToTextblock)?.marks ?? [],
    )?.attrs;

    // When there are no characters to mark with deletions before
    // the end of a block, we add a blockBoundarySuggestion mark
    // to that block. This allows us to render the
    // deleted boundary with a widget, as well as properly handle
    // future, adjacent deletions and insertions.
    if (
      !$stepFrom.nodeAfter &&
      !deletion.isInSet($stepFrom.nodeBefore?.marks ?? [])
    ) {
      trackedTransaction.addNodeMark(
        stepFromTextblock,
        blockBoundarySuggestion.create({
          ...stepFromBlockBoundarySuggestion,
          endId: markId,
          endType: "deletion",
        }),
      );
    }

    if (
      !$stepTo.nodeBefore &&
      !deletion.isInSet($stepTo.nodeAfter?.marks ?? [])
    ) {
      trackedTransaction.addNodeMark(
        stepToTextblock,
        blockBoundarySuggestion.create({
          ...stepToBlockBoundarySuggestion,
          startId: markId,
          startType: "deletion",
        }),
      );
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

  // TODO: This could break if there's already a deletion-insertion-deletion-insertion combination
  // This is the code that creates those combinations, doing this twice in a row could break it

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
    const insertedTo = insertStep.getMap().map(insertFrom);

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
    const $insertedTo = trackedTransaction.doc.resolve(insertedTo);

    // Like with deletions, identify when we've inserted a
    // node boundary and add block boundary suggestion marks.
    if (!$insertFrom.nodeAfter) {
      const insertFromTextblock = findTextblockAncestor($insertFrom);

      console.log({ insertFromTextblock });

      const insertFromBlockBoundarySuggestion = blockBoundarySuggestion.isInSet(
        trackedTransaction.doc.nodeAt(insertFromTextblock)?.marks ?? [],
      )?.attrs;

      console.log({ insertFromBlockBoundarySuggestion });

      trackedTransaction.addNodeMark(
        insertFromTextblock,
        blockBoundarySuggestion.create({
          ...insertFromBlockBoundarySuggestion,
          endId: markId,
          endType: "insertion",
        }),
      );

      console.log(trackedTransaction.doc.nodeAt(insertFromTextblock));
    }

    if (!$insertedTo.nodeBefore) {
      const insertToTextblock = findTextblockAncestor($insertedTo);

      const insertToBlockBoundarySuggestion = blockBoundarySuggestion.isInSet(
        trackedTransaction.doc.nodeAt(insertToTextblock)?.marks ?? [],
      )?.attrs;

      trackedTransaction.addNodeMark(
        insertToTextblock,
        blockBoundarySuggestion.create({
          ...insertToBlockBoundarySuggestion,
          startId: markId,
          startType: "insertion",
        }),
      );
    }

    if (insertFrom !== $to.pos) {
      trackedTransaction.setSelection(
        TextSelection.near(
          trackedTransaction.doc.resolve(insertFrom + step.slice.size),
        ),
      );
    }
  }

  trackedTransaction.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    const boundarySuggestion = blockBoundarySuggestion.isInSet(node.marks)
      ?.attrs as BoundarySuggestion | undefined;

    if (!boundarySuggestion) return false;

    if (boundarySuggestion.startType) {
      const markType =
        boundarySuggestion.startType === "insertion" ? insertion : deletion;

      if (markType.isInSet(node.firstChild?.marks ?? [])) {
        trackedTransaction.removeNodeMark(pos, blockBoundarySuggestion);

        if (boundarySuggestion.endType) {
          trackedTransaction.addNodeMark(
            pos,
            blockBoundarySuggestion.create({
              endId: boundarySuggestion.endId,
              endType: boundarySuggestion.endType,
            }),
          );
        }
      }
    }

    if (boundarySuggestion.endType) {
      const markType =
        boundarySuggestion.endType === "insertion" ? insertion : deletion;

      if (markType.isInSet(node.lastChild?.marks ?? [])) {
        trackedTransaction.removeNodeMark(pos, blockBoundarySuggestion);

        if (boundarySuggestion.startType) {
          trackedTransaction.addNodeMark(
            pos,
            blockBoundarySuggestion.create({
              endId: boundarySuggestion.endId,
              endType: boundarySuggestion.endType,
            }),
          );
        }
      }
    }

    return false;
  });

  return markId === suggestionId;
}
