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
import {
  createSplitList,
  createDoubleSplitBulletList,
  applyBackspaceAtTag,
  type SplitDocResult,
} from "./testHelpers.js";

const ZWSP = "\u200B";

describe("Nested Block Join Operations", () => {
  describe.each([
    { listType: "bullet" as const, text: "test item" },
    { listType: "ordered" as const, text: "first step" },
  ])("$listType List Joins", ({ listType, text }) => {
    it.each([
      { text1: text, text2: "", desc: "at end" },
      {
        text1: (text.split(" ")[0] ?? "") + " ",
        text2: text.split(" ")[1] ?? "",
        desc: "in middle",
      },
    ])(
      "should join list items when backspacing after split $desc",
      ({ text1, text2 }) => {
        const { doc: splitDoc, state: splitState } = createSplitList(
          listType,
          text1,
          text2,
          1,
        ) as SplitDocResult;
        const finalState = applyBackspaceAtTag(splitDoc, splitState);

        const listBuilder =
          listType === "bullet"
            ? testBuilders.bulletList
            : testBuilders.orderedList;
        const expectedFinal = testBuilders.doc(
          listBuilder(testBuilders.listItem(testBuilders.paragraph(text))),
        );

        assert(
          eq(finalState.doc, expectedFinal),
          "Should rejoin to original single list item",
        );
      },
    );
  });

  describe("Multiple List Items", () => {
    it("should only join adjacent list items when deleting middle boundary", () => {
      const doc = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(
            testBuilders.paragraph(
              "Item A",
              testBuilders.insertion({ id: 1 }, ZWSP),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 1 }, ZWSP),
              "Item B<boundary>",
              testBuilders.insertion({ id: 2 }, ZWSP),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 2 }, ZWSP),
              "Item C",
            ),
          ),
        ),
      ) as TaggedNode;

      const boundaryPos = doc.tag["boundary"];
      assert(boundaryPos !== undefined, "Tag 'boundary' not found in document");

      const editorState = EditorState.create({ doc });

      // Delete at the boundary between Item B and Item C
      const deleteStep = replaceStep(
        doc,
        boundaryPos,
        boundaryPos + 1,
        Slice.empty,
      ) as ReplaceStep | null;

      assert(deleteStep, "Could not create delete step");

      const deleteTransaction = editorState.tr;
      suggestReplaceStep(
        deleteTransaction,
        editorState,
        doc,
        deleteStep,
        [],
        3,
      );

      const finalState = editorState.apply(deleteTransaction);

      // Expected: Item B and C joined, Item A remains separate
      const expectedFinal = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(
            testBuilders.paragraph(
              "Item A",
              testBuilders.insertion({ id: 1 }, ZWSP),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 1 }, ZWSP),
              "Item BItem C",
            ),
          ),
        ),
      );

      assert(
        eq(finalState.doc, expectedFinal),
        "Should join only Item B and Item C, leaving Item A intact",
      );
    });
  });

  describe("Deeply Nested Structures", () => {
    it("should join list items inside blockquote", () => {
      const splitDoc = testBuilders.doc(
        testBuilders.blockquote(
          testBuilders.bulletList(
            testBuilders.listItem(
              testBuilders.paragraph(
                "quoted ",
                testBuilders.insertion({ id: 1 }, ZWSP + "<zwsp>"),
              ),
            ),
            testBuilders.listItem(
              testBuilders.paragraph(
                testBuilders.insertion({ id: 1 }, ZWSP),
                "item",
              ),
            ),
          ),
        ),
      ) as TaggedNode;

      const splitState = EditorState.create({ doc: splitDoc });
      const finalState = applyBackspaceAtTag(splitDoc, splitState);

      const expectedFinal = testBuilders.doc(
        testBuilders.blockquote(
          testBuilders.bulletList(
            testBuilders.listItem(testBuilders.paragraph("quoted item")),
          ),
        ),
      );

      assert(
        eq(finalState.doc, expectedFinal),
        "Should rejoin list items inside blockquote",
      );
    });
  });

  describe("List Items with Modified Content", () => {
    it("should keep added content when backspacing at boundary", () => {
      const splitDoc = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(
            testBuilders.paragraph(
              "test ",
              testBuilders.insertion({ id: 1 }, ZWSP + "<zwsp>"),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 1 }, ZWSP + "<insertPos>"),
              "item",
            ),
          ),
        ),
      ) as TaggedNode;

      const splitState = EditorState.create({ doc: splitDoc });

      // Add text to the second list item
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

      // Backspace at the boundary
      const finalState = applyBackspaceAtTag(splitDoc, stateWithText);

      const expectedFinal = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(
            testBuilders.paragraph(
              "test ",
              testBuilders.insertion({ id: 1 }, "new "),
              "item",
            ),
          ),
        ),
      );

      assert(
        eq(finalState.doc, expectedFinal),
        "Should join list and keep added content",
      );
    });
  });

  describe("Chain Pairing", () => {
    it("should handle multiple splits and joins (Enter twice, Backspace twice)", () => {
      const { doc: doubleSplitDoc, state: state2 } =
        createDoubleSplitBulletList("test item", 1) as SplitDocResult;

      // First Backspace - join items 2 and 3
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

      // Second Backspace - join items 1 and 2
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
        testBuilders.bulletList(
          testBuilders.listItem(testBuilders.paragraph("test item")),
        ),
      );

      assert(
        eq(finalState.doc, expectedFinal),
        "Should return to original single list item after two backspaces",
      );
    });
  });

  describe("Multiple Sequential Joins", () => {
    it("should handle multiple list item joins in single transaction", () => {
      const doc = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(
            testBuilders.paragraph(
              "Item A<boundary1>",
              testBuilders.insertion({ id: 1 }, ZWSP),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 1 }, ZWSP),
              "Item B<boundary2>",
              testBuilders.insertion({ id: 2 }, ZWSP),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 2 }, ZWSP),
              "Item C",
            ),
          ),
        ),
      ) as TaggedNode;

      const boundary1 = doc.tag["boundary1"];
      const boundary2 = doc.tag["boundary2"];
      assert(boundary1 !== undefined, "Tag 'boundary1' not found");
      assert(boundary2 !== undefined, "Tag 'boundary2' not found");

      const editorState = EditorState.create({ doc });
      const tr = editorState.tr;

      tr.delete(boundary2, boundary2 + 1);
      const mappedBoundary1 = tr.mapping.map(boundary1);
      tr.delete(mappedBoundary1, mappedBoundary1 + 1);

      const suggestTransaction = editorState.tr;
      for (const step of tr.steps) {
        suggestReplaceStep(
          suggestTransaction,
          editorState,
          editorState.doc,
          step as ReplaceStep,
          [],
          3,
        );
      }

      const finalState = editorState.apply(suggestTransaction);

      const expectedFinal = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(testBuilders.paragraph("Item AItem BItem C")),
        ),
      );

      assert(
        eq(finalState.doc, expectedFinal),
        "Should join all three list items in single transaction",
      );
    });
  });
});
