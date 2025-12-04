/**
 * Helper functions for Playwright E2E tests.
 * These helpers reduce test duplication while keeping actual keyboard events.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export interface EditorState {
  paragraphCount: number;
  textContent: string;
  cursorFrom: number;
  cursorTo: number;
  blockCount?: number;
}

/**
 * Common test pattern: Enter then Backspace
 */
export async function testEnterThenBackspace(page: Page) {
  const initialState = await page.evaluate(() => window.pmEditor.getState());

  await page.evaluate(() => {
    window.pmEditor.setCursorToEnd();
  });

  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);

  const afterEnterState = await page.evaluate(() => window.pmEditor.getState());
  expect(afterEnterState.paragraphCount).toBe(2);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);

  const finalState = await page.evaluate(() => window.pmEditor.getState());

  expect(finalState.paragraphCount).toBe(1);
  expect(finalState.textContent).toBe(initialState.textContent);

  return { initialState, afterEnterState, finalState };
}

/**
 * Common test pattern: Enter twice then Backspace twice
 */
export async function testDoubleEnterDoubleBackspace(page: Page) {
  const initialState = await page.evaluate(() => window.pmEditor.getState());

  await page.evaluate(() => {
    window.pmEditor.setCursorToEnd();
  });

  // First Enter
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const afterFirstEnter = await page.evaluate(() => window.pmEditor.getState());
  expect(afterFirstEnter.paragraphCount).toBe(2);

  // Second Enter
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  const afterSecondEnter = await page.evaluate(() =>
    window.pmEditor.getState(),
  );
  expect(afterSecondEnter.paragraphCount).toBe(3);

  // First Backspace
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
  const afterFirstBackspace = await page.evaluate(() =>
    window.pmEditor.getState(),
  );
  expect(afterFirstBackspace.paragraphCount).toBe(2);

  // Second Backspace
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
  const finalState = await page.evaluate(() => window.pmEditor.getState());

  expect(finalState.paragraphCount).toBe(1);
  expect(finalState.textContent).toBe(initialState.textContent);

  return {
    initialState,
    afterFirstEnter,
    afterSecondEnter,
    afterFirstBackspace,
    finalState,
  };
}

/**
 * Common test pattern: Enter then Delete from first block
 */
export async function testEnterThenDeleteFromFirst(page: Page) {
  const initialState = await page.evaluate(() => window.pmEditor.getState());

  await page.evaluate(() => {
    window.pmEditor.setCursorToEnd();
  });

  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);

  const afterEnter = await page.evaluate(() => window.pmEditor.getState());
  expect(afterEnter.paragraphCount).toBe(2);

  await page.evaluate(() => {
    window.pmEditor.setCursorToEndOfBlock(0);
  });

  await page.keyboard.press("Delete");
  await page.waitForTimeout(100);

  const finalState = await page.evaluate(() => window.pmEditor.getState());

  expect(finalState.paragraphCount).toBe(1);
  expect(finalState.textContent).toContain(initialState.textContent);

  return { initialState, afterEnter, finalState };
}

/**
 * Helper to get current editor state
 */
export async function getEditorState(page: Page): Promise<EditorState> {
  return await page.evaluate(() => window.pmEditor.getState());
}

/**
 * Helper to perform Enter at position
 */
export async function pressEnterAt(
  page: Page,
  position: number,
): Promise<void> {
  await page.evaluate((pos) => {
    window.pmEditor.setCursorToPosition(pos);
  }, position);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
}

/**
 * Helper to perform Backspace
 */
export async function pressBackspace(page: Page): Promise<void> {
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);
}

/**
 * Helper to perform Delete
 */
export async function pressDelete(page: Page): Promise<void> {
  await page.keyboard.press("Delete");
  await page.waitForTimeout(100);
}

/**
 * Common assertion: verify document reverted to original
 */
export function assertReverted(
  finalState: EditorState,
  initialState: EditorState,
): void {
  expect(finalState.paragraphCount).toBe(initialState.paragraphCount);
  expect(finalState.textContent).toBe(initialState.textContent);
}

/**
 * Setup document from JSON and get initial state.
 * This helper replaces the editor document with the provided JSON,
 * clears transactions, and returns initial state.
 */
export async function setupDocFromJSON(
  page: Page,
  docJSON: unknown,
): Promise<{ initialState: EditorState; initialDoc: unknown }> {
  await page.evaluate((json) => {
    window.pmEditor.replaceDoc(json);
  }, docJSON);

  await page.evaluate(() => {
    window.pmEditor.clearTransactions();
  });

  const initialState = await page.evaluate(() => window.pmEditor.getState());
  const initialDoc = await page.evaluate(() => window.pmEditor.getDocJSON());

  return { initialState, initialDoc };
}

/**
 * Assert that document fully reverted to initial state.
 * Combines text content and JSON structure assertions.
 */
export function assertDocFullyReverted(
  finalState: EditorState,
  finalDoc: unknown,
  initialState: EditorState,
  initialDoc: unknown,
): void {
  expect(finalState.textContent).toBe(initialState.textContent);
  expect(JSON.stringify(finalDoc)).toBe(JSON.stringify(initialDoc));
}

/**
 * Perform a single Enter/Backspace cycle.
 * Useful for testing multiple rapid sequences.
 */
export async function performEnterBackspaceCycle(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.pmEditor.setCursorToEnd();
  });

  await page.keyboard.press("Enter");
  await page.waitForTimeout(50);

  await page.keyboard.press("Backspace");
  await page.waitForTimeout(50);
}
