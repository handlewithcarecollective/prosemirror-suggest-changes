import { type MarkType, type ResolvedPos } from "prosemirror-model";
import { getSuggestionMarks } from "./utils.js";

export function findSuggestionMarkEnd(
  $pos: ResolvedPos,
  markType: MarkType,
  crossBoundaries = false,
) {
  const { blockBoundarySuggestion } = getSuggestionMarks($pos.doc.type.schema);

  const initialMark = ($pos.nodeAfter ?? $pos.nodeBefore)?.marks.find(
    (mark) => mark.type === markType,
  );

  if (!initialMark) {
    return $pos.pos;
  }

  let markEndPos = $pos.pos + ($pos.nodeAfter?.nodeSize ?? 0);

  // oxlint-disable-next-line typescript/no-unnecessary-condition
  while (true) {
    let $markEndPos = $pos.doc.resolve(markEndPos);
    for (let i = $markEndPos.index(); i < $markEndPos.parent.childCount; i++) {
      const sibling = $markEndPos.parent.child(i);
      if (!markType.isInSet(sibling.marks)) return markEndPos;
      markEndPos += sibling.nodeSize;
    }

    $markEndPos = $pos.doc.resolve(markEndPos);

    if (!crossBoundaries) return markEndPos;

    const parent = $markEndPos.parent;

    const initialBoundarySuggestion = blockBoundarySuggestion.isInSet(
      parent.marks,
    );

    if (
      !initialBoundarySuggestion ||
      initialBoundarySuggestion.attrs["type"] !== markType.name
    ) {
      return markEndPos;
    }

    let d = $pos.depth;
    while ($pos.index(d) === $pos.node(d).childCount - 1 && d > 0) {
      d--;
    }
    const beforeNextBlock = $pos.after(d + 1);
    let beforeCousin = beforeNextBlock + 1;
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    while (true) {
      const $beforeCousin = $pos.doc.resolve(beforeCousin);
      if (!$beforeCousin.nodeAfter || $beforeCousin.parentOffset) {
        return markEndPos;
      }
      markEndPos = beforeCousin;
      if (markType.isInSet($beforeCousin.nodeAfter.marks)) break;
      beforeCousin++;
    }

    // oxlint-disable-next-line typescript/no-non-null-assertion
    const cousin = $pos.doc.nodeAt(beforeCousin)!;
    markEndPos += cousin.nodeSize;
  }
}
