import { Selection, type EditorState } from "prosemirror-state";
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

  const widgetPositions = new Set<number>();
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

    if (boundarySuggestion.type && boundarySuggestion.id) {
      const markType =
        boundarySuggestion.type === "insertion" ? insertion : deletion;

      const widgetPos = Selection.near(
        state.doc.resolve(pos + node.nodeSize),
        -1,
      ).from;

      if (widgetPositions.has(widgetPos)) {
        return true;
      }

      widgetPositions.add(widgetPos);

      const { type: _, ...markAttrs } = boundarySuggestion;

      changeDecorations.push(
        Decoration.widget(widgetPos, pilcrow, {
          key:
            typeof boundarySuggestion.id === "number"
              ? boundarySuggestion.id.toString()
              : boundarySuggestion.id,

          marks: [markType.create(markAttrs)],
        }),
      );
    }
    return true;
  });
  return DecorationSet.create(state.doc, changeDecorations);
}
