import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from "prosemirror-state";
import { getSuggestionDecorations } from "./decorations.js";

export interface SuggestChangesPluginState {
  enabled: boolean;
  generateId: () => string;
}

export interface SuggestChangesOptions {
  generateId?: () => string;
}

function defaultGenerateId(): string {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
  const random = Math.random().toString(36).substring(2, 6); // 4 character random string
  return `${random}${timestamp}`;
}

export const suggestChangesKey = new PluginKey<SuggestChangesPluginState>(
  "@handlewithcare/prosemirror-suggest-changes",
);

export function suggestChanges(options: SuggestChangesOptions = {}) {
  const generateId = options.generateId ?? defaultGenerateId;

  return new Plugin<SuggestChangesPluginState>({
    key: suggestChangesKey,
    state: {
      init() {
        return { enabled: false, generateId };
      },
      apply(tr, value) {
        const meta = tr.getMeta(suggestChangesKey) as
          | { enabled: boolean }
          | { skip: true }
          | undefined;
        if (meta && "enabled" in meta)
          return { ...value, enabled: meta.enabled };
        return value;
      },
    },
    props: {
      decorations: getSuggestionDecorations,
      // Add a custom keydown handler that skips over any zero-width
      // spaces that we've inserted so that users aren't aware of them
      handleKeyDown(view, event) {
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

        // Never block any other handlers from running after
        return false;
      },
    },
  });
}

export function isSuggestChangesEnabled(state: EditorState) {
  return !!suggestChangesKey.getState(state)?.enabled;
}

export function getSuggestChangesGenerateId(state: EditorState): () => string {
  const pluginState = suggestChangesKey.getState(state);
  if (!pluginState) {
    throw new Error("SuggestChanges plugin not found in editor state");
  }
  return pluginState.generateId;
}
