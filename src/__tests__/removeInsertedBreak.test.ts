/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { assert, describe, it } from "vitest";

import { removeInsertedBreak } from "../removeInsertedBreak.js";
import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";
import { transformToSuggestionTransaction } from "../withSuggestChanges.js";

describe("removeInsertedBreak", () => {
  it("rejoins a sentence split in the middle in one keystroke (Backspace)", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "hello ",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        "<a>world",
      ),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    let newState = state;
    const handled = removeInsertedBreak(-1)(state, (tr) => {
      newState = state.apply(transformToSuggestionTransaction(tr, state));
    });

    assert(handled, "command should rejoin the split");
    const expected = testBuilders.doc(testBuilders.paragraph("hello world"));
    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("rejoins a sentence split in the middle in one keystroke (Delete)", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "hello <a>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        "world",
      ),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    let newState = state;
    const handled = removeInsertedBreak(1)(state, (tr) => {
      newState = state.apply(transformToSuggestionTransaction(tr, state));
    });

    assert(handled, "command should rejoin the split");
    const expected = testBuilders.doc(testBuilders.paragraph("hello world"));
    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("removes an inserted empty paragraph by joining across its break (Backspace)", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "text",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, "\u200B<a>")),
      testBuilders.paragraph("more"),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    let newState = state;
    const handled = removeInsertedBreak(-1)(state, (tr) => {
      newState = state.apply(transformToSuggestionTransaction(tr, state));
    });

    assert(handled, "command should handle the inserted empty paragraph");
    const expected = testBuilders.doc(
      testBuilders.paragraph("text"),
      testBuilders.paragraph("more"),
    );
    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("removes an inserted empty paragraph by joining across its break (Delete)", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "text",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, "\u200B<a>")),
      testBuilders.paragraph("more"),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    let newState = state;
    const handled = removeInsertedBreak(1)(state, (tr) => {
      newState = state.apply(transformToSuggestionTransaction(tr, state));
    });

    assert(handled, "command should handle the inserted empty paragraph");
    const expected = testBuilders.doc(
      testBuilders.paragraph("text"),
      testBuilders.paragraph("more"),
    );
    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("removes one of two stacked empty paragraphs, leaving the other tracked", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("A"),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, "\u200B")),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B\u200B<a>"),
      ),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, "\u200B"), "B"),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    let newState = state;
    const handled = removeInsertedBreak(-1)(state, (tr) => {
      newState = state.apply(transformToSuggestionTransaction(tr, state));
    });

    assert(handled, "command should remove one of the empty paragraphs");
    const expected = testBuilders.doc(
      testBuilders.paragraph("A"),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, "\u200B")),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, "\u200B"), "B"),
    );
    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("removes a newly added empty bullet by joining across the list-item break", () => {
    const doc = testBuilders.doc(
      testBuilders.bulletList(
        testBuilders.listItem(
          testBuilders.paragraph(
            "a",
            testBuilders.insertion({ id: 1 }, "\u200B"),
          ),
        ),
        testBuilders.listItem(
          testBuilders.paragraph(
            testBuilders.insertion({ id: 1 }, "\u200B<a>"),
          ),
        ),
        testBuilders.listItem(testBuilders.paragraph("b")),
      ),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    let newState = state;
    const handled = removeInsertedBreak(-1)(state, (tr) => {
      newState = state.apply(transformToSuggestionTransaction(tr, state));
    });

    assert(handled, "command should remove the empty bullet");
    const expected = testBuilders.doc(
      testBuilders.bulletList(
        testBuilders.listItem(testBuilders.paragraph("a")),
        testBuilders.listItem(testBuilders.paragraph("b")),
      ),
    );
    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("removes a blank inserted line between two unmarked paragraphs", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("A"),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, "\u200B<a>")),
      testBuilders.paragraph("B"),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    let newState = state;
    const handled = removeInsertedBreak(-1)(state, (tr) => {
      newState = state.apply(transformToSuggestionTransaction(tr, state));
    });

    assert(handled, "command should handle the blank inserted line");
    const expected = testBuilders.doc(
      testBuilders.paragraph("A"),
      testBuilders.paragraph("B"),
    );
    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("does nothing when the caret is in a paragraph with real content", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("he<a>llo"),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    assert(
      !removeInsertedBreak(-1)(state),
      "command should not handle a paragraph with real content",
    );
  });

  it("does nothing in an ordinary empty paragraph that was not inserted", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("A"),
      testBuilders.paragraph("<a>"),
      testBuilders.paragraph("B"),
    ) as TaggedNode;

    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, doc.tag["a"]!),
    });

    assert(
      !removeInsertedBreak(-1)(state),
      "command should ignore a non-inserted empty paragraph",
    );
  });
});
