import { Fragment, Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { type ReplaceStep, replaceStep } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { suggestReplaceStep } from "../../../replaceStep.js";
import {
  type TaggedNode,
  testBuilders,
} from "../../../testing/testBuilders.js";
import { createSplitParagraphs, type SplitDocResult } from "./testHelpers.js";

const ZWSP = "\u200B";

describe("Cross-Block Replace Operations", () => {
  it("should mark new content with insertion when replacing across block boundaries", () => {
    // Start with split paragraphs: "Hello [ZWSP]" / "[ZWSP]World"
    const { doc: splitDoc, state: splitState } = createSplitParagraphs(
      "Hello",
      "World",
      1,
    ) as SplitDocResult;

    // Find the position of the ZWSP in the first paragraph
    const zwspPos = splitDoc.tag["zwsp"];
    assert(zwspPos !== undefined, "ZWSP tag not found");

    // User selects from ZWSP through "Wor" (3 characters into "World")
    // This crosses the block boundary
    const from = zwspPos;
    const to = zwspPos + 1 + 1 + 3; // +1 for ZWSP, +1 for block boundary, +3 for "Wor"

    // User types "X" to replace the selection
    const replaceWithXStep = replaceStep(
      splitDoc,
      from,
      to,
      new Slice(Fragment.from(testBuilders.schema.text("X")), 0, 0),
    ) as ReplaceStep | null;

    assert(replaceWithXStep, "Could not create replace step");

    const transaction = splitState.tr;
    suggestReplaceStep(
      transaction,
      splitState,
      splitDoc,
      replaceWithXStep,
      [],
      2,
    );
    const finalState = splitState.apply(transaction);

    // Expected result:
    // - The split should be joined (ZWSPs removed)
    // - "Wo" should be marked as deleted
    // - "X" should be marked with insertion
    // - Final text: "HelloWoXrld" (with Wo deleted)
    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph(
        "Hello",
        testBuilders.deletion({ id: 2 }, "Wo"),
        testBuilders.insertion({ id: 2 }, "X"),
        "rld",
      ),
    );

    assert(
      eq(finalState.doc, expectedFinal),
      "New content should be marked with insertion even when block join occurs",
    );
  });

  it("should handle replace that deletes entire second block", () => {
    // Start with split paragraphs: "First" / "Second"
    const { doc: splitDoc, state: splitState } = createSplitParagraphs(
      "First",
      "Second",
      1,
    ) as SplitDocResult;

    const zwspPos = splitDoc.tag["zwsp"];
    assert(zwspPos !== undefined, "ZWSP tag not found");

    // Select from ZWSP through end of "Second"
    const from = zwspPos;
    const to = zwspPos + 1 + 1 + 6; // +1 ZWSP, +1 boundary, +6 for "Second"

    // Replace with "New"
    const replaceWithNewStep = replaceStep(
      splitDoc,
      from,
      to,
      new Slice(Fragment.from(testBuilders.schema.text("New")), 0, 0),
    ) as ReplaceStep | null;

    assert(replaceWithNewStep, "Could not create replace step");

    const transaction = splitState.tr;
    suggestReplaceStep(
      transaction,
      splitState,
      splitDoc,
      replaceWithNewStep,
      [],
      2,
    );
    const finalState = splitState.apply(transaction);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph(
        "First",
        testBuilders.deletion({ id: 2 }, "Secon"),
        testBuilders.insertion({ id: 2 }, "New"),
        "d",
      ),
    );

    assert(
      eq(finalState.doc, expectedFinal),
      "Replacement text should be marked as insertion",
    );
  });

  it("should handle replace when selection starts in middle of first block", () => {
    // Start with split paragraphs
    const splitDoc = testBuilders.doc(
      testBuilders.paragraph(
        "Hello<sel>",
        testBuilders.insertion({ id: 1 }, ZWSP + "<zwsp>"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, ZWSP),
        "Wo<end>rld",
      ),
    ) as TaggedNode;

    const splitState = EditorState.create({ doc: splitDoc });

    const selPos = splitDoc.tag["sel"];
    const endPos = splitDoc.tag["end"];
    assert(selPos !== undefined, "Selection start tag not found");
    assert(endPos !== undefined, "Selection end tag not found");

    // User types "X" to replace " [ZWSP] / [ZWSP]Wo"
    const replaceWithXStep = replaceStep(
      splitDoc,
      selPos,
      endPos,
      new Slice(Fragment.from(testBuilders.schema.text("X")), 0, 0),
    ) as ReplaceStep | null;

    assert(replaceWithXStep, "Could not create replace step");

    const transaction = splitState.tr;
    suggestReplaceStep(
      transaction,
      splitState,
      splitDoc,
      replaceWithXStep,
      [],
      2,
    );
    const finalState = splitState.apply(transaction);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph(
        "Hello",
        testBuilders.deletion({ id: 2 }, "Wo"),
        testBuilders.insertion({ id: 2 }, "X"),
        "rld",
      ),
    );

    assert(
      eq(finalState.doc, expectedFinal),
      "Replacement should be marked with insertion when crossing joined blocks",
    );
  });
});
