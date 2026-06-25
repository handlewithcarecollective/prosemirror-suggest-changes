import { type MarkType, type Node, type ResolvedPos } from "prosemirror-model";
import { type Command, Selection, TextSelection } from "prosemirror-state";

import { suggestChangesKey } from "./plugin.js";
import { getSuggestionMarks } from "./utils.js";

/**
 * Whether `node` is a textblock whose entire content is insertion-marked zero-width
 * spaces: an empty block that exists only to hold a suggested break.
 */
function isInsertedEmptyTextblock(node: Node, insertion: MarkType): boolean {
  if (!node.isTextblock || node.content.size === 0) return false;
  let onlyAnchors = true;
  node.forEach((child) => {
    const isAnchor =
      child.isText &&
      insertion.isInSet(child.marks) &&
      (child.text ?? "").replace(/\u200B/g, "") === "";
    if (!isAnchor) onlyAnchors = false;
  });
  return onlyAnchors;
}

/**
 * Computes the document range whose deletion would join the cursor's block to its
 * previous (`dir` of -1) or next (`dir` of 1) textblock.
 *
 * The range runs between the two blocks' content edges, so removing the returned range
 * collapses any nodes in between, such as a list-item boundary.
 */
function getJoinRange(
  $cursor: ResolvedPos,
  dir: -1 | 1,
): { from: number; to: number } | null {
  const depth = $cursor.depth;
  const blockEdge = dir < 0 ? $cursor.before(depth) : $cursor.after(depth);
  const neighbour = Selection.findFrom(
    $cursor.doc.resolve(blockEdge),
    dir,
    true,
  );
  if (!neighbour) return null;
  return dir < 0
    ? { from: neighbour.from, to: $cursor.start(depth) }
    : { from: $cursor.end(depth), to: neighbour.from };
}

/**
 * Whether `range` borders a suggested break, i.e. an insertion-marked zero-width space
 * sits immediately on one side of it. A join is only allowed across such a break;
 * deleting a real block boundary must instead be tracked as a deletion.
 */
function crossesInsertedBreak(
  doc: Node,
  insertion: MarkType,
  range: { from: number; to: number },
): boolean {
  const before = doc.resolve(range.from).nodeBefore;
  const after = doc.resolve(range.to).nodeAfter;
  return (
    (!!before?.text?.endsWith("\u200B") && !!insertion.isInSet(before.marks)) ||
    (!!after?.text?.startsWith("\u200B") && !!insertion.isInSet(after.marks))
  );
}

/**
 * Remove a suggested paragraph break next to the cursor in one keystroke (`dir` is
 * -1 for Backspace, 1 for Delete). The break is held open by invisible insertion
 * zero-width spaces, so the default bindings take two keystrokes to clear it and can
 * leave a stray deletion suggestion behind.
 *
 * To avoid that, this dispatches a single delete spanning the whole boundary (across a
 * paragraph or list-item boundary), regardless of where the caret sits relative
 * to those anchors. Deleting the break in one step lets `suggestReplaceStep` see a lone
 * inserted boundary and drop its anchors, rather than stacking a deletion mark on a
 * break that was never accepted.
 */
export function removeInsertedBreak(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.$cursor) {
      return false;
    }

    const $cursor = selection.$cursor;
    const { insertion } = getSuggestionMarks(state.schema);
    const depth = $cursor.depth;
    const block = $cursor.parent;

    let range: { from: number; to: number } | null = null;

    if (isInsertedEmptyTextblock(block, insertion)) {
      const before = getJoinRange($cursor, -1);
      const after = getJoinRange($cursor, 1);
      if (before && crossesInsertedBreak(state.doc, insertion, before)) {
        range = before;
      } else if (after && crossesInsertedBreak(state.doc, insertion, after)) {
        range = after;
      } else {
        // Anchors already gone: nothing to track, so drop the empty block if allowed.
        const $before = state.doc.resolve($cursor.before(depth));
        if (!$before.parent.canReplace($before.index(), $before.index() + 1)) {
          return false;
        }
        if (dispatch) {
          dispatch(
            state.tr
              .delete($cursor.before(depth), $cursor.after(depth))
              .setMeta(suggestChangesKey, { skip: true }),
          );
        }
        return true;
      }
    } else {
      // A break anchor as the block's first child means the break precedes this block;
      // as its last child, the break follows.
      const anchor = dir < 0 ? $cursor.nodeBefore : $cursor.nodeAfter;
      const isAnchor =
        dir < 0
          ? !!anchor?.text?.endsWith("\u200B")
          : !!anchor?.text?.startsWith("\u200B");
      if (!anchor || !isAnchor || !insertion.isInSet(anchor.marks))
        return false;
      if (anchor === block.firstChild) range = getJoinRange($cursor, -1);
      else if (anchor === block.lastChild) range = getJoinRange($cursor, 1);
      if (range && !crossesInsertedBreak(state.doc, insertion, range)) {
        range = null;
      }
    }

    if (!range) return false;
    if (dispatch) dispatch(state.tr.delete(range.from, range.to));
    return true;
  };
}
