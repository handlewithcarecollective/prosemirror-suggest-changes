import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { nodes, marks } from "prosemirror-schema-basic";
import { baseKeymap, chainCommands } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import {
  bulletList,
  orderedList,
  listItem,
  splitListItem,
} from "prosemirror-schema-list";
import { addSuggestionMarks } from "../src/schema.js";
import { withSuggestChanges } from "../src/withSuggestChanges.js";
import { suggestChanges, suggestChangesKey } from "../src/plugin.js";
import "prosemirror-view/style/prosemirror.css";

// Create schema with suggestion marks and list support
const schema = new Schema({
  nodes: {
    ...nodes,
    ordered_list: { ...orderedList, group: "block", content: "list_item+" },
    bullet_list: { ...bulletList, group: "block", content: "list_item+" },
    list_item: {
      ...listItem,
      content: "block+",
      marks: "insertion deletion modification",
    },
  },
  marks: addSuggestionMarks(marks),
});

// Transaction logging
const transactions: {
  steps: unknown[];
  selection: { from: number; to: number };
  docBefore: string;
  docAfter: string;
}[] = [];

// Create initial document
const doc = schema.nodeFromJSON({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "test paragraph" }],
    },
  ],
});

// Create editor state with list item support
let state = EditorState.create({
  doc,
  schema,
  plugins: [
    keymap({
      ...baseKeymap,
      // Handle Enter key for list items
      Enter: chainCommands(
        splitListItem(schema.nodes.list_item),
        baseKeymap["Enter"] ?? (() => false),
      ),
    }),
    suggestChanges(),
  ],
});

// Enable suggest changes mode
state = state.apply(state.tr.setMeta(suggestChangesKey, { enabled: true }));

// Custom dispatch with logging
const dispatch = withSuggestChanges(
  function (this: EditorView, tr) {
    const docBefore = this.state.doc.textContent;
    const newState = this.state.apply(tr);

    transactions.push({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      steps: tr.steps.map((s) => s.toJSON()),
      selection: { from: tr.selection.from, to: tr.selection.to },
      docBefore,
      docAfter: newState.doc.textContent,
    });

    this.updateState(newState);

    // Update status display
    updateStatus();
  },
  () => 1,
);

// Create editor view
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const editorEl = document.getElementById("editor")!;
const view = new EditorView(editorEl, {
  state,
  dispatchTransaction: dispatch,
});

// Status display
function updateStatus() {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const statusEl = document.getElementById("status")!;
  statusEl.textContent = [
    `Blocks: ${String(view.state.doc.childCount)}`,
    `Content: "${view.state.doc.textContent}"`,
    `Cursor: ${String(view.state.selection.from)}-${String(view.state.selection.to)}`,
    `Transactions: ${String(transactions.length)}`,
  ].join(" | ");
}

// Initial status
updateStatus();

// Expose API to window for Playwright access
declare global {
  interface Window {
    pmEditor: {
      view: EditorView;
      getState: () => {
        blockCount: number;
        paragraphCount: number; // Kept for backward compatibility
        textContent: string;
        cursorFrom: number;
        cursorTo: number;
      };
      getDocJSON: () => unknown;
      replaceDoc: (docJSON: unknown) => void;
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
      getTransactions: () => typeof transactions;
      clearTransactions: () => void;
      logState: () => void;
    };
  }
}

window.pmEditor = {
  view,

  getState() {
    return {
      blockCount: view.state.doc.childCount,
      paragraphCount: view.state.doc.childCount, // Kept for backward compatibility
      textContent: view.state.doc.textContent,
      cursorFrom: view.state.selection.from,
      cursorTo: view.state.selection.to,
    };
  },

  replaceDoc(docJSON: unknown) {
    const schema = view.state.schema;
    const doc = schema.nodeFromJSON(docJSON);

    // Create a completely new state with the new document
    const newState = EditorState.create({
      doc,
      schema,
      plugins: view.state.plugins,
    });

    // Enable suggest changes mode
    const enabledState = newState.apply(
      newState.tr.setMeta(suggestChangesKey, { enabled: true }),
    );

    view.updateState(enabledState);
  },

  getDocJSON() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return view.state.doc.toJSON();
  },

  getCursorInfo() {
    const { from, to, empty } = view.state.selection;
    const $from = view.state.doc.resolve(from);
    return {
      from,
      to,
      empty,
      parentOffset: $from.parentOffset,
      depth: $from.depth,
    };
  },

  setCursorToEnd() {
    const endPos = view.state.doc.content.size - 1;
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(endPos)),
      ),
    );
  },

  setCursorToPosition(pos: number) {
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(pos)),
      ),
    );
  },

  setCursorToEndOfBlock(blockIndex: number) {
    const doc = view.state.doc;
    if (blockIndex < 0 || blockIndex >= doc.childCount) {
      throw new Error(`Invalid block index: ${String(blockIndex)}`);
    }

    let pos = 0;
    for (let i = 0; i < blockIndex; i++) {
      pos += doc.child(i).nodeSize;
    }
    // Position at end of the block (before the closing boundary)
    pos += doc.child(blockIndex).content.size;

    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(pos)),
      ),
    );
  },

  getTransactions() {
    return transactions;
  },

  clearTransactions() {
    transactions.length = 0;
  },

  logState() {
    console.log("=== Editor State ===");
    console.log("Blocks:", view.state.doc.childCount);
    console.log("Content:", view.state.doc.textContent);
    console.log(
      "Cursor:",
      view.state.selection.from,
      "-",
      view.state.selection.to,
    );
    console.log("Doc JSON:", view.state.doc.toJSON());
    console.log("===================");
  },
};

// Log initial state
console.log("Editor initialized");
window.pmEditor.logState();
