import { type Node, type Schema } from "prosemirror-model";

export type SuggestionId = string | number;

export const suggestionIdValidate = "number|string";

export function parseSuggestionId(id: string): SuggestionId {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed)) {
    return id;
  }
  return parsed;
}

export function generateNextNumberId(schema: Schema, doc?: Node) {
  const { deletion, insertion, modification } = schema.marks;
  if (!deletion) {
    throw new Error(
      `Failed to transform to suggestion: schema does not contain deletion mark. Did you forget to add it?`,
    );
  }
  if (!insertion) {
    throw new Error(
      `Failed to transform to suggestion: schema does not contain insertion mark. Did you forget to add it?`,
    );
  }
  if (!modification) {
    throw new Error(
      `Failed to transform to suggestion: schema does not contain modification mark. Did you forget to add it?`,
    );
  }
  // Find the highest change id in the document so far,
  // and use that as the starting point for new changes
  let suggestionId = 0;
  doc?.descendants((node) => {
    const mark = node.marks.find(
      (mark) =>
        mark.type === insertion ||
        mark.type === deletion ||
        mark.type === modification,
    );
    if (mark) {
      suggestionId = Math.max(suggestionId, mark.attrs["id"] as number);
      return false;
    }
    return true;
  });
  return suggestionId + 1;
}
