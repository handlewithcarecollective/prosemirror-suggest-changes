/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { EditorState } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { assert, describe, it } from "vitest";

import {
  applySuggestion,
  applySuggestions,
  revertSuggestion,
  revertSuggestions,
} from "../commands.js";

import { testBuilders } from "../testing/testBuilders.js";

describe("applyTrackedChanges", () => {
  it("should apply all tracked changes in the doc", async () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "fir",
        testBuilders.deletion({ id: 1 }, "st"),
        testBuilders.insertion({ id: 1 }, "e"),
        " paragraph",
      ),
      testBuilders.modification(
        {
          id: 3,
          type: "attr",
          attrName: "src",
          previousValue: "https://dskrpt.de/test-image",
          newValue: "https://dskrpt.de/test-image-2",
        },
        testBuilders.image({ src: "https://dskrpt.de/test-image-2" }),
      ),
      testBuilders.paragraph(
        "sec",
        testBuilders.deletion({ id: 2 }, "ond"),
        testBuilders.insertion({ id: 2 }, "undo"),
        " paragraph",
      ),
      testBuilders.modification(
        {
          id: 4,
          type: "nodeType",
          previousValue: "paragraph",
          newValue: "heading",
        },
        testBuilders.modification(
          {
            id: 4,
            type: "attr",
            attrName: "level",
            previousValue: 1,
            newValue: 2,
          },
          testBuilders.heading({ level: 2 }, "third paragraph"),
        ),
      ),
    );

    const editorState = EditorState.create({
      doc,
    });

    const newState = await new Promise<EditorState>((resolve) => {
      applySuggestions(editorState, (tr) => {
        resolve(editorState.apply(tr));
      });
    });

    const expected = testBuilders.doc(
      testBuilders.paragraph("fire paragraph"),
      testBuilders.image({ src: "https://dskrpt.de/test-image-2" }),
      testBuilders.paragraph("secundo paragraph"),
      testBuilders.heading({ level: 2 }, "third paragraph"),
    );

    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("should treat deletions across boundaries as a single deletion", async () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.deletion({ id: 1 }, "paragraph"),
      ),
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, "second "),
        "paragraph",
      ),
    );

    const editorState = EditorState.create({
      doc,
    });

    const newState = await new Promise<EditorState>((resolve) => {
      applySuggestions(editorState, (tr) => {
        resolve(editorState.apply(tr));
      });
    });

    const expected = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
    );

    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });
});

describe("applyTrackedChange", () => {
  it("should apply specified tracked change", async () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "fir",
        testBuilders.deletion({ id: 1 }, "st"),
        testBuilders.insertion({ id: 1 }, "e"),
        " paragraph",
      ),
      testBuilders.paragraph(
        "sec",
        testBuilders.deletion({ id: 2 }, "ond"),
        testBuilders.insertion({ id: 2 }, "undo"),
        " paragraph",
      ),
    );

    const editorState = EditorState.create({
      doc,
    });

    const newState = await new Promise<EditorState>((resolve) => {
      applySuggestion(1)(editorState, (tr) => {
        resolve(editorState.apply(tr));
      });
    });

    const expected = testBuilders.doc(
      testBuilders.paragraph("fire paragraph"),
      testBuilders.paragraph(
        "sec",
        testBuilders.deletion({ id: 2 }, "ond"),
        testBuilders.insertion({ id: 2 }, "undo"),
        " paragraph",
      ),
    );

    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });
});

describe("revertTrackedChanges", () => {
  it("should revert all tracked changes in the doc", async () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "fir",
        testBuilders.deletion({ id: 1 }, "st"),
        testBuilders.insertion({ id: 1 }, "e"),
        " paragraph",
      ),
      testBuilders.modification(
        {
          id: 3,
          type: "attr",
          attrName: "src",
          previousValue: "https://dskrpt.de/test-image",
          newValue: "https://dskrpt.de/test-image-2",
        },
        testBuilders.image({ src: "https://dskrpt.de/test-image-2" }),
      ),
      testBuilders.paragraph(
        "sec",
        testBuilders.deletion({ id: 2 }, "ond"),
        testBuilders.insertion({ id: 2 }, "undo"),
        " paragraph",
      ),
      testBuilders.modification(
        {
          id: 4,
          type: "nodeType",
          previousValue: "paragraph",
          newValue: "heading",
        },
        testBuilders.modification(
          {
            id: 4,
            type: "attr",
            attrName: "level",
            previousValue: 1,
            newValue: 2,
          },
          testBuilders.heading({ level: 2 }, "third paragraph"),
        ),
      ),
    );

    const editorState = EditorState.create({
      doc,
    });

    const newState = await new Promise<EditorState>((resolve) => {
      revertSuggestions(editorState, (tr) => {
        resolve(editorState.apply(tr));
      });
    });

    const expected = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.image({ src: "https://dskrpt.de/test-image" }),
      testBuilders.paragraph("second paragraph"),
      testBuilders.paragraph("third paragraph"),
    );

    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });

  it("should treat insertions across boundaries as a single insertion", async () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "first ",
        testBuilders.insertion({ id: 1 }, "paragraph"),
      ),
      testBuilders.paragraph(
        testBuilders.insertion({ id: 1 }, "second "),
        "paragraph",
      ),
    );

    const editorState = EditorState.create({
      doc,
    });

    const newState = await new Promise<EditorState>((resolve) => {
      revertSuggestions(editorState, (tr) => {
        resolve(editorState.apply(tr));
      });
    });

    const expected = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
    );

    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });
});

describe("revertTrackedChange", () => {
  it("should revert specified tracked change", async () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        "fir",
        testBuilders.deletion({ id: 1 }, "st"),
        testBuilders.insertion({ id: 1 }, "e"),
        " paragraph",
      ),
      testBuilders.paragraph(
        "sec",
        testBuilders.deletion({ id: 2 }, "ond"),
        testBuilders.insertion({ id: 2 }, "undo"),
        " paragraph",
      ),
    );

    const editorState = EditorState.create({
      doc,
    });

    const newState = await new Promise<EditorState>((resolve) => {
      revertSuggestion(1)(editorState, (tr) => {
        resolve(editorState.apply(tr));
      });
    });

    const expected = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.paragraph(
        "sec",
        testBuilders.deletion({ id: 2 }, "ond"),
        testBuilders.insertion({ id: 2 }, "undo"),
        " paragraph",
      ),
    );

    assert(
      eq(newState.doc, expected),
      `Expected ${newState.doc} to match ${expected}`,
    );
  });
});
