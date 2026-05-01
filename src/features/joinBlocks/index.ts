import type { Transaction } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import { getZWSPPairsInRange } from "./utils/getZWSPPairsInRange.js";
import { canJoin, Mapping } from "prosemirror-transform";

const calculateDepthAndPos = (from: number, to: number) => {
  return { pos: (from + to) / 2, depth: (to - from) / 2 };
};

export const joinBlocks = (
  trackedTransaction: Transaction,
  stepFrom: number,
  stepTo: number,
  insertionMarkType: MarkType,
) => {
  const doc = trackedTransaction.doc;
  // Record the step index before we start deleting
  const startStep = trackedTransaction.steps.length;

  // step 1 find pairs
  const { pairs, ZWSPAtToBoundary, ZWSPAtFromBoundary } = getZWSPPairsInRange(
    doc,
    stepFrom,
    stepTo,
    insertionMarkType,
  );

  // Step 2: Find all insertion-marked content in the deletion range
  // These ranges will be actually deleted (reverting the insertion)
  // Remove ZWSPs on the boundaries if they are in the list pairs
  const insertedRanges: { from: number; to: number }[] = [];
  if (ZWSPAtFromBoundary) {
    const from = ZWSPAtFromBoundary.pos;
    insertedRanges.push({ from, to: from + 1 });
  }

  doc.nodesBetween(stepFrom, stepTo, (node, pos) => {
    if (insertionMarkType.isInSet(node.marks)) {
      insertedRanges.push({
        from: Math.max(pos, stepFrom),
        to: Math.min(pos + node.nodeSize, stepTo),
      });
      return false;
    }
    return true;
  });

  if (ZWSPAtToBoundary) {
    const from = ZWSPAtToBoundary.pos;
    insertedRanges.push({ from, to: from + 1 });
  }
  pairs.reverse();
  insertedRanges.reverse();

  // step 3: join blocks at multiple depths as needed
  for (const p of pairs) {
    const fromPos = p.left?.pos;
    const toPos = p.right?.pos;
    if (!fromPos || !toPos) {
      continue;
    }
    const { depth, pos } = calculateDepthAndPos(fromPos + 1, toPos);

    if (canJoin(trackedTransaction.doc, pos)) {
      trackedTransaction.join(pos, depth);
    }
  }

  // step 4: remove inserted ranges
  const joinSteps = trackedTransaction.steps.slice(startStep);
  const joinMapping = new Mapping(joinSteps.map((s) => s.getMap()));
  for (const range of insertedRanges) {
    trackedTransaction.delete(
      joinMapping.map(range.from),
      joinMapping.map(range.to),
    );
  }
  return !!pairs.length;
};
