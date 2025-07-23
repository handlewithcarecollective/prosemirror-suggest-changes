import { type MarkType, type Schema } from "prosemirror-model";

export interface SuggestionMarks {
  insertion: MarkType;
  deletion: MarkType;
  modification: MarkType;
}

/**
 * Get the suggestion mark types from a schema, with proper error handling.
 * Throws an error if any of the required marks are not found.
 */
export function getSuggestionMarks(schema: Schema): SuggestionMarks {
  const { insertion, deletion, modification } = schema.marks;

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

  return { insertion, deletion, modification };
}
