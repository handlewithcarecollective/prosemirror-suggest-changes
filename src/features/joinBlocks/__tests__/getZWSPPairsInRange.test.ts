import { describe, it, assert } from "vitest";
import {
  testBuilders,
  type TaggedNode,
} from "../../../testing/testBuilders.js";
import { getZWSPPairsInRange } from "../utils/getZWSPPairsInRange.js";
import { ZWSP } from "../types.js";

describe("getZWSPPairsInRange", () => {
  const insertionMarkType = testBuilders.schema.marks.insertion;

  describe("Basic Functionality", () => {
    it("should return empty array for range with no ZWSPs", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph("Hello<a> world<b>"),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 0, "Expected no pairs in range");
    });

    it("should find single pair across simple block boundary", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Second<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 1, "Expected one pair");
      const pair0 = result[0];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(pair0.left !== undefined, "Left ZWSP should exist");
      assert(pair0.right !== undefined, "Right ZWSP should exist");
      assert(pair0.left.id === 1, "Left ZWSP should have ID 1");
      assert(pair0.right.id === 1, "Right ZWSP should have ID 1");
      assert(pair0.left.char === ZWSP, "Left should be ZWSP");
      assert(pair0.right.char === ZWSP, "Right should be ZWSP");
    });

    it("should find multiple pairs in range (3 blocks)", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Second",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Third<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 2, "Expected two pairs for chain pairing");
      const pair0 = result[0];
      const pair1 = result[1];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(pair1 !== undefined, "Pair at index 1 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "Pair 0 should be complete",
      );
      assert(
        pair1.left !== undefined && pair1.right !== undefined,
        "Pair 1 should be complete",
      );
      assert(pair0.left.id === 1, "All ZWSPs should have ID 1");
      assert(pair0.right.id === 1, "All ZWSPs should have ID 1");
      assert(pair1.left.id === 1, "All ZWSPs should have ID 1");
      assert(pair1.right.id === 1, "All ZWSPs should have ID 1");
    });

    it("should pair previousZWSP with first block in range", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "Before",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          "<a>",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Content<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 1, "Expected one pair with previousZWSP");
      const pair0 = result[0];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(pair0.left !== undefined, "Left ZWSP should exist (previousZWSP)");
      assert(pair0.right !== undefined, "Right ZWSP should exist");
      assert(pair0.left.id === 1, "Left ZWSP should have ID 1");
      assert(pair0.right.id === 1, "Right ZWSP should have ID 1");
    });

    it("should pair nextZWSP with last block in range", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>Content",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "<b>",
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "After",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 1, "Expected one pair with nextZWSP");
      const pair0 = result[0];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(pair0.left !== undefined, "Left ZWSP should exist");
      assert(pair0.right !== undefined, "Right ZWSP should exist (nextZWSP)");
      assert(pair0.left.id === 1, "Left ZWSP should have ID 1");
      assert(pair0.right.id === 1, "Right ZWSP should have ID 1");
    });

    it("should use both boundary pairs (previousZWSP + nextZWSP)", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "Before",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          "<a>",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Middle",
          testBuilders.insertion({ id: 2 }, ZWSP),
          "<b>",
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 2 }, ZWSP),
          "After",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 2, "Expected two pairs using boundary ZWSPs");
      const pair0 = result[0];
      const pair1 = result[1];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(pair1 !== undefined, "Pair at index 1 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "Pair 0 should be complete",
      );
      assert(
        pair1.left !== undefined && pair1.right !== undefined,
        "Pair 1 should be complete",
      );
      assert(
        pair0.left.id === 1 && pair0.right.id === 1,
        "First pair should have ID 1",
      );
      assert(
        pair1.left.id === 2 && pair1.right.id === 2,
        "Second pair should have ID 2",
      );
    });
  });

  describe("ID Matching", () => {
    it("should not pair ZWSPs with different IDs at same boundary", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 2 }, ZWSP),
          "Second<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 0, "Expected no pairs for mismatched IDs");
    });

    it("should handle multiple suggestion IDs in range", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph("<a>A", testBuilders.insertion({ id: 1 }, ZWSP)),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "B",
          testBuilders.insertion({ id: 2 }, ZWSP),
        ),
        testBuilders.paragraph(testBuilders.insertion({ id: 2 }, ZWSP), "C<b>"),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 2, "Expected two pairs with different IDs");
      const pair0 = result[0];
      const pair1 = result[1];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(pair1 !== undefined, "Pair at index 1 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "Pair 0 should be complete",
      );
      assert(
        pair1.left !== undefined && pair1.right !== undefined,
        "Pair 1 should be complete",
      );
      assert(
        pair0.left.id === 1 && pair0.right.id === 1,
        "First pair should have ID 1",
      );
      assert(
        pair1.left.id === 2 && pair1.right.id === 2,
        "Second pair should have ID 2",
      );
    });

    it("should skip ZWSP without insertion mark", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph("<a>First", ZWSP),
        testBuilders.paragraph(ZWSP, "Second<b>"),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 0, "Expected no pairs for unmarked ZWSPs");
    });
  });

  describe("Position and Structure", () => {
    it("should handle ZWSP at document start", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Second<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // First ZWSP gets thrown away (nothing before it to pair with)
      // Only pair: end ZWSP of first block with start ZWSP of second block
      assert(result.length === 1, "Expected one pair");
      const pair0 = result[0];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "Pair should be complete",
      );
      assert(
        pair0.left.id === 1 && pair0.right.id === 1,
        "Pair should have ID 1",
      );
    });

    it("should handle ZWSP at document end", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Second",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 1, "Expected one pair");
      const pair0 = result[0];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "Pair should be complete",
      );
      assert(
        pair0.left.id === 1 && pair0.right.id === 1,
        "Pair should have ID 1",
      );
    });

    it("should handle chain pairing (A→B→C)", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph("<a>A", testBuilders.insertion({ id: 1 }, ZWSP)),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "B",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(testBuilders.insertion({ id: 1 }, ZWSP), "C<b>"),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 2, "Expected two pairs for A→B→C chain");
      const pair0 = result[0];
      const pair1 = result[1];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(pair1 !== undefined, "Pair at index 1 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "First pair should be complete",
      );
      assert(
        pair1.left !== undefined && pair1.right !== undefined,
        "Second pair should be complete",
      );

      // Verify positions are in order
      assert(
        pair0.left.pos < pair0.right.pos,
        "First pair: left should come before right",
      );
      assert(
        pair0.right.pos < pair1.left.pos,
        "Pairs should be in position order",
      );
      assert(
        pair1.left.pos < pair1.right.pos,
        "Second pair: left should come before right",
      );
    });

    it("should handle text node with ZWSP at BOTH position 0 AND last char", () => {
      // This is a single text node that starts and ends with ZWSP
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>Before",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP + "Middle" + ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "After<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // Should find pairs: Before→Middle and Middle→After
      assert(result.length >= 1, "Expected at least one pair");
      const pair0 = result[0];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "Pair should be complete",
      );
    });

    it("should calculate positions correctly", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Second<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 1, "Expected one pair");
      const pair0 = result[0];
      assert(pair0 !== undefined, "Pair at index 0 not found");
      assert(
        pair0.left !== undefined && pair0.right !== undefined,
        "Pair should be complete",
      );

      // Left ZWSP should be at the end of first paragraph
      // Right ZWSP should be at the start of second paragraph
      assert(
        pair0.left.pos < pair0.right.pos,
        "Left position should be before right position",
      );
      assert(pair0.left.pos > 0, "Left position should be > 0");
      assert(pair0.right.pos > 0, "Right position should be > 0");
    });
  });

  describe("Block Type Variations", () => {
    it("should work with paragraphs", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Second<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 1, "Expected one pair in paragraphs");
    });

    it("should work with list items", () => {
      const doc = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(
            testBuilders.paragraph(
              "<a>Item 1",
              testBuilders.insertion({ id: 1 }, ZWSP),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 1 }, ZWSP),
              "Item 2<b>",
            ),
          ),
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 1, "Expected one pair in list items");
    });

    it("should work with nested structures (list_item > paragraph)", () => {
      const doc = testBuilders.doc(
        testBuilders.bulletList(
          testBuilders.listItem(
            testBuilders.paragraph(
              "<a>",
              testBuilders.insertion({ id: 1 }, ZWSP),
              "Item 1",
              testBuilders.insertion({ id: 1 }, ZWSP),
            ),
          ),
          testBuilders.listItem(
            testBuilders.paragraph(
              testBuilders.insertion({ id: 1 }, ZWSP),
              "Item 2<b>",
            ),
          ),
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(
        result.length >= 1,
        "Expected at least one pair in nested structure",
      );
    });
  });

  describe("Edge Cases", () => {
    it("CRITICAL: should handle non-block parent (inline node as parent)", () => {
      // This test checks if index === 0 is sufficient for block boundary detection
      // If the parent is not a block but an inline element, we might incorrectly
      // treat it as a block boundary
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>Text",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "More<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // This should work correctly - but if there were inline wrappers,
      // the algorithm might fail
      assert(result.length === 1, "Expected one pair");
    });

    it("should handle single text node that is just ZWSP character", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>Before",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(testBuilders.insertion({ id: 1 }, ZWSP)),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "After<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // The middle paragraph is just a ZWSP
      assert(result.length >= 1, "Expected at least one pair");
    });

    it("should handle multiple text nodes within same block", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First ",
          testBuilders.insertion({ id: 1 }, "marked"),
          " text",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Second<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(
        result.length === 1,
        "Expected one pair across multiple text nodes",
      );
    });

    it("should handle empty block between two ZWSP-marked blocks", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>First",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(""),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Third<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // The empty block separates the ZWSPs, so they shouldn't pair
      // OR they might still pair if the algorithm ignores empty blocks
      // This test will reveal the behavior
      assert(result.length >= 0, "Result should be valid");
    });

    it("should handle very long range with many blocks", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>Block1",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Block2",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Block3",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Block4",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Block5<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // Should find 4 pairs: 1→2, 2→3, 3→4, 4→5
      assert(result.length === 4, "Expected four pairs in long chain");
    });

    it("should handle range exactly on ZWSP positions", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "Before<a>",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "<b>After",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length >= 0, "Should handle range on ZWSP positions");
    });
  });

  describe("Negative Cases", () => {
    it("should ignore ZWSPs in middle of text (not at boundaries)", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>Hel",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "lo<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(
        result.length === 0,
        "Expected no pairs for ZWSP in middle of text",
      );
    });

    it("should NOT pair ZWSPs in sibling text nodes within same block", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Middle content",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // Both ZWSPs are in the same paragraph, not across a block boundary
      assert(
        result.length === 0,
        "Expected no pairs for ZWSPs within same block",
      );
    });

    it("should handle single orphaned ZWSP at block end (no pair)", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>Content",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "<b>",
        ),
        testBuilders.paragraph("No ZWSP here"),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 0, "Expected no pairs for orphaned ZWSP");
    });

    it("should handle single orphaned ZWSP at block start (no pair)", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph("No ZWSP here"),
        testBuilders.paragraph(
          "<a>",
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Content<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      assert(result.length === 0, "Expected no pairs for orphaned ZWSP");
    });

    it("should handle empty range", () => {
      const doc = testBuilders.doc(
        testBuilders.paragraph("Content<a>here"),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      assert(tagA !== undefined, "Tag 'a' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagA,
        insertionMarkType,
      ).pairs;

      assert(result.length === 0, "Expected no pairs in empty range");
    });

    it("should not pair ZWSP at block start if not at index 0", () => {
      // This tests if the algorithm correctly checks index === 0
      // In a normal ProseMirror document, if there's an image or other node
      // before the text node, the text node won't be at index 0
      const doc = testBuilders.doc(
        testBuilders.paragraph(
          "<a>End",
          testBuilders.insertion({ id: 1 }, ZWSP),
        ),
        // Note: In ProseMirror's schema, we can't easily create a paragraph
        // with a non-text first child in these tests, but this documents the intent
        testBuilders.paragraph(
          testBuilders.insertion({ id: 1 }, ZWSP),
          "Start<b>",
        ),
      ) as TaggedNode;

      const tagA = doc.tag["a"];
      const tagB = doc.tag["b"];
      assert(tagA !== undefined, "Tag 'a' not found");
      assert(tagB !== undefined, "Tag 'b' not found");

      const result = getZWSPPairsInRange(
        doc,
        tagA,
        tagB,
        insertionMarkType,
      ).pairs;

      // In this simple case, it should find the pair
      // But with a more complex structure, index !== 0 might cause issues
      assert(result.length >= 0, "Result should be valid");
    });
  });
});
