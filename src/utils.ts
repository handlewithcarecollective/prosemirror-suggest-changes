import {
  type ResolvedPos,
  type MarkType,
  type Schema,
} from "prosemirror-model";

export interface SuggestionMarks {
  insertion: MarkType;
  deletion: MarkType;
  modification: MarkType;
  blockBoundarySuggestion: MarkType;
}

/**
 * Get the suggestion mark types from a schema, with proper error handling.
 * Throws an error if any of the required marks are not found.
 */
export function getSuggestionMarks(schema: Schema): SuggestionMarks {
  const { insertion, deletion, modification, blockBoundarySuggestion } =
    schema.marks;

  if (!insertion) {
    throw new Error(
      "Failed to find insertion mark in schema. Did you forget to add it?",
    );
  }

  if (!deletion) {
    throw new Error(
      "Failed to find deletion mark in schema. Did you forget to add it?",
    );
  }

  if (!modification) {
    throw new Error(
      "Failed to find modification mark in schema. Did you forget to add it?",
    );
  }

  if (!blockBoundarySuggestion) {
    throw new Error(
      "Failed to find blockBoundarySuggestion mark in schema. Did you forget to add it?",
    );
  }

  return { insertion, deletion, modification, blockBoundarySuggestion };
}

export function findTextblockAncestor($pos: ResolvedPos) {
  let d = $pos.depth;
  while (!$pos.node(d).isTextblock && d > 0) {
    d--;
  }

  return d === 0 ? $pos.pos : $pos.before(d);
}
