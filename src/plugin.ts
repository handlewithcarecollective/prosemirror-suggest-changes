import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from "prosemirror-state";
import { getSuggestionDecorations } from "./decorations.js";
import { removeInsertedBreak } from "./removeInsertedBreak.js";

export const suggestChangesKey = new PluginKey<{ enabled: boolean }>(
  "@handlewithcare/prosemirror-suggest-changes",
);

export function suggestChanges() {
  return new Plugin<{ enabled: boolean }>({
    key: suggestChangesKey,
    state: {
      init() {
        return { enabled: false };
      },
      apply(tr, value) {
        const meta = tr.getMeta(suggestChangesKey) as
          | { enabled: boolean }
          | { skip: true }
          | undefined;
        if (meta && "enabled" in meta) return meta;
        return value;
      },
    },
    props: {
      decorations: getSuggestionDecorations,
      // Add a custom keydown handler that skips over any zero-width
      // spaces that we've inserted so that users aren't aware of them
      handleKeyDown(view, event) {
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          removeInsertedBreak(event.key === "Backspace" ? -1 : 1)(
            view.state,
            (tr) => {
              view.dispatch(tr);
            },
          )
        ) {
          // Removing the inserted break fully handles the key, so claim the event to keep
          // the default Backspace/Delete from acting on top of the join.
          return true;
        }

        if (
          event.key === "ArrowRight" &&
          view.state.selection instanceof TextSelection &&
          view.state.selection.empty &&
          view.state.selection.$cursor?.nodeAfter?.text?.startsWith("\u200B")
        ) {
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(
                view.state.doc,
                view.state.selection.$cursor.pos + 1,
              ),
            ),
          );
        }

        if (
          event.key === "ArrowLeft" &&
          view.state.selection instanceof TextSelection &&
          view.state.selection.empty &&
          view.state.selection.$cursor?.nodeBefore?.text?.endsWith("\u200B")
        ) {
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(
                view.state.doc,
                view.state.selection.$cursor.pos - 1,
              ),
            ),
          );
        }

        // Anything we didn't claim above falls through to the default handlers.
        return false;
      },
    },
  });
}

export function isSuggestChangesEnabled(state: EditorState) {
  return !!suggestChangesKey.getState(state)?.enabled;
}
