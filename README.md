# @handlewithcare/prosemirror-suggest-changes

Check out
[the demo](https://handlewithcarecollective.github.io/prosemirror-suggest-changes)!

Development of this library is sponsored by the kind folks at
[dskrpt.de](https://dskrpt.de/)!

## Installation

Install `@handlewithcare/prosemirror-suggest-changes` and its peer dependencies:

npm:

```sh
npm install @handlewithcare/prosemirror-suggest-changes prosemirror-view prosemirror-transform prosemirror-state prosemirror-model
```

yarn:

```sh
yarn add @handlewithcare/prosemirror-suggest-changes prosemirror-view prosemirror-transform prosemirror-state prosemirror-model
```

<!-- toc -->

- [Usage](#usage)
- [How it works](#how-it-works)
- [API](#api)
  - [Schema](#schema)
    - [`insertion`](#insertion)
    - [`deletion`](#deletion)
    - [`modification`](#modification)
    - [`addSuggestionMarks`](#addsuggestionmarks)
  - [Commands](#commands)
    - [`selectSuggestion`](#selectsuggestion)
    - [`revertSuggestion`](#revertsuggestion)
    - [`revertSuggestions`](#revertsuggestions)
    - [`applySuggestion`](#applysuggestion)
    - [`applySuggestions`](#applysuggestions)
    - [`enableSuggestChanges`](#enablesuggestchanges)
    - [`disableSuggestChanges`](#disablesuggestchanges)
    - [`toggleSuggestChanges`](#togglesuggestchanges)
  - [Plugin](#plugin)
    - [`suggestChanges`](#suggestchanges)
    - [`suggestChangesKey`](#suggestchangeskey)
    - [`isSuggestChangesEnabled`](#issuggestchangesenabled)
  - [`dispatchTransaction` Decorator](#dispatchtransaction-decorator)
    - [`withSuggestChanges`](#withsuggestchanges)

<!-- tocstop -->

## Usage

First, add the suggestion marks to your schema:

```ts
import { addSuggestionMarks } from "@handlewithcare/prosemirror-suggest-changes";

export const schema = new Schema({
  nodes: {
    ...nodes,
    doc: {
      ...nodes.doc,
      // We need to allow these marks as block marks as well,
      // to support block-level suggestions, like inserting a
      // new list item
      marks: "insertion modification deletion",
    },
  },
  marks: addSuggestionMarks(marks),
});
```

Then, add the plugin to your editor state:

```ts
import { suggestChanges } from "@handlewithcare/prosemirror-suggest-changes";

const editorState = EditorState.create({
  schema,
  doc,
  plugins: [
    // ... your other plugins
    suggestChanges(),
  ],
});
```

Use the `dispatchTransaction` decorator to intercept and transform transactions,
and add suggestion decorations:

```ts
import {
  withSuggestChanges,
  getSuggestionDecorations,
} from "@handlewithcare/prosemirror-suggest-changes";

const editorEl = document.getElementById("editor")!;

const view = new EditorView(editorEl, {
  state: editorState,
  decorations: getSuggestionDecorations,
  dispatchTransaction: withSuggestChanges(),
});
```

And finally, use the commands to control the suggest changes state, apply
suggestions, and revert suggestions. Here’s a sample view plugin that renders a
simple menu with some suggestion-related commands:

```ts
import {
  toggleSuggestChanges,
  applySuggestions,
  revertSuggestions,
  isSuggestChangesEnabled,
} from "@handlewithcare/prosemirror-suggest-changes";

const suggestChangesViewPlugin = new Plugin({
  view(view) {
    const toggleButton = document.createElement("button");
    toggleButton.appendChild(document.createTextNode("Enable suggestions"));
    toggleButton.addEventListener("click", () => {
      toggleSuggestChanges(view.state, view.dispatch);
      view.focus();
    });

    const applyAllButton = document.createElement("button");
    applyAllButton.appendChild(document.createTextNode("Apply all"));
    applyAllButton.addEventListener("click", () => {
      applySuggestions(view.state, view.dispatch);
      view.focus();
    });

    const revertAllButton = document.createElement("button");
    revertAllButton.appendChild(document.createTextNode("Revert all"));
    revertAllButton.addEventListener("click", () => {
      revertSuggestions(view.state, view.dispatch);
      view.focus();
    });

    const commandsContainer = document.createElement("div");
    commandsContainer.append(applyAllButton, revertAllButton);

    const container = document.createElement("div");
    container.classList.add("menu");
    container.append(toggleButton, commandsContainer);

    view.dom.parentElement?.prepend(container);

    return {
      update() {
        if (isSuggestChangesEnabled(view.state)) {
          toggleButton.replaceChildren(
            document.createTextNode("Disable suggestions"),
          );
        } else {
          toggleButton.replaceChildren(
            document.createTextNode("Enable suggestions"),
          );
        }
      },
      destroy() {
        container.remove();
      },
    };
  },
});
```

## How it works

This library provides three mark types:

- `insertion` represents newly inserted content, including new text content and
  new block nodes
- `deletion` represents content that is marked as deleted, including text and
  block nodes
- `modification` represents nodes whose marks or attrs have changed, but whose
  content has not changed

Additionally, this library provides:

- A plugin, which keeps track of whether suggestions are enabled or not
- A decoration set factory, which renders pilcrows (¶) to make it clear to users
  when block nodes have been deleted or inserted
- A set of commands (`applySuggestions`, `revertSuggestions`, `applySuggestion`,
  etc), for working with suggestions
- A "`dispatchTransaction` decorator", `withSuggestChanges`

`withSuggestChanges` is a function that optionally takes a `dispatchTransaction`
function and returns a decorated `dispatchTransaction` function. This decorated
function will, when suggestions are enabled, intercept transactions before they
are applied to the state, and produce transformed transactions that suggest the
intended changes, instead of directly applying them. For example, a transaction
that attempts to delete the text between positions 2 and 5 in the document will
be replaced with a transaction that adds the `deletion` mark to the text between
positions 2 and 5.

If you already have a custom `dispatchTransaction` implementation, you can pass
it to `withSuggestChanges`. Otherwise, it will rely on the default
implementation (`view.setState(view.state.apply(tr))`).

```ts
const view = new EditorView(editorEl, {
  state: editorState,
  plugins,
  decorations: getSuggestionDecorations,
  dispatchTransaction: withSuggestChanges(
    /** An example dispatchTransaction that integrates with an external redux store */
    function dispatchTransaction(this: EditorView, tr: Transaction) {
      store.dispatch(transactionDispatched({ tr }));
    },
  ),
});
```

## API

### Schema

#### `insertion`

Represents newly inserted content, including new text content and new block
nodes

```ts
const insertion: MarkSpec;
```

#### `deletion`

Represents content that is marked as deleted, including text and block nodes

```ts
const deletion: MarkSpec;
```

#### `modification`

Represents nodes whose marks or attrs have changed, but whose content has not
changed

```ts
const modification: MarkSpec;
```

#### `addSuggestionMarks`

Add the deletion, insertion, and modification marks to the provided MarkSpec
map.

```ts
function addSuggestionMarks<Marks extends string>(
  marks: Record<Marks, MarkSpec>,
): Record<Marks | "deletion" | "insertion" | "modification", MarkSpec>;
```

### Commands

#### `selectSuggestion`

Command that updates the selection to cover an existing change.

```ts
function selectSuggestion(suggestionId: number): Command;
```

#### `revertSuggestion`

Command that reverts a given tracked change in a document.

This means that all content within the insertion mark will be deleted. The
deletion mark will be removed, and their contents left in the doc. Modifications
tracked in modification marks will be reverted.

```ts
function revertSuggestion(suggestionId: number): Command;
```

#### `revertSuggestions`

Command that reverts all tracked changes in a document.

This means that all content within insertion marks will be deleted. Deletion
marks will be removed, and their contents left in the doc. Modifications tracked
in modification marks will be reverted.

```ts
const revertSuggestions: Command;
```

#### `applySuggestion`

Command that applies a given tracked change to a document.

This means that all content within the deletion mark will be deleted. The
insertion mark and modification mark will be removed, and their contents left in
the doc.

```ts
function applySuggestion(suggestionId: number): Command;
```

#### `applySuggestions`

Command that applies all tracked changes in a document.

This means that all content within deletion marks will be deleted. Insertion
marks and modification marks will be removed, and their contents left in the
doc.

```ts
const applySuggestions: Command;
```

#### `enableSuggestChanges`

Command that enables suggest changes

```ts
const enableSuggestChanges: Command;
```

#### `disableSuggestChanges`

Command that disables suggest changes

```ts
const disableSuggestChanges: Command;
```

#### `toggleSuggestChanges`

Command that toggles suggest changes on or off

```ts
const toggleSuggestChanges: Command;
```

### Plugin

#### `suggestChanges`

A plugin that tracks whether suggest changes is enabled. It also provides
decorations that are useful for clarifying suggestions, such as pilcrows to mark
when paragraph breaks have been deleted or inserted.

```ts
function suggestChanges(): Plugin<{ enabled: boolean }>;
```

#### `suggestChangesKey`

A plugin key for the `suggestChanges` plugin

```ts
const suggestChangesKey: PluginKey<{ enabled: boolean }>;
```

#### `isSuggestChangesEnabled`

A helper function to check whether suggest changes is enabled.

```ts
function isSuggestChangesEnabled(state: EditorState): boolean;
```

### `dispatchTransaction` Decorator

#### `withSuggestChanges`

A `dispatchTransaction` decorator. Wrap your existing `dispatchTransaction`
function with `withSuggestChanges`, or pass no arguments to use the default
implementation (`view.setState(view.state.apply(tr))`).

The result is a `dispatchTransaction` function that will intercept and modify
incoming transactions when suggest changes is enabled. These modified
transactions will suggest changes instead of directly applying them, e.g. by
marking a range with the deletion mark rather than removing it from the
document.

```ts
function withSuggestChanges(
  dispatchTransaction?: EditorView["dispatch"],
): EditorView["dispatch"];
```
