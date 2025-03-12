import { type MarkSpec } from "prosemirror-model";

export const deletion: MarkSpec = {
  inclusive: false,
  excludes: "insertion modification deletion",
  attrs: {
    id: { validate: "number" },
  },
  toDOM(mark, inline) {
    return [
      "del",
      {
        "data-id": String(mark.attrs["id"]),
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
          id: parseInt(node.dataset["id"], 10),
        };
      },
    },
  ],
};

export const insertion: MarkSpec = {
  inclusive: false,
  excludes: "deletion modification insertion",
  attrs: {
    id: { validate: "number" },
  },
  toDOM(mark, inline) {
    return [
      "ins",
      {
        "data-id": String(mark.attrs["id"]),
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
          id: parseInt(node.dataset["id"], 10),
        };
      },
    },
  ],
};

export const modification: MarkSpec = {
  inclusive: false,
  excludes: "deletion insertion",
  attrs: {
    id: { validate: "number" },
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
        "data-id": String(mark.attrs["id"]),
        "data-mod-type": mark.attrs["type"] as string,
        "data-mod-prev-val": JSON.stringify(mark.attrs["previousValue"]),
        // TODO: Try to serialize marks with toJSON?
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
          id: parseInt(node.dataset["id"], 10),
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
          id: parseInt(node.dataset["id"], 10),
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
  };
}
