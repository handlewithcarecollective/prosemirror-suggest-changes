import { EditorState, TextSelection } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { describe, expect, it } from "vitest";

import { testBuilders } from "../testing/testBuilders.js";
import { suggestChanges } from "../plugin.js";
import { transformToSuggestionTransaction } from "../withSuggestChanges.js";

const steps = [
  {
    stepType: "replace",
    from: 11,
    to: 15,
    slice: {
      content: [
        {
          type: "text",
          text: "WORK",
        },
      ],
    },
  },
  {
    stepType: "replace",
    from: 38,
    to: 42,
    slice: {
      content: [
        {
          type: "text",
          text: "WORK",
        },
      ],
    },
  },
  {
    stepType: "replace",
    from: 43,
    to: 47,
    slice: {
      content: [
        {
          type: "text",
          text: "WORK",
        },
      ],
    },
  },
];

describe("withSuggestChan ges", () => {
  it("should wrap an insertion in a mark", () => {
    // should match initialJson
    const doc = testBuilders.doc(
      testBuilders.paragraph({ id: null }, "This is a test paragraph."),
      testBuilders.paragraph({ id: null }, "This is a test test paragraph."),
    );

    const end = TextSelection.atEnd(doc);
    const trSteps = steps.map((step) => Step.fromJSON(doc.type.schema, step));
    const editorState = EditorState.create({
      doc,
      selection: end,
      plugins: [suggestChanges()],
    });

    const originalTransaction = editorState.tr;
    trSteps.forEach((s) => {
      originalTransaction.step(s);
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    expect(originalTransaction.steps.map((s) => s.toJSON())).toEqual(steps);
    const originalTrState = editorState.apply(originalTransaction);
    expect(originalTrState.doc.textContent).toEqual(
      "This is a WORK paragraph.This is a WORK WORK paragraph.",
    );
    const suggestedTr = transformToSuggestionTransaction(
      originalTransaction,
      editorState,
    );
    const newState = editorState.apply(suggestedTr);
    // Should pass without error
    expect(newState.doc.toJSON()).not.toEqual(doc.toJSON());
  });
});
