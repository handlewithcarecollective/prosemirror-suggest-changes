import type { Node } from "prosemirror-model";
import type { SuggestionId } from "../../generateId.js";

export interface CharResult {
  char: string;
  node: Node; // The specific text node containing the char
  pos: number; // The document position of the char
}

export interface ZWSPWithPos extends CharResult {
  id: SuggestionId;
}

export const ZWSP = "\u200B";
