# CodeTour

A buildless viewer for guided code walkthroughs written in Org. Put `TOUR.org` at the root of a public GitHub repository, then give its URL to CodeTour after `#`.

## Open a tour

```text
https://example.com/#https://github.com/tani/lean-qasm
https://example.com/#https://github.com/owner/repo/tree/main
https://example.com/#https://github.com/owner/repo/tree/v1.0.0
https://example.com/#https://github.com/owner/repo/tree/feature/my-branch
https://example.com/#https://github.com/owner/repo/commit/FULL_COMMIT_SHA
https://example.com/#https://github.com/owner/repo?ref=feature%2Fmy-branch
```

The plain repository URL uses its default branch. `/tree/` treats the entire remaining path as a branch or tag, including slashes; it does not select a subdirectory. `?ref=` provides an unambiguous alternative. Add `&step=4` (or `?step=4` when there is no query yet) inside the fragment's GitHub URL to deep-link to a page. Navigation preserves the repository and revision.

The browser resolves a branch, tag, abbreviated SHA, or default branch to a full commit SHA through GitHub's public API. A supplied full 40-character SHA bypasses the API entirely. It then fetches the root `TOUR.org` and every source file from **jsDelivr at that same immutable commit**. The SHA used for GitHub line links matches the downloaded source. Repository selection is not an instruction to use a different repository named in the Org document; only the fragment selects the source.

## Host it

Serve these three files together on any static HTTPS host:

- `index.html`
- `script.js`
- `style.css`

There is no build step, server, production package install, API token, or bundled example tour. Opening the viewer without a fragment shows a repository picker. The `type="importmap"` JSON in `index.html` owns the exact browser dependency URLs. `script.js` uses bare imports for unified, reorg, rehype, Shiki, and Pele. MathJax is a classic-script component: its script URL is resolved from the same map with `import.meta.resolve('mathjax')`. Change versions in the import map to update production dependencies. `package.json` and `package-lock.json` pin the equivalent parser/render dependencies for Node tests; a test checks that their versions match the map. GitHub Pages can serve the files if enabled separately in repository settings.

Source and runtime libraries need internet access. Public API requests are subject to GitHub's unauthenticated rate limit. Private repositories are not supported. Fonts have system fallbacks; syntax-highlighting and diagram/math load failures retain readable source.

## Write TOUR.org

Each top-level Org heading starts a page. Omit both `FILE` and `LINES` for a full-width introduction or summary. Supply both for a source-and-explanation page:

```org
#+TITLE: My codebase

* Welcome
:PROPERTIES:
:CHAPTER: INTRODUCTION
:KICKER: A GUIDED READING
:END:
Start with the architecture and the questions this tour will answer.

* The entry point
:PROPERTIES:
:FILE: src/main.js
:LINES: 10-24
:CHAPTER: FIRST CONTACT
:KICKER: THE PUBLIC API
:LANGUAGE: javascript
:END:
Read the =main= function. Nearby code is shown in gray.

* In perspective
The same representation connects several consumers.
```

`LINES` is a 1-based inclusive range. `FILENAME`/`RANGE` are accepted aliases. `LANGUAGE` (or `LANG`) optionally overrides syntax detection; otherwise CodeTour recognizes common file extensions. Unsupported languages appear as plain text. File paths are relative to the repository root and may contain spaces or Unicode; absolute paths and parent traversal are rejected. A partial or malformed source reference is an error, rather than silently becoming a text-only page.

Org is parsed with unified and `@orgajs/reorg-parse`. Page boundaries and properties come from the parsed Org AST. `@orgajs/reorg-rehype` converts that AST to HTML nodes, `rehype-sanitize` filters them, and `rehype-stringify` serializes the result. Paragraphs, nested headings, lists, tables, links, emphasis, source blocks, and LaTeX use this pipeline. Small compatibility normalization preserves Markdown code fences and display-math delimiters from earlier CodeTour versions. Raw HTML exports are sanitized; scripts, event handlers, and unsafe link schemes are removed. This is an Org viewer rather than an Emacs exporter. The contents dialog can preview a local Org file against the repository revision already open; this stays in memory and does not modify GitHub.

### Diagrams and equations

```org
#+begin_src mermaid
flowchart TD
  Source --> Parser
  Parser --> IR
  IR --> Execution
  IR --> Diagram
#+end_src

Inline math: \(x = y + z\).

\[
\frac{a}{b} = \sqrt{2}.
\]
```

Markdown-style mermaid fences also work. Pele renders diagrams and adapts them to the pane width. A disclosure keeps the original Mermaid source available. LaTeX is rendered by MathJax v4 with inline `\( ... \)` and display `\[ ... \]` delimiters; `$$ ... $$` display blocks and AMS equation/align/gather environments are also accepted. Ordinary source code blocks are excluded from math processing. Diagram-label TeX is not typeset; put equations in the surrounding prose.

## Read and navigate

- Landscape: code and explanation sit side by side in a 1.618:1 ratio.
- Portrait: the code pane sits above the explanation, using the same ratio.
- Text-only pages fill one pane in either orientation.
- Right/down arrows, Page Down, Space, or Enter advance; left/up arrows, Page Up, or Backspace go back.
- Home/End jump to the first/last page. T opens contents.
- Tap the explanation, use the buttons, or select a progress marker to navigate.
- Click the code to open the highlighted lines on GitHub.

Scrolling, selecting text, and interacting with diagram controls do not advance the tour. A changing repository invalidates previous asynchronous renders so old results cannot replace a new selection.

## Development

```sh
python3 -m http.server 8000

# In another terminal, install development dependencies and run the tests:
npm ci
npm test
```

Visit `http://localhost:8000/` with a repository fragment. Tests use Node's built-in runner with the pinned unified/reorg/rehype development dependencies. They cover URL and revision selection, page navigation, immutable source URLs, Org page types, TeX preservation, Mermaid blocks, code isolation, Org tables and links, sanitization, and import-map consistency.

## License and dependencies

CodeTour is released under the existing [Unlicense](LICENSE). Libraries are loaded from jsDelivr rather than vendored; their licenses remain separate:

- [unified](https://github.com/unifiedjs/unified), 11.0.5 — MIT
- [reorg](https://github.com/orgapp/orgajs), reorg-parse 4.4.2 / reorg-rehype 4.3.13 — MIT
- [rehype](https://github.com/rehypejs/rehype), stringify 10.0.1 / sanitize 6.0.0 — MIT
- [Shiki](https://github.com/shikijs/shiki), 3.13.0 — MIT
- [Pele](https://github.com/obsidianmd/pele), 1.13.0 — MIT
- [MathJax](https://github.com/mathjax/MathJax), 4.0.0 — Apache-2.0

Optional Google Fonts use their respective open font licenses. Repository code and tour text retain the source repository's licenses.
