/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { EditorState } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { assert, describe, it } from "vitest";

import {
  type TaggedNode,
  testBuilders,
} from "../../../testing/testBuilders.js";
import { transformToSuggestionTransaction } from "../../../withSuggestChanges.js";

describe("Multi-Step Block Join Operations", () => {
  it("should handle normal replace step before block join", () => {
    // Starting doc has a previous split with ZWSPs marking the boundary
    // Transaction:
    //   Step 1: Replace text in Para1a
    //   Step 2: Delete at boundary to join Para1a | Para1b (removes ZWSPs)
    // Expected: Text replaced, blocks joined, no ZWSPs remain
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "test<a> para<b>graph<boundary>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        "second<c> paragraph",
      ),
    ) as TaggedNode;

    const tagA = doc.tag["a"];
    const tagB = doc.tag["b"];
    const tagBoundary = doc.tag["boundary"];
    const tagC = doc.tag["c"];
    assert(tagA !== undefined, "Tag 'a' not found");
    assert(tagB !== undefined, "Tag 'b' not found");
    assert(tagBoundary !== undefined, "Tag 'boundary' not found");
    assert(tagC !== undefined, "Tag 'c' not found");

    const editorState = EditorState.create({ doc });
    const tr = editorState.tr;

    // Step 1: Replace " para" with " MODIFIED"
    tr.replaceWith(tagA, tagB, testBuilders.schema.text(" MODIFIED"));

    // Step 2: Delete at the block boundary to join (delete the ZWSP)
    const mappedBoundary = tr.mapping.map(tagBoundary);
    tr.delete(mappedBoundary, mappedBoundary + 1);

    const suggestionTr = transformToSuggestionTransaction(tr, editorState);
    const finalState = editorState.apply(suggestionTr);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "test",
        testBuilders.deletion({ id: 2 }, " para"),
        testBuilders.insertion({ id: 2 }, " MODIFIED"),
        "graphsecond paragraph",
      ),
    );

    assert(
      eq(finalState.doc, expected),
      `Expected ${finalState.doc} to match ${expected}`,
    );
  });

  it("should handle normal replace step after block join", () => {
    // Starting doc has a previous split with ZWSPs marking the boundary
    // Transaction:
    //   Step 1: Delete at boundary to join Para1a | Para1b (removes ZWSPs)
    //   Step 2: Replace text in the joined paragraph
    // Expected: Blocks joined, text replaced, no ZWSPs remain
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "test<a> para<boundary>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        "graph<b> more<c>",
      ),
    ) as TaggedNode;

    const tagA = doc.tag["a"];
    const tagBoundary = doc.tag["boundary"];
    const tagB = doc.tag["b"];
    const tagC = doc.tag["c"];
    assert(tagA !== undefined, "Tag 'a' not found");
    assert(tagBoundary !== undefined, "Tag 'boundary' not found");
    assert(tagB !== undefined, "Tag 'b' not found");
    assert(tagC !== undefined, "Tag 'c' not found");

    const editorState = EditorState.create({ doc });
    const tr = editorState.tr;

    // Step 1: Delete at boundary to join (delete the ZWSP)
    tr.delete(tagBoundary, tagBoundary + 1);

    // Step 2: Replace " more" with " MODIFIED"
    const mappedTagB = tr.mapping.map(tagB);
    const mappedTagC = tr.mapping.map(tagC);
    tr.replaceWith(
      mappedTagB,
      mappedTagC,
      testBuilders.schema.text(" MODIFIED"),
    );

    const suggestionTr = transformToSuggestionTransaction(tr, editorState);
    const finalState = editorState.apply(suggestionTr);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "test paragraph",
        testBuilders.deletion({ id: 3 }, " more"),
        testBuilders.insertion({ id: 3 }, " MODIFIED"),
      ),
    );

    assert(
      eq(finalState.doc, expected),
      `Expected ${finalState.doc} to match ${expected}`,
    );
  });

  it("should handle two block splits and joins in one transaction", () => {
    // Starting doc has TWO previous splits with ZWSPs marking both boundaries
    // Transaction:
    //   Step 1: Delete at boundary A to join Para1a | Para1b (removes ZWSPs at A)
    //   Step 2: Delete at boundary B to join Para2a | Para2b (removes ZWSPs at B)
    // Expected: Both joins complete, all ZWSPs removed
    // This is the critical test for multi-step position mapping
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "paragraph<a><boundary1>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        " 1<b>",
      ),
      testBuilders.paragraph(
        "paragraph<c><boundary2>",
        testBuilders.insertion({ id: 2 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 2 }, "\u200B"),
        " 2<d>",
      ),
      testBuilders.paragraph("paragraph 3"),
    ) as TaggedNode;

    const tagA = doc.tag["a"];
    const tagBoundary1 = doc.tag["boundary1"];
    const tagB = doc.tag["b"];
    const tagC = doc.tag["c"];
    const tagBoundary2 = doc.tag["boundary2"];
    const tagD = doc.tag["d"];
    assert(tagA !== undefined, "Tag 'a' not found");
    assert(tagBoundary1 !== undefined, "Tag 'boundary1' not found");
    assert(tagB !== undefined, "Tag 'b' not found");
    assert(tagC !== undefined, "Tag 'c' not found");
    assert(tagBoundary2 !== undefined, "Tag 'boundary2' not found");
    assert(tagD !== undefined, "Tag 'd' not found");

    const editorState = EditorState.create({ doc });
    const tr = editorState.tr;

    // Step 1: Join Para1 blocks (delete at boundary1 - delete the ZWSP)
    tr.delete(tagBoundary1, tagBoundary1 + 1);

    // Step 2: Join Para2 blocks (delete at boundary2 - delete the ZWSP)
    const mappedBoundary2 = tr.mapping.map(tagBoundary2);
    tr.delete(mappedBoundary2, mappedBoundary2 + 1);

    const suggestionTr = transformToSuggestionTransaction(tr, editorState);
    const finalState = editorState.apply(suggestionTr);

    const expected = testBuilders.doc(
      testBuilders.paragraph("paragraph 1"),
      testBuilders.paragraph("paragraph 2"),
      testBuilders.paragraph("paragraph 3"),
    );

    assert(
      eq(finalState.doc, expected),
      `Expected ${finalState.doc} to match ${expected}`,
    );
  });

  it("should handle block split with intermediate text changes", () => {
    // Starting doc has a previous split with ZWSPs marking the boundary
    // Transaction:
    //   Step 1: Insert text in Para1b (second half)
    //   Step 2: Delete at boundary to join Para1a | Para1b (removes ZWSPs)
    // Expected: Blocks joined, inserted text preserved, no ZWSPs remain
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "test<a><boundary>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        "<b> paragraph<c>",
      ),
    ) as TaggedNode;

    const tagA = doc.tag["a"];
    const tagBoundary = doc.tag["boundary"];
    const tagB = doc.tag["b"];
    const tagC = doc.tag["c"];
    assert(tagA !== undefined, "Tag 'a' not found");
    assert(tagBoundary !== undefined, "Tag 'boundary' not found");
    assert(tagB !== undefined, "Tag 'b' not found");
    assert(tagC !== undefined, "Tag 'c' not found");

    const editorState = EditorState.create({ doc });
    const tr = editorState.tr;

    // Step 1: Insert text in Para1b
    tr.insertText("INSERTED ", tagB);

    // Step 2: Delete at boundary to join (delete the ZWSP)
    const mappedBoundary = tr.mapping.map(tagBoundary);
    tr.delete(mappedBoundary, mappedBoundary + 1);

    const suggestionTr = transformToSuggestionTransaction(tr, editorState);
    const finalState = editorState.apply(suggestionTr);

    // "INSERTED " gets marked with id:2 because it's from the join operation (step 2)
    // Content outside deletion range keeps its marks from the operation that touches it
    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "test",
        testBuilders.insertion({ id: 2 }, "INSERTED "),
        " paragraph",
      ),
    );

    assert(
      eq(finalState.doc, expected),
      `Expected:\n${JSON.stringify(expected.toJSON(), null, 2)}\n\nActual:\n${JSON.stringify(finalState.doc.toJSON(), null, 2)}`,
    );
  });

  it("should handle nested block operations", () => {
    // Starting doc has NESTED previous splits:
    //   - Para1 was split into Para1a | Para1b (ZWSPs with id:1)
    //   - Para1b was then split into Para1b1 | Para1b2 (ZWSPs with id:2)
    // Transaction:
    //   Step 1: Join Para1b1 | Para1b2 (removes ZWSPs with id:2)
    //   Step 2: Join Para1a | Para1b (removes ZWSPs with id:1)
    // Expected: Nested joins work, proper position mapping, all ZWSPs removed
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "test<a><boundary1>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        " para<b><boundary2>",
        testBuilders.insertion({ id: 2 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 2 }, "\u200B"),
        "graph<c>",
      ),
    ) as TaggedNode;

    const tagA = doc.tag["a"];
    const tagBoundary1 = doc.tag["boundary1"];
    const tagB = doc.tag["b"];
    const tagBoundary2 = doc.tag["boundary2"];
    const tagC = doc.tag["c"];
    assert(tagA !== undefined, "Tag 'a' not found");
    assert(tagBoundary1 !== undefined, "Tag 'boundary1' not found");
    assert(tagB !== undefined, "Tag 'b' not found");
    assert(tagBoundary2 !== undefined, "Tag 'boundary2' not found");
    assert(tagC !== undefined, "Tag 'c' not found");

    const editorState = EditorState.create({ doc });
    const tr = editorState.tr;

    // Step 1: Join the nested split first (Para1b1 | Para1b2) - delete at boundary2
    tr.delete(tagBoundary2, tagBoundary2 + 1);

    // Step 2: Join the outer split (Para1a | Para1b) - delete at boundary1
    const mappedBoundary1 = tr.mapping.map(tagBoundary1);
    tr.delete(mappedBoundary1, mappedBoundary1 + 1);

    const suggestionTr = transformToSuggestionTransaction(tr, editorState);
    const finalState = editorState.apply(suggestionTr);

    const expected = testBuilders.doc(testBuilders.paragraph("test paragraph"));

    assert(
      eq(finalState.doc, expected),
      `Expected ${finalState.doc} to match ${expected}`,
    );
  });

  it("should handle multiple parallel block operations with text changes", () => {
    // Starting doc has TWO previous splits with ZWSPs:
    //   - Para1 was split (ZWSPs with id:1)
    //   - Para3 was split (ZWSPs with id:2)
    // Transaction:
    //   Step 1: Replace text in Para2 (between the two splits)
    //   Step 2: Join Para1 blocks (removes ZWSPs with id:1)
    //   Step 3: Join Para3 blocks (removes ZWSPs with id:2)
    // Expected: Independent operations don't interfere, all ZWSPs removed
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "paragraph<a><boundary1>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        " 1<b>",
      ),
      testBuilders.paragraph("paragraph<c> 2<d>"),
      testBuilders.paragraph(
        "paragraph<e><boundary2>",
        testBuilders.insertion({ id: 2 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 2 }, "\u200B"),
        " 3<f>",
      ),
    ) as TaggedNode;

    const tagBoundary1 = doc.tag["boundary1"];
    const tagB = doc.tag["b"];
    const tagC = doc.tag["c"];
    const tagD = doc.tag["d"];
    const tagBoundary2 = doc.tag["boundary2"];
    const tagF = doc.tag["f"];
    assert(tagBoundary1 !== undefined, "Tag 'boundary1' not found");
    assert(tagB !== undefined, "Tag 'b' not found");
    assert(tagC !== undefined, "Tag 'c' not found");
    assert(tagD !== undefined, "Tag 'd' not found");
    assert(tagBoundary2 !== undefined, "Tag 'boundary2' not found");
    assert(tagF !== undefined, "Tag 'f' not found");

    const editorState = EditorState.create({ doc });
    const tr = editorState.tr;

    // Step 1: Replace text in Para2 (between the two splits)
    tr.replaceWith(tagC, tagD, testBuilders.schema.text(" MODIFIED"));

    // Step 2: Join Para1 blocks (delete at boundary1)
    const mappedBoundary1 = tr.mapping.map(tagBoundary1);
    tr.delete(mappedBoundary1, mappedBoundary1 + 1);

    // Step 3: Join Para3 blocks (delete at boundary2)
    const mappedBoundary2 = tr.mapping.map(tagBoundary2);
    tr.delete(mappedBoundary2, mappedBoundary2 + 1);

    const suggestionTr = transformToSuggestionTransaction(tr, editorState);
    const finalState = editorState.apply(suggestionTr);

    const expected = testBuilders.doc(
      testBuilders.paragraph("paragraph 1"),
      testBuilders.paragraph(
        "paragraph",
        testBuilders.deletion({ id: 3 }, " 2"),
        testBuilders.insertion({ id: 3 }, " MODIFIED"),
      ),
      testBuilders.paragraph("paragraph 3"),
    );

    assert(
      eq(finalState.doc, expected),
      `Expected ${finalState.doc} to match ${expected}`,
    );
  });

  it("should handle deletions before and after block join", () => {
    // Starting doc has a previous split with ZWSPs marking the boundary
    // Transaction:
    //   Step 1: Delete text in Para1a (first half)
    //   Step 2: Delete at boundary to join Para1a | Para1b (removes ZWSPs)
    //   Step 3: Delete text in Para1b (second half, now joined)
    // Expected: All deletions tracked, blocks joined, no ZWSPs remain
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "first <a>remove-a<a2> paragraph<b>",
        testBuilders.insertion({ id: 1 }, "\u200B"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "\u200B"),
        "<c>second <d>remove-d<d2> paragraph",
      ),
    ) as TaggedNode;

    const tagA = doc.tag["a"];
    const tagA2 = doc.tag["a2"];
    const tagB = doc.tag["b"];
    const tagC = doc.tag["c"];
    const tagD = doc.tag["d"];
    const tagD2 = doc.tag["d2"];
    assert(tagA !== undefined, "Tag 'a' not found");
    assert(tagA2 !== undefined, "Tag 'a2' not found");
    assert(tagB !== undefined, "Tag 'b' not found");
    assert(tagC !== undefined, "Tag 'c' not found");
    assert(tagD !== undefined, "Tag 'd' not found");
    assert(tagD2 !== undefined, "Tag 'd2' not found");

    const editorState = EditorState.create({ doc });
    const tr = editorState.tr;

    // Step 1: Delete "remove-a" in first paragraph
    tr.replace(tagA, tagA2);

    // Step 2: Delete at boundary to join (delete the ZWSP)
    const mappedTagB = tr.mapping.map(tagB);
    tr.replace(mappedTagB, mappedTagB + 1);

    // Step 3: Delete "remove-d" in second paragraph (now joined)
    const mappedTagD = tr.mapping.map(tagD);
    const mappedTagD2 = tr.mapping.map(tagD2);
    tr.replace(mappedTagD, mappedTagD2);

    const suggestionTr = transformToSuggestionTransaction(tr, editorState);
    const finalState = editorState.apply(suggestionTr);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.deletion({ id: 2 }, "remove-a"),
        " paragraphsecond ",
        testBuilders.deletion({ id: 4 }, "remove-d"),
        " paragraph",
      ),
    );

    assert(
      eq(finalState.doc, expected),
      `Expected:\n${JSON.stringify(expected.toJSON(), null, 2)}\n\nActual:\n${JSON.stringify(finalState.doc.toJSON(), null, 2)}`,
    );
  });
});
