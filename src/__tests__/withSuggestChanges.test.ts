/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { eq } from "prosemirror-test-builder";
import { type SuggestionId } from "../generateId.js";
import { EditorState, TextSelection } from "prosemirror-state";
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
  it("shouldn't throw nodeSize errors on multiline edits", () => {
    // Create document with all tags for the replacements
    const doc = testBuilders.doc(
      testBuilders.paragraph({ id: null }, "<a>test<b> <c>test<d>"),
      testBuilders.paragraph({ id: null }, "<e>test<f> <g>test<h>"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      plugins: [suggestChanges()],
    });

    const originalTransaction = editorState.tr;

    // Step 1: Replace first "test" with "WORKKKKKKK"
    const step1 = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      new Slice(Fragment.from(testBuilders.schema.text("WORKKKKKKK")), 0, 0),
    ) as ReplaceStep | null;
    assert(step1, "Could not create step1");
    originalTransaction.step(step1);

    // Step 2: Replace second "test" with "WORKKKKKKK"
    // Create step with original positions, then map it
    const step2 = replaceStep(
      doc,
      doc.tag["c"]!,
      doc.tag["d"],
      new Slice(Fragment.from(testBuilders.schema.text("WORKKKKKKK")), 0, 0),
    ) as ReplaceStep | null;
    assert(step2, "Could not create step2");
    const mappedStep2 = step2.map(originalTransaction.mapping);
    assert(mappedStep2, "Could not map step2");
    originalTransaction.step(mappedStep2);

    // Step 3: Replace third "test" with "WORKKKKKKK"
    // Create step with original positions, then map it
    const step3 = replaceStep(
      doc,
      doc.tag["e"]!,
      doc.tag["f"],
      new Slice(Fragment.from(testBuilders.schema.text("WORKKKKKKK")), 0, 0),
    ) as ReplaceStep | null;
    assert(step3, "Could not create step3");
    const mappedStep3 = step3.map(originalTransaction.mapping);
    assert(mappedStep3, "Could not map step3");
    originalTransaction.step(mappedStep3);

    // Step 4: Replace fourth "test" with "WORKKKKKKK"
    // Create step with original positions, then map it
    const step4 = replaceStep(
      doc,
      doc.tag["g"]!,
      doc.tag["h"],
      new Slice(Fragment.from(testBuilders.schema.text("WORKKKKKKK")), 0, 0),
    ) as ReplaceStep | null;
    assert(step4, "Could not create step4");
    const mappedStep4 = step4.map(originalTransaction.mapping);
    assert(mappedStep4, "Could not map step4");
    originalTransaction.step(mappedStep4);

    // Verify the transaction produces expected result
    const originalTrState = editorState.apply(originalTransaction);
    expect(originalTrState.doc.textContent).toEqual(
      "WORKKKKKKK WORKKKKKKKWORKKKKKKK WORKKKKKKK",
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

  it("should not create empty paragraphs on cross-block deletions", () => {
    const doc = testBuilders.doc(
      testBuilders.orderedList(
        testBuilders.listItem(testBuilders.paragraph("<a>AAA")),
      ),
      testBuilders.paragraph("B<b>BB"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!, doc.tag["b"]!),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.deleteSelection();

    const suggestedTr = transformToSuggestionTransaction(
      originalTransaction,
      editorState,
    );
    const newState = editorState.apply(suggestedTr);

    // The deletion should only mark "AAA" and "B" as deleted.
    // "BB" should remain unmarked, with no extra empty paragraphs.
    const expected = testBuilders.doc(
      testBuilders.orderedList(
        testBuilders.listItem(
          testBuilders.paragraph(testBuilders.deletion({ id: 1 }, "AAA")),
        ),
      ),
      testBuilders.paragraph(testBuilders.deletion({ id: 1 }, "B"), "BB"),
    );

    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
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
