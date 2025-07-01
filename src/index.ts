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
  getSuggestChangesGenerateId,
  type SuggestChangesOptions,
  type SuggestChangesPluginState,
} from "./plugin.js";

export { withSuggestChanges } from "./withSuggestChanges.js";
