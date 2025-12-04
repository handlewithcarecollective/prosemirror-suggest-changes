/**
 * Test helper functions for creating pre-split documents with ZWSPs.
 * These helpers create documents that are already in a split state,
 * eliminating the need for tests to programmatically create splits.
 */

import { Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import { type ReplaceStep, replaceStep } from "prosemirror-transform";
import {
  testBuilders,
  type TaggedNode,
} from "../../../testing/testBuilders.js";
import { getSuggestionMarks } from "../../../utils.js";
import { suggestReplaceStep } from "../../../replaceStep.js";

const ZWSP = "\u200B";

export interface SplitDocResult {
  doc: TaggedNode;
  state: EditorState;
  insertion: MarkType;
}

/**
 * Creates two paragraphs with a ZWSP marker at the boundary between them.
 * This simulates the state after an Enter key press at the end of the first paragraph.
 *
 * @param text1 - Text for the first paragraph
 * @param text2 - Text for the second paragraph (optional, defaults to empty)
 * @param suggestionId - The suggestion ID for the ZWSPs and split content
 * @returns Object containing the document, editor state, and insertion mark type
 */
export const createSplitParagraphs = (
  text1: string,
  text2 = "",
  suggestionId = 1,
) => {
  const doc = testBuilders.doc(
    testBuilders.paragraph(
      text1,
      testBuilders.insertion({ id: suggestionId }, ZWSP + "<zwsp>"),
    ),
    testBuilders.paragraph(
      testBuilders.insertion({ id: suggestionId }, ZWSP),
      text2,
    ),
  );
  const state = EditorState.create({ doc });
  const { insertion } = getSuggestionMarks(state.schema);
  return { doc, state, insertion };
};

/**
 * Creates a list (bullet or ordered) with two list items and ZWSP markers at the boundary.
 * This simulates the state after an Enter key press at the end of the first list item.
 *
 * @param listType - Type of list to create ('bullet' or 'ordered')
 * @param item1Text - Text for the first list item
 * @param item2Text - Text for the second list item (optional, defaults to empty)
 * @param suggestionId - The suggestion ID for the ZWSPs and split content
 * @returns Object containing the document, editor state, and insertion mark type
 */
export const createSplitList = (
  listType: "bullet" | "ordered",
  item1Text: string,
  item2Text = "",
  suggestionId = 1,
) => {
  const listBuilder =
    listType === "bullet" ? testBuilders.bulletList : testBuilders.orderedList;

  const doc = testBuilders.doc(
    listBuilder(
      testBuilders.listItem(
        testBuilders.paragraph(
          item1Text,
          testBuilders.insertion({ id: suggestionId }, ZWSP + "<zwsp>"),
        ),
      ),
      testBuilders.listItem(
        testBuilders.paragraph(
          testBuilders.insertion({ id: suggestionId }, ZWSP),
          item2Text,
        ),
      ),
    ),
  );
  const state = EditorState.create({ doc });
  const { insertion } = getSuggestionMarks(state.schema);
  return { doc, state, insertion };
};

/**
 * Creates a bullet list with three list items after two sequential splits.
 * This simulates pressing Enter twice, creating three list items with all ZWSPs in place.
 *
 * @param item1Text - Text for the first list item
 * @param suggestionId - The suggestion ID for all ZWSPs
 * @returns Object containing the document, editor state, and insertion mark type
 */
export const createDoubleSplitBulletList = (
  item1Text: string,
  suggestionId = 1,
) => {
  const doc = testBuilders.doc(
    testBuilders.bulletList(
      testBuilders.listItem(
        testBuilders.paragraph(
          item1Text,
          testBuilders.insertion({ id: suggestionId }, ZWSP + "<zwsp1>"),
        ),
      ),
      testBuilders.listItem(
        testBuilders.paragraph(
          testBuilders.insertion({ id: suggestionId }, ZWSP),
          testBuilders.insertion({ id: suggestionId }, ZWSP + "<zwsp2>"),
        ),
      ),
      testBuilders.listItem(
        testBuilders.paragraph(
          testBuilders.insertion({ id: suggestionId }, ZWSP),
        ),
      ),
    ),
  );
  const state = EditorState.create({ doc });
  const { insertion } = getSuggestionMarks(state.schema);
  return { doc, state, insertion };
};

/**
 * Creates three paragraphs after two sequential splits.
 * This simulates pressing Enter twice, creating three paragraphs with all ZWSPs in place.
 *
 * @param text1 - Text for the first paragraph
 * @param suggestionId - The suggestion ID for all ZWSPs
 * @returns Object containing the document, editor state, and insertion mark type
 */
export const createDoubleSplitParagraphs = (
  text1: string,
  suggestionId = 1,
) => {
  const doc = testBuilders.doc(
    testBuilders.paragraph(
      text1,
      testBuilders.insertion({ id: suggestionId }, ZWSP + "<zwsp1>"),
    ),
    testBuilders.paragraph(
      testBuilders.insertion({ id: suggestionId }, ZWSP),
      testBuilders.insertion({ id: suggestionId }, ZWSP + "<zwsp2>"),
    ),
    testBuilders.paragraph(testBuilders.insertion({ id: suggestionId }, ZWSP)),
  );
  const state = EditorState.create({ doc });
  const { insertion } = getSuggestionMarks(state.schema);
  return { doc, state, insertion };
};

/**
 * Applies a backspace step at a tagged position in the document.
 * This helper eliminates boilerplate for the common pattern of backspacing at a ZWSP marker.
 *
 * @param doc - The document with a tag marking the backspace position
 * @param state - The editor state
 * @param tagName - The tag name to backspace at (defaults to "zwsp")
 * @param suggestionId - The suggestion ID for this operation
 * @returns The new editor state after applying the backspace
 */
export const applyBackspaceAtTag = (
  doc: TaggedNode,
  state: EditorState,
  tagName = "zwsp",
  suggestionId = 2,
): EditorState => {
  const pos = doc.tag[tagName];
  if (pos === undefined) {
    throw new Error(`Tag '${tagName}' not found in document`);
  }

  const backspaceStep = replaceStep(
    doc,
    pos,
    pos + 1,
    Slice.empty,
  ) as ReplaceStep | null;

  if (!backspaceStep) {
    throw new Error("Could not create backspace step");
  }

  const transaction = state.tr;
  suggestReplaceStep(transaction, state, doc, backspaceStep, [], suggestionId);
  return state.apply(transaction);
};

/**
 * Applies a forward delete step at a tagged position in the document.
 * This helper eliminates boilerplate for the common pattern of deleting at a position.
 *
 * @param doc - The document with a tag marking the delete position
 * @param state - The editor state
 * @param tagName - The tag name to delete at
 * @param suggestionId - The suggestion ID for this operation
 * @returns The new editor state after applying the delete
 */
export const applyDeleteAtTag = (
  doc: TaggedNode,
  state: EditorState,
  tagName: string,
  suggestionId = 2,
): EditorState => {
  const pos = doc.tag[tagName];
  if (pos === undefined) {
    throw new Error(`Tag '${tagName}' not found in document`);
  }

  const deleteStep = replaceStep(
    doc,
    pos - 1,
    pos,
    Slice.empty,
  ) as ReplaceStep | null;

  if (!deleteStep) {
    throw new Error("Could not create delete step");
  }

  const transaction = state.tr;
  suggestReplaceStep(transaction, state, doc, deleteStep, [], suggestionId);
  return state.apply(transaction);
};
