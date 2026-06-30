import type { EditorState } from "prosemirror-state";
import {
  Decoration,
  DecorationSet,
  type DecorationSource,
} from "prosemirror-view";
import { getSuggestionMarks } from "./utils.js";
import { type BoundarySuggestion } from "./schema.js";

function pilcrow() {
  const span = document.createElement("span");
  span.appendChild(document.createTextNode("¶"));
  return span;
}

export function getSuggestionDecorations(state: EditorState): DecorationSource {
  const { deletion, insertion, blockBoundarySuggestion } = getSuggestionMarks(
    state.schema,
  );

  const changeDecorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.isTextblock && node.childCount) {
      if (node.children.every((child) => deletion.isInSet(child.marks))) {
        changeDecorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            "data-node-deletion": "true",
          }),
        );
      }
      if (node.children.every((child) => insertion.isInSet(child.marks))) {
        changeDecorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            "data-node-insertion": "true",
          }),
        );
      }
    }

    const boundarySuggestion = blockBoundarySuggestion.isInSet(node.marks)
      ?.attrs as BoundarySuggestion | undefined;

    if (!boundarySuggestion) return true;

    if (boundarySuggestion.endType && boundarySuggestion.endId) {
      const markType =
        boundarySuggestion.endType === "insertion" ? insertion : deletion;

      console.log(boundarySuggestion);

      changeDecorations.push(
        Decoration.widget(pos + node.nodeSize - 1, pilcrow, {
          key:
            typeof boundarySuggestion.endId === "number"
              ? boundarySuggestion.endId.toString()
              : boundarySuggestion.endId,

          marks: [markType.create({ id: boundarySuggestion.endId })],
        }),
      );
    }
    return true;
  });
  return DecorationSet.create(state.doc, changeDecorations);
}
