import { Schema, type Node } from "prosemirror-model";
import {
  type MarkBuilder,
  type NodeBuilder,
  builders,
} from "prosemirror-test-builder";
import { nodes, marks } from "prosemirror-schema-basic";
import { bulletList, listItem, orderedList } from "prosemirror-schema-list";
import { addSuggestionMarks } from "../schema.js";
import { difficulty } from "./difficultyMark.js";

const schema = new Schema({
  nodes: {
    ...nodes,
    image: { ...nodes.image, group: "block", inline: false },
    doc: {
      ...nodes.doc,
      marks:
        "difficulty insertion deletion modification blockBoundarySuggestion",
    },
    orderedList: { ...orderedList, group: "block", content: "listItem+" },
    bulletList: { ...bulletList, group: "block", content: "listItem+" },
    listItem: { ...listItem, content: "block+" },
  },
  marks: { ...addSuggestionMarks(marks), difficulty },
});

export const testBuilders = builders(schema) as {
  [NodeTypeName in keyof (typeof schema)["nodes"]]: NodeBuilder;
} & {
  [MarkTypeName in keyof (typeof schema)["marks"]]: MarkBuilder;
} & { schema: typeof schema };

export type TaggedNode = Node & {
  flat: Node;
  tag: Record<string, number>;
};
