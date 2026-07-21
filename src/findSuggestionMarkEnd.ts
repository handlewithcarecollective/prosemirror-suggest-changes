import { type MarkType, type ResolvedPos } from "prosemirror-model";

export function findSuggestionMarkEnd($pos: ResolvedPos, markType: MarkType) {
  const initialDeletionMark = ($pos.nodeAfter ?? $pos.nodeBefore)?.marks.find(
    (mark) => mark.type === markType,
  );
  if (!initialDeletionMark) {
    return $pos.pos;
  }
  return $pos.pos + ($pos.nodeAfter?.nodeSize ?? 0);
}
