/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { EditorState } from "prosemirror-state";
import { assert, describe, it } from "vitest";
import { eq } from "prosemirror-test-builder";

import { testBuilders } from "../testing/testBuilders.js";
import { transformToSuggestionTransaction } from "../withSuggestChanges.js";
import { type SuggestionId } from "../generateId.js";

describe("withSuggestChanges", () => {
  it("should use custom generateId function when provided", () => {
    const doc = testBuilders.doc(testBuilders.paragraph("Hello world"));

    let state = EditorState.create({
      doc,
    });

    let callCount = 0;
    const customIds = ["custom-id-1", "custom-id-2"];

    const generateId = (): SuggestionId => {
      const id = customIds[callCount] ?? `custom-id-${callCount + 1}`;
      callCount++;
      return id;
    };

    // Make an insertion after "Hello"
    const tr1 = state.tr.insertText(" there", 6);
    const suggestedTr1 = transformToSuggestionTransaction(
      tr1,
      state,
      generateId,
    );
    state = state.apply(suggestedTr1);

    // Make another insertion at the end
    const tr2 = state.tr.insertText("!", state.doc.content.size - 1);
    const suggestedTr2 = transformToSuggestionTransaction(
      tr2,
      state,
      generateId,
    );
    state = state.apply(suggestedTr2);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "Hello",
        testBuilders.insertion({ id: customIds[0] }, " there"),
        " world",
        testBuilders.insertion({ id: customIds[1] }, "!"),
      ),
    );

    assert(
      eq(state.doc, expected),
      `Expected ${state.doc} to match ${expected}`,
    );
  });

  it("should use default numeric ID generation when generateId is not provided", () => {
    const doc = testBuilders.doc(testBuilders.paragraph("Hello world"));

    let state = EditorState.create({
      doc,
    });

    // Make an insertion without providing generateId
    const tr = state.tr.insertText(" there", 6);
    const suggestedTr = transformToSuggestionTransaction(tr, state); // No generateId
    state = state.apply(suggestedTr);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "Hello",
        testBuilders.insertion({ id: 1 }, " there"),
        " world",
      ),
    );

    assert(
      eq(state.doc, expected),
      `Expected ${state.doc} to match ${expected}`,
    );
  });
});
