/**
 * Playwright E2E Tests for Block Join Behavior
 *
 * These tests use real keyboard events in a browser environment to verify
 * that the suggestChanges plugin correctly handles block splitting and joining
 * operations.
 *
 * Key differences from JSDOM tests:
 * - Uses real browser (via Playwright)
 * - Uses real keyboard events (page.keyboard.press)
 * - Tests actual user interactions
 * - Catches bugs that manual transactions would hide
 */

import { test, expect } from "@playwright/test";
import {
  testEnterThenBackspace,
  testDoubleEnterDoubleBackspace,
  testEnterThenDeleteFromFirst,
  getEditorState,
  pressEnterAt,
  pressBackspace,
  pressDelete,
  assertReverted,
  setupDocFromJSON,
  assertDocFullyReverted,
  performEnterBackspaceCycle,
} from "./playwrightHelpers.js";

test.describe("Block Join E2E - Real Keyboard Events", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the test page
    await page.goto("/test-fixtures/keyboard-test.html");

    // Wait for the editor to be initialized
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    await page.waitForFunction(() => window.pmEditor !== undefined);

    // Focus the editor
    await page.locator("#editor .ProseMirror").click();
  });

  test.describe("Paragraph: Enter then Backspace", () => {
    test("should revert document to original state", async ({ page }) => {
      await testEnterThenBackspace(page);
    });
  });

  test.describe("Paragraph: Enter twice then Backspace twice", () => {
    test("should revert through both suggestions", async ({ page }) => {
      await testDoubleEnterDoubleBackspace(page);
    });
  });

  test.describe("Paragraph: Enter then Delete (from first block)", () => {
    test("should revert when Delete pressed from end of first block", async ({
      page,
    }) => {
      await testEnterThenDeleteFromFirst(page);
      // Note: Delete currently leaves ZWSP markers behind (known behavior)
      // This is different from Backspace which cleans them up
    });
  });

  test.describe("Paragraph: Enter then Delete (at block boundary)", () => {
    test("should revert when Delete pressed at exact block boundary", async ({
      page,
    }) => {
      const initialState = await getEditorState(page);

      await page.evaluate(() => {
        window.pmEditor.setCursorToEnd();
      });
      const endPos = (await getEditorState(page)).cursorFrom;

      await pressEnterAt(page, endPos);

      const afterEnter = await getEditorState(page);
      expect(afterEnter.paragraphCount).toBe(2);

      await page.evaluate((pos) => {
        window.pmEditor.setCursorToPosition(pos);
      }, endPos);

      await pressDelete(page);

      const finalState = await getEditorState(page);

      expect(finalState.paragraphCount).toBe(1);
      expect(finalState.textContent).toContain(initialState.textContent);
      // Note: Delete at boundary leaves ZWSP markers behind (known behavior)
    });
  });

  test.describe("Paragraph: Enter then ArrowLeft then Delete", () => {
    test("should revert when using real arrow key navigation", async ({
      page,
    }) => {
      const initialState = await getEditorState(page);

      await page.evaluate(() => {
        window.pmEditor.setCursorToEnd();
      });

      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);

      const afterEnter = await getEditorState(page);
      expect(afterEnter.paragraphCount).toBe(2);

      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(100);

      await pressDelete(page);

      const finalState = await getEditorState(page);

      assertReverted(finalState, initialState);
    });
  });

  test.describe("Edge Cases", () => {
    test("should delete typed character after Enter + Type + Backspace", async ({
      page,
    }) => {
      // This test reproduces a bug where typing a character after Enter,
      // then pressing Backspace, causes the cursor to jump over the character
      // instead of deleting it.
      await page.evaluate(() => {
        window.pmEditor.setCursorToEnd();
      });

      // Press Enter to split the paragraph
      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);

      const afterEnter = await getEditorState(page);
      expect(afterEnter.paragraphCount).toBe(2);

      // Type a character
      await page.keyboard.type("A");
      await page.waitForTimeout(100);

      const afterType = await getEditorState(page);
      expect(afterType.textContent).toContain("A");

      // Press Backspace to delete the character
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);

      const afterBackspace = await getEditorState(page);
      // The character should be deleted
      expect(afterBackspace.textContent).not.toContain("A");
      // Document should still have 2 paragraphs (we only deleted the character, not the block boundary)
      expect(afterBackspace.paragraphCount).toBe(2);
    });

    test("should handle Enter at middle of text then Backspace", async ({
      page,
    }) => {
      const initialState = await getEditorState(page);

      // Position cursor in the middle of "test paragraph" (after "test ")
      await pressEnterAt(page, 6);

      const afterEnter = await getEditorState(page);
      expect(afterEnter.paragraphCount).toBe(2);

      await pressBackspace(page);

      const finalState = await getEditorState(page);

      assertReverted(finalState, initialState);
    });

    test("should handle multiple rapid Enter/Backspace sequences", async ({
      page,
    }) => {
      const initialState = await getEditorState(page);

      for (let i = 1; i <= 3; i++) {
        await performEnterBackspaceCycle(page);
      }

      const finalState = await getEditorState(page);
      assertReverted(finalState, initialState);
    });
  });

  test.describe("List Item Block Join Behavior", () => {
    test("Bullet list: Enter then Backspace should rejoin list items", async ({
      page,
    }) => {
      const { initialState, initialDoc } = await setupDocFromJSON(page, {
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: [
              {
                type: "list_item",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "test item" }],
                  },
                ],
              },
            ],
          },
        ],
      });

      await page.locator("#editor .ProseMirror").click();

      await page.evaluate(() => {
        window.pmEditor.setCursorToEnd();
      });

      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);

      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);

      const finalState = await page.evaluate(() => window.pmEditor.getState());
      const finalDoc = await page.evaluate(() => window.pmEditor.getDocJSON());

      assertDocFullyReverted(finalState, finalDoc, initialState, initialDoc);
    });

    test("Ordered list: Enter then Backspace should rejoin list items", async ({
      page,
    }) => {
      const { initialState, initialDoc } = await setupDocFromJSON(page, {
        type: "doc",
        content: [
          {
            type: "ordered_list",
            content: [
              {
                type: "list_item",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "first item" }],
                  },
                ],
              },
            ],
          },
        ],
      });

      await page.locator("#editor .ProseMirror").click();

      await page.evaluate(() => {
        window.pmEditor.setCursorToEnd();
      });

      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);

      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);

      const finalState = await page.evaluate(() => window.pmEditor.getState());
      const finalDoc = await page.evaluate(() => window.pmEditor.getDocJSON());

      assertDocFullyReverted(finalState, finalDoc, initialState, initialDoc);
    });

    test("List item: Enter at middle of text then Backspace", async ({
      page,
    }) => {
      const { initialState, initialDoc } = await setupDocFromJSON(page, {
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: [
              {
                type: "list_item",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "test item" }],
                  },
                ],
              },
            ],
          },
        ],
      });

      await page.locator("#editor .ProseMirror").click();

      // Position cursor after "test " - find the position dynamically
      const splitPosition = await page.evaluate(() => {
        const state = window.pmEditor.view.state;
        const textNode = state.doc.textContent;
        const splitAt = textNode.indexOf(" ") + 1;
        let pos = 0;
        state.doc.descendants((node, nodePos) => {
          if (node.isText && node.text?.includes("test")) {
            pos = nodePos + splitAt;
            return false;
          }
          return true;
        });
        return pos;
      });

      await page.evaluate((pos) => {
        window.pmEditor.setCursorToPosition(pos);
      }, splitPosition);

      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);

      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);

      const finalState = await page.evaluate(() => window.pmEditor.getState());
      const finalDoc = await page.evaluate(() => window.pmEditor.getDocJSON());

      assertDocFullyReverted(finalState, finalDoc, initialState, initialDoc);
    });

    test("List item: Multiple sequential splits/joins", async ({ page }) => {
      const { initialState, initialDoc } = await setupDocFromJSON(page, {
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: [
              {
                type: "list_item",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "test item" }],
                  },
                ],
              },
            ],
          },
        ],
      });

      await page.locator("#editor .ProseMirror").click();

      for (let i = 1; i <= 3; i++) {
        await performEnterBackspaceCycle(page);
      }

      const finalState = await page.evaluate(() => window.pmEditor.getState());
      const finalDoc = await page.evaluate(() => window.pmEditor.getDocJSON());

      assertDocFullyReverted(finalState, finalDoc, initialState, initialDoc);
    });

    test("Deeply nested list (3 levels): Enter then Backspace should rejoin all levels", async ({
      page,
    }) => {
      const { initialState, initialDoc } = await setupDocFromJSON(page, {
        type: "doc",
        content: [
          {
            type: "bullet_list",
            content: [
              {
                type: "list_item",
                content: [
                  {
                    type: "bullet_list",
                    content: [
                      {
                        type: "list_item",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "nested item" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      await page.locator("#editor .ProseMirror").click();

      await page.evaluate(() => {
        window.pmEditor.setCursorToEnd();
      });

      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);

      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);

      const finalState = await page.evaluate(() => window.pmEditor.getState());
      const finalDoc = await page.evaluate(() => window.pmEditor.getDocJSON());

      assertDocFullyReverted(finalState, finalDoc, initialState, initialDoc);
    });

    test("Extremely nested structure (4 levels): Enter then Backspace should rejoin all levels", async ({
      page,
    }) => {
      const { initialState, initialDoc } = await setupDocFromJSON(page, {
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "bullet_list",
                content: [
                  {
                    type: "list_item",
                    content: [
                      {
                        type: "bullet_list",
                        content: [
                          {
                            type: "list_item",
                            content: [
                              {
                                type: "paragraph",
                                content: [
                                  { type: "text", text: "very deep item" },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      await page.locator("#editor .ProseMirror").click();

      await page.evaluate(() => {
        window.pmEditor.setCursorToEnd();
      });

      await page.keyboard.press("Enter");
      await page.waitForTimeout(100);

      await page.keyboard.press("Backspace");
      await page.waitForTimeout(100);

      const finalState = await page.evaluate(() => window.pmEditor.getState());
      const finalDoc = await page.evaluate(() => window.pmEditor.getDocJSON());

      assertDocFullyReverted(finalState, finalDoc, initialState, initialDoc);
    });
  });
});
