import { type Attrs, type Node } from "prosemirror-model";
import {
  type EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { type ReplaceStep, type Step } from "prosemirror-transform";

import { findSuggestionMarkEnd } from "./findSuggestionMarkEnd.js";
import { rebasePos } from "./rebasePos.js";
import { getSuggestionMarks } from "./utils.js";
import { type SuggestionId } from "./generateId.js";
import { type BoundarySuggestion } from "./schema.js";

type WritableAttrs = Record<string, unknown>;

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
 * If a deletion or insertion crosses a block boundary, a block
 * boundary suggestion mark will be added to all but the last
 * block touched by the change.
 *
 * After all of the above have been evaluated, if the resulting
 * insertion or deletion marks abut or join existing marks, they
 * will be joined and given the same ids.
 */
export function suggestReplaceStep(
  trackedTransaction: Transaction,
  state: EditorState,
  doc: Node,
  step: ReplaceStep,
  prevSteps: Step[],
  suggestionId: SuggestionId,
  createExtraAttrs?: () => Attrs,
  preventJoin?: (a: Attrs, b: Attrs) => boolean,
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

  const extraAttrs: WritableAttrs = createExtraAttrs?.() ?? {};

  const useMarkBeforeId =
    markBefore && !preventJoin?.(markBefore.attrs, extraAttrs);
  const useMarkAfterId =
    markAfter && !preventJoin?.(markAfter.attrs, extraAttrs);

  const markId = useMarkBeforeId
    ? (markBefore.attrs["id"] as SuggestionId)
    : useMarkAfterId
      ? (markAfter.attrs["id"] as SuggestionId)
      : suggestionId;

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
        to: Math.min(pos + node.nodeSize, stepTo),
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
    let $stepFrom = trackedTransaction.doc.resolve(stepFrom);
    let $stepTo = trackedTransaction.doc.resolve(stepTo);

    if ($stepFrom.parent !== $stepTo.parent) {
      const blockRange = $stepFrom.blockRange($stepTo);

      if (blockRange) {
        let alreadyDeleted = true;
        let d = $stepFrom.depth;
        let minDepth = blockRange.depth;
        while (d > minDepth) {
          const stepFromBlockStart = $stepFrom.before(d);

          const stepFromBlockBoundarySuggestion =
            blockBoundarySuggestion.isInSet(
              trackedTransaction.doc.nodeAt(stepFromBlockStart)?.marks ?? [],
            )?.attrs as BoundarySuggestion | undefined;

          // When a deletion crosses a block boundary, we add
          // a blockBoundarySuggestion mark to the previous
          // block. This allows us to render the
          // deleted boundary with a widget, as well as properly handle
          // future, adjacent deletions and insertions.
          if (!stepFromBlockBoundarySuggestion) {
            alreadyDeleted = false;
            trackedTransaction.addNodeMark(
              stepFromBlockStart,
              blockBoundarySuggestion.create({
                id: markId,
                type: deletion.name,
                ...extraAttrs,
              }),
            );
          } else if (stepFromBlockBoundarySuggestion.type === "insertion") {
            alreadyDeleted = false;
            trackedTransaction.removeNodeMark(
              stepFromBlockStart,
              blockBoundarySuggestion,
            );

            trackedTransaction.join(
              stepFromBlockStart +
                // oxlint-disable-next-line typescript/no-non-null-assertion
                trackedTransaction.doc.nodeAt(stepFromBlockStart)!.nodeSize,
            );
          }

          d--;

          // If a step attempts to delete a block boundary that
          // has already been deleted, the user wants to delete
          // the block boundary one level deeper. We expand the
          // deletion range by one in both directions to match
          // the appropriate range and loop again.
          if (d === blockRange.depth && alreadyDeleted) {
            stepFrom--;
            stepTo++;
            $stepFrom = trackedTransaction.doc.resolve(stepFrom);
            $stepTo = trackedTransaction.doc.resolve(stepTo);
            minDepth = d;
            d = $stepFrom.depth;
          }
        }
      }
    }
  }

  stepFrom = rebasePos(step.from, prevSteps, trackedTransaction.steps);
  stepTo = rebasePos(step.to, prevSteps, trackedTransaction.steps);

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
      deletion.create({ id: markId, ...extraAttrs }),
    );
  } else {
    trackedTransaction.doc.nodesBetween(
      blockRange.start,
      blockRange.end,
      (_, pos) => {
        if (pos < blockRange.start) return true;
        trackedTransaction.addNodeMark(
          pos,
          deletion.create({ id: markId, ...extraAttrs }),
        );
        return false;
      },
    );
  }

  // TODO: This could break if there's already a deletion-insertion-deletion-insertion combination
  // This is the code that creates those combinations, doing this twice in a row could break it

  // Detect when a new mark directly abuts an existing mark with
  // a different id and merge them
  if (
    nodeAfter &&
    markAfter &&
    markAfter.attrs["id"] !== markId &&
    !preventJoin?.(markAfter.attrs, { id: markId, ...extraAttrs })
  ) {
    const nodeAfterEnd = stepTo + nodeAfter.nodeSize;
    trackedTransaction.removeMark(stepTo, nodeAfterEnd, markAfter.type);
    trackedTransaction.addMark(
      stepTo,
      nodeAfterEnd,
      markAfter.type.create({ id: markId, ...extraAttrs }),
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
          insertion.create({ id: markId, ...extraAttrs }),
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
    const insertFrom = findSuggestionMarkEnd($to, deletion, true);

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
          insertion.create({ id: markId, ...extraAttrs }),
        );
        return;
      }

      // Use a node mark when an entire node was newly inserted.
      trackedTransaction.addNodeMark(
        pos,
        insertion.create({ id: markId, ...extraAttrs }),
      );
    });

    const $insertFrom = trackedTransaction.doc.resolve(insertFrom);
    const $insertedTo = trackedTransaction.doc.resolve(insertedTo);

    // Like with deletions, identify when we've inserted a
    // node boundary and add block boundary suggestion marks.
    if ($insertFrom.parent !== $insertedTo.parent) {
      const blockRange = $insertFrom.blockRange($insertedTo);

      if (blockRange) {
        // This insertion may have split the node at any depth.
        // We add boundary suggestions at every depth of the split
        // so that we can correctly revert them all back to the
        // starting point.
        for (let d = $insertFrom.depth; d > blockRange.depth; d--) {
          const insertFromTextblock = $insertFrom.before(d);

          const insertFromBlockBoundarySuggestion =
            blockBoundarySuggestion.isInSet(
              trackedTransaction.doc.nodeAt(insertFromTextblock)?.marks ?? [],
            )?.attrs;

          trackedTransaction.addNodeMark(
            insertFromTextblock,
            blockBoundarySuggestion.create({
              ...insertFromBlockBoundarySuggestion,
              id: markId,
              type: insertion.name,
              ...extraAttrs,
            }),
          );
        }
      }
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
