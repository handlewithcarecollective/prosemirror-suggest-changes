export {
  addSuggestionMarks,
  insertion,
  deletion,
  modification,
} from "./schema.js";

export {
  selectSuggestion,
  revertSuggestion,
  revertSuggestions,
  applySuggestion,
  applySuggestions,
  enableSuggestChanges,
  disableSuggestChanges,
  toggleSuggestChanges,
} from "./commands.js";

export {
  suggestChanges,
  suggestChangesKey,
  isSuggestChangesEnabled,
} from "./plugin.js";

export {
  withSuggestChanges,
  transformToSuggestionTransaction,
} from "./withSuggestChanges.js";
