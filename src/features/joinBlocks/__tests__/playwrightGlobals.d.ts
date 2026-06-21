import type { EditorView } from "prosemirror-view";

declare global {
  interface Window {
    pmEditor: {
      view: EditorView;
      getState: () => {
        paragraphCount: number;
        blockCount: number;
        textContent: string;
        cursorFrom: number;
        cursorTo: number;
      };
      getDocJSON: () => unknown;
      getCursorInfo: () => {
        from: number;
        to: number;
        empty: boolean;
        parentOffset: number;
        depth: number;
      };
      setCursorToEnd: () => void;
      setCursorToPosition: (pos: number) => void;
      setCursorToEndOfBlock: (blockIndex: number) => void;
      getTransactions: () => {
        steps: unknown[];
        selection: { from: number; to: number };
        docBefore: string;
        docAfter: string;
      }[];
      clearTransactions: () => void;
      logState: () => void;
      replaceDoc: (doc: unknown) => void;
    };
  }
}

export {};
