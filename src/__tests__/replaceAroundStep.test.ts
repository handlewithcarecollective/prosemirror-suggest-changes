/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { ReplaceAroundStep, findWrapping } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { suggestReplaceAroundStep } from "../replaceAroundStep.js";

import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";

describe("ReplaceAroundStep", () => {
  it("should handle setNodeMarkup", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atStart(doc),
    });

    const originalTransaction = editorState.tr;

    const pos = originalTransaction.doc.children[0]!.nodeSize;

    originalTransaction.setNodeMarkup(pos, testBuilders.schema.nodes.heading, {
      level: 2,
    });

    const step = originalTransaction.steps[0];
    assert(
      step instanceof ReplaceAroundStep,
      "Could not create test ReplaceAroundStep",
    );

    const trackedTransaction = editorState.tr;
    suggestReplaceAroundStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.modification(
        {
          id: 1,
          type: "attr",
          attrName: "level",
          previousValue: 1,
          newValue: 2,
        },
        testBuilders.modification(
          {
            id: 1,
            type: "nodeType",
            previousValue: "paragraph",
            newValue: "heading",
          },
          testBuilders.heading({ level: 2 }, "second paragraph"),
        ),
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  describe("remove node marks via setNodeMarkup", () => {
    // These tests are copied from RemoveNodeMarkStep test,
    // but modified to use setNodeMarkup
    it("should add a modification mark", () => {
      const doc = testBuilders.doc(
        testBuilders.difficulty(
          { level: "beginner" },
          testBuilders.paragraph("first paragraph"),
        ),
        testBuilders.paragraph("second paragraph"),
      ) as TaggedNode;

      const editorState = EditorState.create({
        doc,
        selection: TextSelection.atStart(doc),
      });

      const originalTransaction = editorState.tr;

      originalTransaction.setNodeMarkup(0, undefined, undefined, []);

      const step = originalTransaction.steps[0];
      assert(
        step instanceof ReplaceAroundStep,
        "Could not create test RemoveNodeMark",
      );

      const trackedTransaction = editorState.tr;
      suggestReplaceAroundStep(
        trackedTransaction,
        editorState,
        doc,
        step,
        [],
        1,
      );

      const trackedState = editorState.apply(trackedTransaction);

      const expected = testBuilders.doc(
        testBuilders.modification(
          {
            id: 1,
            type: "mark",
            // we know this mark exists
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            previousValue: doc.children[0]!.marks[0]!.toJSON(),
            newValue: null,
          },
          testBuilders.paragraph("first paragraph"),
        ),
        testBuilders.paragraph("second paragraph"),
      );

      assert(
        eq(trackedState.doc, expected),
        `Expected ${trackedState.doc} to match ${expected}`,
      );
    });

    it("should remove already-modified marks", () => {
      const doc = testBuilders.doc(
        testBuilders.modification(
          {
            id: 1,
            type: "mark",
            previousValue: null,
            newValue: testBuilders.schema.marks.difficulty
              .create({
                level: "beginner",
              })
              .toJSON(),
          },
          testBuilders.difficulty(
            { level: "beginner" },
            testBuilders.paragraph("first paragraph"),
          ),
        ),
        testBuilders.paragraph("second paragraph"),
      ) as TaggedNode;

      const editorState = EditorState.create({
        doc,
        selection: TextSelection.atStart(doc),
      });

      const originalTransaction = editorState.tr;

      originalTransaction.setNodeMarkup(0, undefined, undefined, []);

      const step = originalTransaction.steps[0];
      assert(
        step instanceof ReplaceAroundStep,
        "Could not create test RemoveNodeMark",
      );

      const trackedTransaction = editorState.tr;
      suggestReplaceAroundStep(
        trackedTransaction,
        editorState,
        doc,
        step,
        [],
        1,
      );

      const trackedState = editorState.apply(trackedTransaction);

      const expected = testBuilders.doc(
        testBuilders.paragraph("first paragraph"),
        testBuilders.paragraph("second paragraph"),
      );

      assert(
        eq(trackedState.doc, expected),
        `Expected ${trackedState.doc} to match ${expected}`,
      );
    });
  });

  describe("add node marks via setNodeMarkup", () => {
    // These tests are copied from AddNodeMarkStep test,
    // but modified to use setNodeMarkup
    it("should add a modification mark", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph("first paragraph"),
        testBuilders.paragraph("second paragraph"),
      ) as TaggedNode;

      const editorState = EditorState.create({
        doc,
        selection: TextSelection.atStart(doc),
      });

      const originalTransaction = editorState.tr;

      const markToAdd = testBuilders.schema.marks.difficulty.create({
        level: "beginner",
      });
      originalTransaction.setNodeMarkup(0, undefined, undefined, [markToAdd]);
      const step = originalTransaction.steps[0];
      assert(
        step instanceof ReplaceAroundStep,
        "Could not create test setNodeMarkup",
      );

      const trackedTransaction = editorState.tr;
      suggestReplaceAroundStep(
        trackedTransaction,
        editorState,
        doc,
        step,
        [],
        1,
      );

      const trackedState = editorState.apply(trackedTransaction);

      const expected = testBuilders.doc(
        testBuilders.modification(
          {
            id: 1,
            type: "mark",
            previousValue: null,
            newValue: markToAdd.toJSON(),
          },
          testBuilders.difficulty(
            { level: "beginner" },
            testBuilders.paragraph("first paragraph"),
          ),
        ),
        testBuilders.paragraph("second paragraph"),
      );

      assert(
        eq(trackedState.doc, expected),
        `Expected ${trackedState.doc} to match ${expected}`,
      );
    });

    it("should replace incompatible marks", () => {
      const doc = testBuilders.doc(
        testBuilders.difficulty(
          { level: "beginner" },
          testBuilders.paragraph("first paragraph"),
        ),
        testBuilders.paragraph("second paragraph"),
      ) as TaggedNode;

      const editorState = EditorState.create({
        doc,
        selection: TextSelection.atStart(doc),
      });

      const originalTransaction = editorState.tr;

      const markToAdd = testBuilders.schema.marks.difficulty.create({
        level: "advanced",
      });

      originalTransaction.setNodeMarkup(0, undefined, undefined, [markToAdd]);
      const step = originalTransaction.steps[0];
      assert(
        step instanceof ReplaceAroundStep,
        "Could not create test AddNodeMarkStep",
      );

      const trackedTransaction = editorState.tr;
      suggestReplaceAroundStep(
        trackedTransaction,
        editorState,
        doc,
        step,
        [],
        1,
      );

      const trackedState = editorState.apply(trackedTransaction);

      const expected = testBuilders.doc(
        testBuilders.modification(
          {
            id: 1,
            type: "mark",
            previousValue: testBuilders.schema.marks.difficulty
              .create({ level: "beginner" })
              .toJSON(),
            newValue: markToAdd.toJSON(),
          },
          testBuilders.difficulty(
            { level: "advanced" },
            testBuilders.paragraph("first paragraph"),
          ),
        ),
        testBuilders.paragraph("second paragraph"),
      );

      assert(
        eq(trackedState.doc, expected),
        `Expected ${trackedState.doc} to match ${expected}`,
      );
    });
  });

  it("should treat a replace around as a standard replace", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("<a>first paragraph<b>"),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.near(doc.resolve(doc.tag["a"]!)),
    });

    const originalTransaction = editorState.tr;

    const range = doc
      .resolve(doc.tag["a"]!)
      .blockRange(doc.resolve(doc.tag["b"]!))!;
    originalTransaction.wrap(
      range,
      findWrapping(range, testBuilders.schema.nodes.orderedList)!,
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof ReplaceAroundStep,
      "Could not create test ReplaceAroundStep",
    );

    const trackedTransaction = editorState.tr;
    suggestReplaceAroundStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.deletion(
        { id: 1 },
        testBuilders.paragraph("first paragraph"),
      ),
      testBuilders.insertion(
        { id: 1 },
        testBuilders.orderedList(
          testBuilders.listItem(testBuilders.paragraph("first paragraph")),
        ),
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should apply tracked changes to the replaced content", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "<a>fir",
        testBuilders.deletion({ id: 1 }, "st"),
        testBuilders.insertion({ id: 1 }, "e"),
        " paragraph<b>",
      ),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.near(doc.resolve(doc.tag["a"]!)),
    });

    const originalTransaction = editorState.tr;

    const range = doc
      .resolve(doc.tag["a"]!)
      .blockRange(doc.resolve(doc.tag["b"]!))!;
    originalTransaction.wrap(
      range,
      findWrapping(range, testBuilders.schema.nodes.orderedList)!,
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof ReplaceAroundStep,
      "Could not create test ReplaceAroundStep",
    );

    const trackedTransaction = editorState.tr;
    suggestReplaceAroundStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.deletion(
        { id: 1 },
        testBuilders.paragraph(
          "<a>fir",
          testBuilders.deletion({ id: 1 }, "st"),
          " paragraph<b>",
        ),
      ),
      testBuilders.insertion(
        { id: 1 },
        testBuilders.orderedList(
          testBuilders.listItem(testBuilders.paragraph("fire paragraph")),
        ),
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });
});
