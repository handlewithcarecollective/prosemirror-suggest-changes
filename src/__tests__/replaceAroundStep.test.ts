/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
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

    originalTransaction.setNodeMarkup(0, testBuilders.schema.nodes.heading, {
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
      testBuilders.modification(
        {
          id: 1,
          type: "attr",
          attrName: "level",
          previousValue: 1, // TBD: previousValue should be 1 (default value), or undefined?
          newValue: 2,
        },
        testBuilders.modification(
          {
            id: 1,
            type: "nodeType",
            previousValue: "paragraph",
            newValue: "heading",
          },
          testBuilders.heading({ level: 2 }, "first paragraph"),
        ),
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
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
