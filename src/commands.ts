import {
  Fragment,
  type Mark,
  type MarkType,
  type Node,
  Slice,
} from "prosemirror-model";
import {
  type Command,
  type EditorState,
  TextSelection,
} from "prosemirror-state";
import { Transform } from "prosemirror-transform";
import { type EditorView } from "prosemirror-view";

import { findSuggestionMarkEnd } from "./findSuggestionMarkEnd.js";
import { suggestChangesKey } from "./plugin.js";

/**
 * Given a node and a transform, add a set of steps to the
 * transform that applies all marks of type markTypeToApply
 * and reverts all marks of type markTypeToRevert.
 *
 * If suggestionId is provided, will only add steps that impact
 * deletions, insertions, and modifications with that id.
 */
function applySuggestionsToTransform(
  node: Node,
  tr: Transform,
  markTypeToApply: MarkType,
  markTypeToRevert: MarkType,
  suggestionId?: number,
) {
  const toApplyIsInSet =
    suggestionId === undefined
      ? (marks: readonly Mark[]) => markTypeToApply.isInSet(marks)
      : (marks: readonly Mark[]) =>
          markTypeToApply.create({ id: suggestionId }).isInSet(marks);

  const toRevertIsInSet =
    suggestionId === undefined
      ? (marks: readonly Mark[]) => markTypeToRevert.isInSet(marks)
      : (marks: readonly Mark[]) =>
          markTypeToRevert.create({ id: suggestionId }).isInSet(marks);

  const isToApply = toApplyIsInSet(node.marks);

  if (isToApply) {
    if (node.isInline) {
      tr.removeMark(0, node.nodeSize, markTypeToApply);
    } else {
      tr.removeNodeMark(0, markTypeToApply);
    }
  }

  node.descendants((child, pos) => {
    const isToRevert = toRevertIsInSet(child.marks);
    const isToApply = toApplyIsInSet(child.marks);
    if (!isToRevert && !isToApply) {
      return true;
    }

    if (isToRevert) {
      const { pos: deletionFrom, deleted } = tr.mapping.mapResult(pos);
      if (deleted) return false;
      const deletionTo = findSuggestionMarkEnd(
        tr.doc.resolve(deletionFrom + child.nodeSize),
        markTypeToRevert,
      );
      tr.deleteRange(deletionFrom, deletionTo);
      return false;
    }

    const insertionFrom = tr.mapping.map(pos);
    const insertionTo = insertionFrom + child.nodeSize;
    if (child.isInline) {
      tr.removeMark(insertionFrom, insertionTo, markTypeToApply);
      if (child.text === "\u200B") {
        tr.delete(insertionFrom, insertionTo);
      }
    } else {
      tr.removeNodeMark(insertionFrom, markTypeToApply);
    }
    return true;
  });
}

function revertModifications(node: Node, pos: number, tr: Transform) {
  const existingMods = node.marks.filter(
    (mark) => mark.type === node.type.schema.marks["modification"],
  );
  for (const mod of existingMods) {
    if (
      mod.attrs["type"] === "attr" &&
      typeof mod.attrs["attrName"] === "string"
    ) {
      tr.setNodeAttribute(
        pos,
        mod.attrs["attrName"],
        mod.attrs["previousValue"],
      );
    } else if (mod.attrs["type"] === "mark") {
      if (mod.attrs["previousValue"]) {
        tr.addNodeMark(
          0,
          node.type.schema.markFromJSON(mod.attrs["previousValue"]),
        );
      } else {
        tr.removeNodeMark(
          pos,
          node.type.schema.markFromJSON(mod.attrs["previousValue"]),
        );
      }
    }
  }
}

function applyModificationsToTransform(
  node: Node,
  tr: Transform,
  dir: number,
  suggestionId?: number,
) {
  const { modification } = node.type.schema.marks;
  if (!modification) {
    throw new Error(
      `Failed to apply modifications to node: schema does not contain modification mark. Did you forget to add it?`,
    );
  }

  const modificationIsInSet =
    suggestionId === undefined
      ? (marks: readonly Mark[]) => modification.isInSet(marks)
      : (marks: readonly Mark[]) =>
          modification.create({ id: suggestionId }).isInSet(marks);

  const isModification = modificationIsInSet(node.marks);

  if (isModification) {
    tr.removeNodeMark(0, modification);
    if (dir < 0) {
      revertModifications(node, 0, tr);
    }
  }

  node.descendants((child, pos) => {
    const isModification = modificationIsInSet(child.marks);
    if (!isModification) {
      return true;
    }

    tr.removeNodeMark(pos, modification);
    if (dir < 0) {
      revertModifications(child, pos, tr);
    }
    return true;
  });
}

function applySuggestionsToNode(node: Node) {
  const { deletion, insertion } = node.type.schema.marks;
  if (!deletion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain deletion mark. Did you forget to add it?`,
    );
  }
  if (!insertion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain insertion mark. Did you forget to add it?`,
    );
  }

  if (deletion.isInSet(node.marks)) {
    return null;
  }

  const transform = new Transform(node);
  applySuggestionsToTransform(node, transform, insertion, deletion);
  applyModificationsToTransform(node, transform, 1);
  return transform.doc;
}

export function applySuggestionsToSlice(slice: Slice) {
  const nodes: Node[] = [];
  slice.content.forEach((node) => {
    const applied = applySuggestionsToNode(node);
    if (applied) nodes.push(applied);
  });
  return new Slice(Fragment.from(nodes), slice.openStart, slice.openEnd);
}

/**
 * Command that applies all tracked changes in a document.
 *
 * This means that all content within deletion marks will be deleted.
 * Insertion marks and modification marks will be removed, and their
 * contents left in the doc.
 */
export function applySuggestions(
  state: EditorState,
  dispatch?: EditorView["dispatch"],
) {
  const { deletion, insertion } = state.schema.marks;
  if (!deletion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain deletion mark. Did you forget to add it?`,
    );
  }
  if (!insertion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain insertion mark. Did you forget to add it?`,
    );
  }

  const tr = state.tr;
  applySuggestionsToTransform(state.doc, tr, insertion, deletion);
  applyModificationsToTransform(tr.doc, tr, 1);
  tr.setMeta(suggestChangesKey, { skip: true });
  dispatch?.(tr);
  return true;
}

/**
 * Command that applies a given tracked change to a document.
 *
 * This means that all content within the deletion mark will be deleted.
 * The insertion mark and modification mark will be removed, and their
 * contents left in the doc.
 */
export function applySuggestion(suggestionId: number): Command {
  return (state, dispatch) => {
    const { deletion, insertion } = state.schema.marks;
    if (!deletion) {
      throw new Error(
        `Failed to apply tracked changes to node: schema does not contain deletion mark. Did you forget to add it?`,
      );
    }
    if (!insertion) {
      throw new Error(
        `Failed to apply tracked changes to node: schema does not contain insertion mark. Did you forget to add it?`,
      );
    }

    const tr = state.tr;
    applySuggestionsToTransform(
      state.doc,
      tr,
      insertion,
      deletion,
      suggestionId,
    );
    applyModificationsToTransform(tr.doc, tr, 1);
    if (!tr.steps.length) return false;
    tr.setMeta(suggestChangesKey, { skip: true });
    dispatch?.(tr);
    return true;
  };
}

/**
 * Command that reverts all tracked changes in a document.
 *
 * This means that all content within insertion marks will be deleted.
 * Deletion marks will be removed, and their contents left in the doc.
 * Modifications tracked in modification marks will be reverted.
 */
export function revertSuggestions(
  state: EditorState,
  dispatch?: EditorView["dispatch"],
) {
  const { deletion, insertion } = state.schema.marks;
  if (!deletion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain deletion mark. Did you forget to add it?`,
    );
  }
  if (!insertion) {
    throw new Error(
      `Failed to apply tracked changes to node: schema does not contain insertion mark. Did you forget to add it?`,
    );
  }
  const tr = state.tr;
  applySuggestionsToTransform(state.doc, tr, deletion, insertion);
  applyModificationsToTransform(tr.doc, tr, -1);
  tr.setMeta(suggestChangesKey, { skip: true });
  dispatch?.(tr);
  return true;
}

/**
 * Command that reverts a given tracked change in a document.
 *
 * This means that all content within the insertion mark will be deleted.
 * The deletion mark will be removed, and their contents left in the doc.
 * Modifications tracked in modification marks will be reverted.
 */
export function revertSuggestion(suggestionId: number): Command {
  return (state, dispatch) => {
    const { deletion, insertion } = state.schema.marks;
    if (!deletion) {
      throw new Error(
        `Failed to apply tracked changes to node: schema does not contain deletion mark. Did you forget to add it?`,
      );
    }
    if (!insertion) {
      throw new Error(
        `Failed to apply tracked changes to node: schema does not contain insertion mark. Did you forget to add it?`,
      );
    }

    const tr = state.tr;
    applySuggestionsToTransform(
      state.doc,
      tr,
      deletion,
      insertion,
      suggestionId,
    );
    if (!tr.steps.length) return false;
    tr.setMeta(suggestChangesKey, { skip: true });
    applyModificationsToTransform(tr.doc, tr, -1);
    dispatch?.(tr);
    return true;
  };
}

/**
 * Command that updates the selection to cover an existing change.
 */
export function selectSuggestion(suggestionId: number): Command {
  return (state, dispatch) => {
    const { deletion, insertion, modification } = state.schema.marks;
    if (!deletion) {
      throw new Error(
        `Failed to apply tracked changes to node: schema does not contain deletion mark. Did you forget to add it?`,
      );
    }
    if (!insertion) {
      throw new Error(
        `Failed to apply tracked changes to node: schema does not contain insertion mark. Did you forget to add it?`,
      );
    }
    if (!modification) {
      throw new Error(
        `Failed to apply tracked changes to node: schema does not contain modification mark. Did you forget to add it?`,
      );
    }

    let changeStart = null as number | null;
    let changeEnd = null as number | null;
    state.doc.descendants((node, pos) => {
      const mark = node.marks.find(
        (mark) =>
          mark.type === insertion ||
          mark.type === deletion ||
          mark.type === modification,
      );
      if (mark?.attrs["id"] !== suggestionId) return true;
      if (changeStart === null) {
        changeStart = pos;
        changeEnd = pos + node.nodeSize;
        return false;
      }
      changeEnd = pos + node.nodeSize;
      return false;
    });
    if (changeStart === null || changeEnd === null) {
      return false;
    }
    if (!dispatch) return true;

    dispatch(
      state.tr
        .setSelection(
          TextSelection.create(
            state.doc,
            changeStart as unknown as number,
            changeEnd as unknown as number,
          ),
        )
        .scrollIntoView(),
    );
    return true;
  };
}

/** Command that enables suggest changes */
export function enableSuggestChanges(
  state: EditorState,
  dispatch?: EditorView["dispatch"],
) {
  if (!suggestChangesKey.getState(state)) return false;
  if (!dispatch) return true;

  dispatch(state.tr.setMeta(suggestChangesKey, { skip: true, enabled: true }));
  return true;
}

/** Command that disables suggest changes */
export function disableSuggestChanges(
  state: EditorState,
  dispatch?: EditorView["dispatch"],
) {
  if (!suggestChangesKey.getState(state)) return false;
  if (!dispatch) return true;

  dispatch(state.tr.setMeta(suggestChangesKey, { skip: true, enabled: false }));
  return true;
}

/** Command that toggles suggest changes on or off */
export function toggleSuggestChanges(
  state: EditorState,
  dispatch?: EditorView["dispatch"],
) {
  const pluginState = suggestChangesKey.getState(state);
  if (!pluginState) return false;
  if (!dispatch) return true;

  dispatch(
    state.tr.setMeta(suggestChangesKey, {
      skip: true,
      enabled: !pluginState.enabled,
    }),
  );
  return true;
}
