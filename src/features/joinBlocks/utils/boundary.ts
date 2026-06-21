import type { MarkType, Node } from "prosemirror-model";
import type { CharResult, ZWSPWithPos } from "../types.js";
import { ZWSP } from "../types.js";
import type { SuggestionId } from "../../../generateId.js";

/**
 * Finds the previous character and its containing text node.
 * Handles being inside a node, at a node boundary, or across block boundaries.
 */
export function getPreviousCharAndNode(
  doc: Node,
  pos: number,
): CharResult | null {
  const $pos = doc.resolve(pos);

  // SCENARIO A: We are inside a text node
  // (nodeBefore is null because we aren't at a boundary, but textOffset > 0)
  if (!$pos.nodeBefore && $pos.parent.isTextblock && $pos.textOffset > 0) {
    const innerNode = $pos.parent.child($pos.index());

    if (innerNode.isText && innerNode.text) {
      return {
        char: innerNode.text.charAt($pos.textOffset - 1),
        node: innerNode, // Returns the whole node, e.g., "Hello"
        pos: pos - 1,
      };
    }
  }

  // SCENARIO B: We are at a boundary, and the node immediately before is text
  // Example: <strong>Bold</strong>|Plain
  if ($pos.nodeBefore?.isText && $pos.nodeBefore.text) {
    return {
      char: $pos.nodeBefore.text.slice(-1),
      node: $pos.nodeBefore,
      pos: pos - 1,
    };
  }

  // SCENARIO C: We are at the start of a block or after a non-text node (Image, etc.)
  // We need to traverse backwards up the tree.
  return findLastTextNodeBackwards(doc, pos);
}

/**
 * Helper: Recursively scans backwards from a position to find the nearest text node.
 */
function findLastTextNodeBackwards(
  doc: Node,
  startPos: number,
): CharResult | null {
  let pos = startPos;

  while (pos > 0) {
    const $pos = doc.resolve(pos);
    const { nodeBefore } = $pos;

    // 1. Found a text node
    if (nodeBefore?.isText && nodeBefore.text) {
      return {
        char: nodeBefore.text.slice(-1),
        node: nodeBefore,
        pos: pos - 1,
      };
    }

    // 2. Start of a block -> Move out to parent
    if (!nodeBefore) {
      if ($pos.depth === 0) break; // Top of doc
      pos = $pos.before();
      continue;
    }

    // 3. Previous node is an Element (Paragraph, etc) -> Enter it
    if (!nodeBefore.isLeaf) {
      pos -= 1; // Enter the block from the end
    }
    // 4. Previous node is a Leaf (Atom/Image) -> Skip it
    else {
      pos -= nodeBefore.nodeSize;
    }
  }

  return null;
}

export function getNextCharAndNode(doc: Node, pos: number): CharResult | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;

  // SCENARIO A: We are inside a text node (Inline)
  // We check if there is text "after" our current offset within the current child node.
  if (parent.isTextblock && !$pos.nodeAfter) {
    const index = $pos.index();
    const child = parent.maybeChild(index); // Get child at current index

    // Check if we are inside a text node and NOT at the very end of it
    if (child?.text && $pos.textOffset < child.nodeSize) {
      return {
        char: child.text.charAt($pos.textOffset), // char at current offset
        node: child,
        pos: pos, // The generic pos points to the start of this char
      };
    }
  }

  // SCENARIO B: We are at a boundary, and the node immediately after is text
  // Example: <p>End|<strong>Bold</strong></p>
  if ($pos.nodeAfter?.text) {
    return {
      char: $pos.nodeAfter.text.charAt(0), // First char of next node
      node: $pos.nodeAfter,
      pos: pos,
    };
  }

  // SCENARIO C: Recursive search forward
  return findNextTextNodeForwards(doc, pos);
}

/**
 * Helper: Recursively scans forwards to find the nearest text node.
 */
function findNextTextNodeForwards(
  doc: Node,
  startPos: number,
): CharResult | null {
  let pos = startPos;
  const docSize = doc.content.size;

  while (pos < docSize) {
    const $pos = doc.resolve(pos);
    const { nodeAfter } = $pos;

    // 1. Found a text node
    if (nodeAfter?.text) {
      return {
        char: nodeAfter.text.charAt(0),
        node: nodeAfter,
        pos: pos,
      };
    }

    // 2. End of a block (nodeAfter is null) -> Move out to parent
    // Example: <p>Text|</p> -> Move to after </p>
    if (!nodeAfter) {
      if ($pos.depth === 0) break; // End of doc
      pos = $pos.after();
      continue;
    }

    // 3. Next node is an Element (Paragraph, Blockquote) -> Enter it
    if (!nodeAfter.isLeaf) {
      pos += 1; // Enter the block from the start
    }
    // 4. Next node is a Leaf (Atom/Image) -> Skip it
    else {
      pos += nodeAfter.nodeSize;
    }
  }

  return null;
}

// TODO: Unify with next
export const getNextZWSP = (
  doc: Node,
  pos: number,
  insertionMarkType: MarkType,
): ZWSPWithPos | undefined => {
  // check if we have an insertion mark on the node
  const nextCharInfo = getNextCharAndNode(doc, pos);
  if (nextCharInfo?.char !== ZWSP) return;
  const insertionMark = insertionMarkType.isInSet(nextCharInfo.node.marks);
  const id = insertionMark?.attrs["id"] as SuggestionId | undefined;
  if (!id) return;
  return { ...nextCharInfo, id };
};

export const getPreviousZWSP = (
  doc: Node,
  pos: number,
  insertionMarkType: MarkType,
): ZWSPWithPos | undefined => {
  // check if we have an insertion mark on the node
  const nextCharInfo = getPreviousCharAndNode(doc, pos);
  if (nextCharInfo?.char !== ZWSP) return;
  const insertionMark = insertionMarkType.isInSet(nextCharInfo.node.marks);
  const id = insertionMark?.attrs["id"] as SuggestionId | undefined;
  if (!id) return;
  return { ...nextCharInfo, id };
};
