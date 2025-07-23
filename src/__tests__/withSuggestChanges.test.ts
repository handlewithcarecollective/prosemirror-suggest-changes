/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { EditorState } from "prosemirror-state";
import { Fragment, Slice } from "prosemirror-model";
import { type ReplaceStep, replaceStep } from "prosemirror-transform";
import { assert, describe, expect, it } from "vitest";

import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";
import { suggestChanges } from "../plugin.js";
import { transformToSuggestionTransaction } from "../withSuggestChanges.js";

describe("withSuggestChanges", () => {
  it("should wrap an insertion in a mark", () => {
    // Create document with all tags at once
    const doc = testBuilders.doc(
      testBuilders.paragraph({ id: null }, "This is a <a>test<b> paragraph."),
      testBuilders.paragraph(
        { id: null },
        "This is a <c>test<d> <e>test<f> paragraph.",
      ),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      plugins: [suggestChanges()],
    });

    const originalTransaction = editorState.tr;

    // Step 1: Replace "test" with "WORK" in first paragraph
    const step1 = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      new Slice(Fragment.from(testBuilders.schema.text("WORK")), 0, 0),
    ) as ReplaceStep | null;
    assert(step1, "Could not create step1");
    originalTransaction.step(step1);

    // Step 2: Replace first "test" with "WORK" in second paragraph
    // Create step with original positions, then map it
    const step2 = replaceStep(
      doc,
      doc.tag["c"]!,
      doc.tag["d"],
      new Slice(Fragment.from(testBuilders.schema.text("WORK")), 0, 0),
    ) as ReplaceStep | null;
    assert(step2, "Could not create step2");
    const mappedStep2 = step2.map(originalTransaction.mapping);
    assert(mappedStep2, "Could not map step2");
    originalTransaction.step(mappedStep2);

    // Step 3: Replace second "test" with "WORK" in second paragraph
    // Create step with original positions, then map it
    const step3 = replaceStep(
      doc,
      doc.tag["e"]!,
      doc.tag["f"],
      new Slice(Fragment.from(testBuilders.schema.text("WORK")), 0, 0),
    ) as ReplaceStep | null;
    assert(step3, "Could not create step3");
    const mappedStep3 = step3.map(originalTransaction.mapping);
    assert(mappedStep3, "Could not map step3");
    originalTransaction.step(mappedStep3);

    // Verify the transaction produces expected result
    const originalTrState = editorState.apply(originalTransaction);
    expect(originalTrState.doc.textContent).toEqual(
      "This is a WORK paragraph.This is a WORK WORK paragraph.",
    );

    // Transform to suggestion transaction
    const suggestedTr = transformToSuggestionTransaction(
      originalTransaction,
      editorState,
    );
    const newState = editorState.apply(suggestedTr);

    // Should pass without error - document should be modified
    expect(newState.doc.toJSON()).not.toEqual(doc.toJSON());
  });
});
