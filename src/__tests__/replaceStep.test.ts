/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Fragment, Slice } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { type ReplaceStep, replaceStep } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { suggestReplaceStep } from "../replaceStep.js";

import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";

describe("ReplaceStep", () => {
  it("should wrap an insertion in a mark", () => {
    const doc = testBuilders.doc(testBuilders.paragraph("initial "));

    const end = TextSelection.atEnd(doc);

    // Insert the text "new" at the end of the existing text
    const step = replaceStep(
      doc,
      end.anchor,
      end.anchor,
      new Slice(Fragment.from(testBuilders.schema.text("new")), 0, 0),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: end,
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "initial ",
        testBuilders.insertion({ id: 1 }, "new"),
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should wrap a deletion in a mark", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("init<a>ial <b>"),
    ) as TaggedNode;

    // Delete "ial " from the text
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph("init", testBuilders.deletion({ id: 1 }, "ial ")),
    );
    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should wrap a replacement in marks", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("init<a>ial <b>"),
    ) as TaggedNode;

    // Replace the text "ial " with the text "new"
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      new Slice(Fragment.from(testBuilders.schema.text(" new")), 0, 0),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "init",
        testBuilders.deletion({ id: 1 }, "ial "),
        testBuilders.insertion({ id: 1 }, " new"),
      ),
    );
    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should map positions through previous steps", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("init<a>ial <b>"),
    ) as TaggedNode;

    // Delete the text "ial "
    const stepOne = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;
    assert(stepOne, "Could not create test ReplaceStep");

    // Grab the resulting doc, so that we can base the next step
    // on it
    const docOne = stepOne.apply(doc).doc;
    assert(docOne, "Could not apply test step");

    // Insert the text "new" at the end of the existing text
    const stepTwo = replaceStep(
      docOne,
      TextSelection.atEnd(docOne).anchor,
      TextSelection.atEnd(docOne).anchor,
      new Slice(Fragment.from(testBuilders.schema.text(" new")), 0, 0),
    ) as ReplaceStep | null;

    assert(stepTwo, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(stepOne).step(stepTwo);

    const trackedTransaction = editorState.tr;

    // First, replace the first step
    suggestReplaceStep(trackedTransaction, editorState, doc, stepOne, [], 1);

    // Then replace the second step, listing the first to be rebased from
    suggestReplaceStep(
      trackedTransaction,
      editorState,
      trackedTransaction.doc,
      stepTwo,
      [stepOne],
      2,
    );

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "init",
        testBuilders.deletion({ id: 1 }, "ial "),
        testBuilders.insertion({ id: 1 }, " new"),
      ),
    );
    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should handle replacements across blocks", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("first<a> paragraph"),
      testBuilders.paragraph("second<b> paragraph"),
    ) as TaggedNode;

    // Make a replacement across the block boundary
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      new Slice(Fragment.from(testBuilders.schema.text(" and only")), 0, 0),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first",
        testBuilders.deletion({ id: 1 }, " paragraph"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "second"),
        testBuilders.insertion({ id: 1 }, " and only"),
        " paragraph",
      ),
    );
    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should shift insertions to the end of deletions", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "init",
        testBuilders.deletion({ id: 1 }, "ia<a>l "),
      ),
    ) as TaggedNode;

    // Attempt to insert text within the deletion
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["a"],
      new Slice(Fragment.from(testBuilders.schema.text(" new")), 0, 0),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 2);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "init",
        testBuilders.deletion({ id: 1 }, "ial "),
        testBuilders.insertion({ id: 1 }, " new"),
      ),
    );
    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should shift insertions to the end of deletions across block boundaries", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "first",
        testBuilders.deletion({ id: 1 }, " para<a>graph"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "second"),
        " paragraph",
      ),
    ) as TaggedNode;

    // Attempt to insert text within the deletion mark
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["a"],
      new Slice(Fragment.from(testBuilders.schema.text(" and only")), 0, 0),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 2);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first",
        testBuilders.deletion({ id: 1 }, " paragraph"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "second"),
        testBuilders.insertion({ id: 1 }, " and only"),
        " paragraph",
      ),
    );
    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should only treat adjacent deletions as joined if they have the same id", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "first",
        testBuilders.deletion({ id: 1 }, " para<a>graph"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 2 }, "second"),
        " paragraph",
      ),
    ) as TaggedNode;

    // Attempt to insert text within the deletion mark
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["a"],
      new Slice(Fragment.from(testBuilders.schema.text(" and only")), 0, 0),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 3);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first",
        testBuilders.deletion({ id: 1 }, " paragraph"),
        testBuilders.insertion({ id: 1 }, " and only"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 2 }, "second"),
        " paragraph",
      ),
    );
    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should join deletions that become adjacent", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "in"),
        "<a>it<b>",
        testBuilders.deletion({ id: 2 }, "ial "),
      ),
    ) as TaggedNode;

    // Attempt to insert text within the deletion
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 3);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(testBuilders.deletion({ id: 1 }, "initial ")),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should join insertions that become adjacent to deletions", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "in"),
        "<a>it<b>",
        testBuilders.insertion({ id: 2 }, "new"),
      ),
    ) as TaggedNode;

    // Attempt to insert text within the deletion
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 3);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "init"),
        testBuilders.insertion({ id: 1 }, "new"),
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should join replacements that become adjacent to deletions", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "in"),
        "<a>it<b>",
        testBuilders.deletion({ id: 2 }, "ial "),
        testBuilders.insertion({ id: 2 }, "new"),
      ),
    ) as TaggedNode;

    // Attempt to insert text within the deletion
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 3);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "initial "),
        testBuilders.insertion({ id: 1 }, "new"),
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should join deletions across block boundaries that become adjacent", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "first",
        testBuilders.deletion({ id: 1 }, " paragraph<a>"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 2 }, "<b>second"),
        " paragraph",
      ),
    ) as TaggedNode;

    // Attempt to insert text within the deletion
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 3);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first",
        testBuilders.deletion({ id: 1 }, " paragraph"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "second"),
        " paragraph",
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should mark deletions that only include block boundaries", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("first paragraph<a>"),
      testBuilders.paragraph("<b>second paragraph"),
    ) as TaggedNode;

    // Delete from the end of the first paragraph to the
    // beginning of the second
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: new TextSelection(
        doc.resolve(doc.tag["b"]!),
        doc.resolve(doc.tag["b"]!),
      ),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first paragraph",
        testBuilders.deletion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "\u200B"),
        "second paragraph",
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should clear zero-width chars after joining with printable deletions", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "first paragraph",
        testBuilders.deletion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "\u200B"),
        "<a>second<b> paragraph",
      ),
    ) as TaggedNode;

    // Delete from the end of the first paragraph to the
    // beginning of the second
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: new TextSelection(
        doc.resolve(doc.tag["b"]!),
        doc.resolve(doc.tag["b"]!),
      ),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first paragraph",
        testBuilders.deletion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "second"),
        " paragraph",
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should mark insertions that only include block boundaries", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("first <a>paragraph"),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    // Delete from the end of the first paragraph to the
    // beginning of the second
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["a"],
      new Slice(
        Fragment.from([testBuilders.paragraph(), testBuilders.paragraph()]),
        1,
        1,
      ),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: new TextSelection(
        doc.resolve(doc.tag["a"]!),
        doc.resolve(doc.tag["a"]!),
      ),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        "paragraph",
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should handle replacements over insertion ranges with multiple text segments", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.insertion({ id: "0" }, "before"),
        testBuilders.insertion({ id: "0" }, "<a>plain"),
        testBuilders.insertion({ id: "0" }, testBuilders.strong("bold")),
        testBuilders.insertion({ id: "0" }, testBuilders.em("italic<b>both")),
      ),
    ) as TaggedNode;

    // Replace content between <a> and <b> with same text but without marks
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["b"],
      new Slice(
        Fragment.from(testBuilders.schema.text("plainbolditalic")),
        0,
        0,
      ),
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atEnd(doc),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.insertion({ id: "0" }, "beforeplainbolditalic"),
        testBuilders.insertion({ id: "0" }, testBuilders.em("both")),
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should delete single character at end of insertion without removing entire insertion", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "start ",
        testBuilders.insertion({ id: 1 }, "inserte<a>d"),
        " more text",
      ),
    ) as TaggedNode;

    // Backspace at cursor position (delete the "d")
    const step = replaceStep(
      doc,
      doc.tag["a"]!,
      doc.tag["a"]! + 1,
      Slice.empty,
    ) as ReplaceStep | null;

    assert(step, "Could not create test ReplaceStep");

    const editorState = EditorState.create({
      doc,
      selection: new TextSelection(
        doc.resolve(doc.tag["a"]!),
        doc.resolve(doc.tag["a"]!),
      ),
    });

    const originalTransaction = editorState.tr;
    originalTransaction.step(step);

    const trackedTransaction = editorState.tr;
    suggestReplaceStep(trackedTransaction, editorState, doc, step, [], 2);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "start ",
        testBuilders.insertion({ id: 1 }, "inserte"),
        " more text",
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });
});
