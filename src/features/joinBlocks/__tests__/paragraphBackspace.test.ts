import { Fragment, Slice } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { type ReplaceStep, replaceStep } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { suggestReplaceStep } from "../../../replaceStep.js";
import {
  type TaggedNode,
  testBuilders,
} from "../../../testing/testBuilders.js";
import { getSuggestionMarks } from "../../../utils.js";
import {
  createSplitParagraphs,
  createDoubleSplitParagraphs,
  applyBackspaceAtTag,
  applyDeleteAtTag,
  type SplitDocResult,
} from "./testHelpers.js";

const ZWSP = "\u200B";

describe("Paragraph Backspace Behavior", () => {
  it("should remove suggested paragraph when backspacing immediately after creation", () => {
    const splitDoc = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.insertion({ id: 1 }, ZWSP + "<zwsp>"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, ZWSP),
        "paragraph",
      ),
    ) as TaggedNode;

    const splitState = EditorState.create({ doc: splitDoc });
    const finalState = applyBackspaceAtTag(splitDoc, splitState);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
    );

    assert(
      eq(finalState.doc, expectedFinal),
      "Should return to original state",
    );
  });

  it("should delete character immediately after ZWSP", () => {
    // Document with ZWSP + character in same text node (same insertion mark)
    const doc = testBuilders.doc(
      testBuilders.paragraph("first ", testBuilders.insertion({ id: 1 }, ZWSP)),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, ZWSP + "A<a>"),
        "paragraph",
      ),
    ) as TaggedNode;

    const state = EditorState.create({ doc });
    const tagA = doc.tag["a"];
    assert(tagA !== undefined, "Tag 'a' not found");
    const charPos = tagA - 1; // Position of "A"

    const backspaceStep = replaceStep(
      doc,
      charPos,
      charPos + 1,
      Slice.empty,
    ) as ReplaceStep;
    const tr = state.tr;
    suggestReplaceStep(tr, state, doc, backspaceStep, [], 2);
    const finalState = state.apply(tr);

    const expected = testBuilders.doc(
      testBuilders.paragraph("first ", testBuilders.insertion({ id: 1 }, ZWSP)),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, ZWSP),
        "paragraph",
      ),
    );

    assert(eq(finalState.doc, expected), "Character A should be deleted");
  });

  it("should keep added content when backspacing at boundary", () => {
    const splitDoc = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.insertion({ id: 1 }, ZWSP + "<zwsp>"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, ZWSP + "<insertPos>"),
        "paragraph",
      ),
    ) as TaggedNode;

    const splitState = EditorState.create({ doc: splitDoc });

    const insertPos = splitDoc.tag["insertPos"];
    assert(insertPos !== undefined, "Insert position tag not found");

    const insertTextStep = replaceStep(
      splitDoc,
      insertPos,
      insertPos,
      new Slice(Fragment.from(testBuilders.schema.text("new ")), 0, 0),
    ) as ReplaceStep | null;

    assert(insertTextStep, "Could not create text insertion step");

    const insertTextTransaction = splitState.tr;
    suggestReplaceStep(
      insertTextTransaction,
      splitState,
      splitDoc,
      insertTextStep,
      [],
      1,
    );
    const stateWithText = splitState.apply(insertTextTransaction);

    const finalState = applyBackspaceAtTag(splitDoc, stateWithText);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.insertion({ id: 1 }, "new "),
        "paragraph",
      ),
    );

    assert(
      eq(finalState.doc, expectedFinal),
      "Should join paragraph and keep added content",
    );
  });

  it("should only join blocks with same suggestion ID", () => {
    const splitDoc = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.insertion({ id: 1 }, "<zwsp1>" + ZWSP),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "<zwsp2>" + ZWSP),
        "paragraph",
      ),
    ) as TaggedNode;

    const splitState = EditorState.create({ doc: splitDoc });

    // Manually mark the second ZWSP with a different ID
    const { insertion } = getSuggestionMarks(splitState.schema);
    const modifyMarkTransaction = splitState.tr;

    const zwsp2Pos = splitDoc.tag["zwsp2"];
    assert(zwsp2Pos !== undefined, "ZWSP2 tag not found");

    modifyMarkTransaction.removeMark(zwsp2Pos, zwsp2Pos + 1, insertion);
    modifyMarkTransaction.addMark(
      zwsp2Pos,
      zwsp2Pos + 1,
      insertion.create({ id: 2 }),
    );

    const modifiedState = splitState.apply(modifyMarkTransaction);

    const zwsp1Pos = splitDoc.tag["zwsp1"];
    assert(zwsp1Pos !== undefined, "ZWSP1 tag not found");

    const backspaceStep = replaceStep(
      modifiedState.doc,
      zwsp1Pos,
      zwsp1Pos + 1,
      Slice.empty,
    ) as ReplaceStep | null;
    assert(backspaceStep, "Could not create backspace step");

    const backspaceTransaction = modifiedState.tr;
    suggestReplaceStep(
      backspaceTransaction,
      modifiedState,
      modifiedState.doc,
      backspaceStep,
      [],
      3,
    );
    const finalState = modifiedState.apply(backspaceTransaction);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph("first "),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 2 }, ZWSP),
        "paragraph",
      ),
    );

    assert(
      eq(finalState.doc, expectedFinal),
      "Blocks with different suggestion IDs should not be joined",
    );
  });

  it.each([
    { text1: "test paragraph", text2: "", desc: "at end" },
    { text1: "test ", text2: "paragraph", desc: "in middle" },
  ])(
    "should rejoin paragraphs when backspacing after split $desc",
    ({ text1, text2 }) => {
      const { doc: splitDoc, state: splitState } = createSplitParagraphs(
        text1,
        text2,
        1,
      ) as SplitDocResult;
      const finalState = applyBackspaceAtTag(splitDoc, splitState);

      const expectedFinal = testBuilders.doc(
        testBuilders.paragraph("test paragraph"),
      );

      assert(
        eq(finalState.doc, expectedFinal),
        "Should rejoin to original paragraph",
      );
    },
  );

  it("should handle multiple sequential split/join cycles", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("test paragraph<a>"),
    ) as TaggedNode;

    const tagA = doc.tag["a"];
    assert(tagA !== undefined, "Tag 'a' not found in document");

    let currentState = EditorState.create({
      doc,
      selection: new TextSelection(doc.resolve(tagA), doc.resolve(tagA)),
    });

    for (let cycle = 1; cycle <= 3; cycle++) {
      // SPLIT
      const splitStep = replaceStep(
        currentState.doc,
        tagA,
        tagA,
        new Slice(
          Fragment.from([testBuilders.paragraph(), testBuilders.paragraph()]),
          1,
          1,
        ),
      ) as ReplaceStep | null;

      assert(splitStep, `Cycle ${String(cycle)}: Could not create split step`);

      const splitTransaction = currentState.tr;
      suggestReplaceStep(
        splitTransaction,
        currentState,
        currentState.doc,
        splitStep,
        [],
        1,
      );
      const splitState = currentState.apply(splitTransaction);

      // JOIN
      const cursorPos = tagA + 4;
      const backspaceStep = replaceStep(
        splitState.doc,
        cursorPos - 1,
        cursorPos,
        Slice.empty,
      ) as ReplaceStep | null;
      assert(
        backspaceStep,
        `Cycle ${String(cycle)}: Could not create backspace step`,
      );

      const backspaceTransaction = splitState.tr;
      suggestReplaceStep(
        backspaceTransaction,
        splitState,
        splitState.doc,
        backspaceStep,
        [],
        1,
      );
      currentState = splitState.apply(backspaceTransaction);
    }

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph("test paragraph"),
    );
    assert(
      eq(currentState.doc, expectedFinal),
      "After 3 cycles, document should be unchanged",
    );
  });

  it("should revert through nested suggestions when backspacing twice", () => {
    const { doc: doubleSplitDoc, state: state2 } = createDoubleSplitParagraphs(
      "test paragraph",
      1,
    ) as SplitDocResult;

    // First Backspace - join paragraphs 2 and 3
    const zwsp2Pos = doubleSplitDoc.tag["zwsp2"];
    assert(zwsp2Pos !== undefined, "ZWSP2 tag not found");

    const backspace1Step = replaceStep(
      doubleSplitDoc,
      zwsp2Pos,
      zwsp2Pos + 1,
      Slice.empty,
    ) as ReplaceStep | null;
    assert(backspace1Step, "Could not create first backspace step");

    const backspace1Transaction = state2.tr;
    suggestReplaceStep(
      backspace1Transaction,
      state2,
      doubleSplitDoc,
      backspace1Step,
      [],
      2,
    );
    const state3 = state2.apply(backspace1Transaction);

    // Second Backspace - join paragraphs 1 and 2
    const zwsp1Pos = doubleSplitDoc.tag["zwsp1"];
    assert(zwsp1Pos !== undefined, "ZWSP1 tag not found");
    const mappedZwsp1Pos = backspace1Transaction.mapping.map(zwsp1Pos);

    const backspace2Step = replaceStep(
      state3.doc,
      mappedZwsp1Pos,
      mappedZwsp1Pos + 1,
      Slice.empty,
    ) as ReplaceStep | null;
    assert(backspace2Step, "Could not create second backspace step");

    const backspace2Transaction = state3.tr;
    suggestReplaceStep(
      backspace2Transaction,
      state3,
      state3.doc,
      backspace2Step,
      [],
      3,
    );
    const finalState = state3.apply(backspace2Transaction);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph("test paragraph"),
    );
    assert(
      eq(finalState.doc, expectedFinal),
      "Should return to original single paragraph after two backspaces",
    );
  });

  it("should handle forward delete from end of first block", () => {
    const { doc: splitDoc, state: splitState } = createSplitParagraphs(
      "test paragraph",
      "",
      1,
    ) as SplitDocResult;
    const finalState = applyDeleteAtTag(splitDoc, splitState, "zwsp");

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph("test paragraph"),
    );
    assert(
      eq(finalState.doc, expectedFinal),
      "Should join blocks after forward delete",
    );
  });

  it("should handle block split at start of document", () => {
    const { doc: splitDoc, state: splitState } = createSplitParagraphs(
      "",
      "test paragraph",
      1,
    ) as SplitDocResult;
    const finalState = applyBackspaceAtTag(splitDoc, splitState);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph("test paragraph"),
    );
    assert(
      eq(finalState.doc, expectedFinal),
      "Should revert to original single paragraph",
    );
  });

  it("should handle block split at end with multiple paragraphs in document", () => {
    const splitDoc = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.paragraph(
        "second paragraph",
        testBuilders.insertion({ id: 1 }, ZWSP + "<zwsp>"),
      ),
      testBuilders.paragraph(testBuilders.insertion({ id: 1 }, ZWSP)),
    ) as TaggedNode;

    const splitState = EditorState.create({ doc: splitDoc });
    const finalState = applyBackspaceAtTag(splitDoc, splitState);

    const expectedFinal = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.paragraph("second paragraph"),
    );

    assert(eq(finalState.doc, expectedFinal), "Should revert to 2 paragraphs");
  });
});
