import { type MarkSpec } from "prosemirror-model";
import { type SuggestionId, suggestionIdValidate } from "./generateId.js";

export type SuggestionType = "insertion" | "deletion";

export const deletion: MarkSpec = {
  inclusive: false,
  excludes: "insertion modification deletion",
  attrs: {
    id: { validate: suggestionIdValidate },
  },
  toDOM(mark, inline) {
    return [
      "del",
      {
        "data-id": JSON.stringify(mark.attrs["id"]),
        "data-inline": String(inline),
        ...(!inline && { style: "display: block" }),
      },
      0,
    ];
  },
  parseDOM: [
    {
      tag: "del",
      getAttrs(node) {
        if (!node.dataset["id"]) return false;
        return {
          id: JSON.parse(node.dataset["id"]) as SuggestionId,
        };
      },
    },
  ],
};

export const insertion: MarkSpec = {
  inclusive: false,
  excludes: "deletion modification insertion",
  attrs: {
    id: { validate: suggestionIdValidate },
  },
  toDOM(mark, inline) {
    return [
      "ins",
      {
        "data-id": JSON.stringify(mark.attrs["id"]),
        "data-inline": String(inline),
        ...(!inline && { style: "display: block" }),
      },
      0,
    ];
  },
  parseDOM: [
    {
      tag: "ins",
      getAttrs(node) {
        if (!node.dataset["id"]) return false;
        return {
          id: JSON.parse(node.dataset["id"]) as SuggestionId,
        };
      },
    },
  ],
};

export interface BoundarySuggestion {
  startId: string | number | null;
  endId: string | number | null;
  startType: SuggestionType | null;
  endType: SuggestionType | null;
}

export const blockBoundarySuggestion: MarkSpec = {
  inclusive: false,
  attrs: {
    startId: { validate: `${suggestionIdValidate}|null`, default: null },
    endId: { validate: `${suggestionIdValidate}|null`, default: null },
    startType: {
      validate: (value) => {
        const error = new RangeError(
          `Expected "insertion" "deletion" or null for attribute startType on type blockBoundarySuggestion, got ${JSON.stringify(value)}`,
        );
        if (typeof value !== "string" && value !== null) {
          throw error;
        }
        if (value !== "insertion" && value !== "deletion" && value !== null) {
          throw error;
        }
      },
      default: null,
    },
    endType: {
      validate: (value) => {
        const error = new RangeError(
          `Expected "insertion" "deletion" or null for attribute endType on type blockBoundarySuggestion, got ${JSON.stringify(value)}`,
        );
        if (typeof value !== "string" && value !== null) {
          throw error;
        }
        if (value !== "insertion" && value !== "deletion" && value !== null) {
          throw error;
        }
      },
      default: null,
    },
  },
  toDOM(mark, inline) {
    return [
      inline ? "span" : "div",
      {
        "data-type": "block-boundary-suggestion",
        "data-start-id": JSON.stringify(mark.attrs["startId"]),
        "data-end-id": JSON.stringify(mark.attrs["endId"]),
        ...(mark.attrs["startType"] && {
          "data-start-type": mark.attrs["startType"] as SuggestionType,
        }),
        ...(mark.attrs["endType"] && {
          "data-end-type": mark.attrs["endType"] as SuggestionType,
        }),
      },
      0,
    ];
  },
  parseDOM: [
    {
      tag: "span[data-type='block-boundary-suggestion']",
      getAttrs(node) {
        if (!node.dataset["startId"] && !node.dataset["endId"]) return false;

        return {
          startId: node.dataset["startId"] ?? null,
          endId: node.dataset["endId"] ?? null,
          startType: node.dataset["startType"] ?? null,
          endType: node.dataset["endType"] ?? null,
        };
      },
    },
    {
      tag: "div[data-type='block-boundary-suggestion']",
      getAttrs(node) {
        if (!node.dataset["startId"] && !node.dataset["endId"]) return false;

        return {
          startId: node.dataset["startId"] ?? null,
          endId: node.dataset["endId"] ?? null,
          startType: node.dataset["startType"] ?? null,
          endType: node.dataset["endType"] ?? null,
        };
      },
    },
  ],
};

export const modification: MarkSpec = {
  inclusive: false,
  excludes: "deletion insertion",
  attrs: {
    id: { validate: suggestionIdValidate },
    type: { validate: "string" },
    attrName: { default: null, validate: "string|null" },
    previousValue: { default: null },
    newValue: { default: null },
  },
  toDOM(mark, inline) {
    return [
      inline ? "span" : "div",
      {
        "data-type": "modification",
        "data-id": JSON.stringify(mark.attrs["id"]),
        "data-mod-type": mark.attrs["type"] as string,
        "data-mod-prev-val": JSON.stringify(mark.attrs["previousValue"]),
        "data-mod-new-val": JSON.stringify(mark.attrs["newValue"]),
      },
      0,
    ];
  },
  parseDOM: [
    {
      tag: "span[data-type='modification']",
      getAttrs(node) {
        if (!node.dataset["id"]) return false;
        return {
          id: JSON.parse(node.dataset["id"]) as SuggestionId,
          type: node.dataset["modType"],
          previousValue: node.dataset["modPrevVal"],
          newValue: node.dataset["modNewVal"],
        };
      },
    },
    {
      tag: "div[data-type='modification']",
      getAttrs(node) {
        if (!node.dataset["id"]) return false;
        return {
          id: JSON.parse(node.dataset["id"]) as SuggestionId,
          type: node.dataset["modType"],
          previousValue: node.dataset["modPrevVal"],
        };
      },
    },
  ],
};

/**
 * Add the deletion, insertion, and modification marks to
 * the provided MarkSpec map.
 */
export function addSuggestionMarks<Marks extends string>(
  marks: Record<Marks, MarkSpec>,
): Record<Marks | "deletion" | "insertion" | "modification", MarkSpec> {
  return {
    ...marks,
    deletion,
    insertion,
    modification,
    blockBoundarySuggestion,
  };
}
