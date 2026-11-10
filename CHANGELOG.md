# Changelog

The versions of the extension. Its features come from `sosuc`: a feature of the language server
works with a `sosuc` that has it, and is simply missing with an older one.

## 0.3.0

- Outline: the declarations of a file (functions, types and their fields, methods and variants,
  constants, tests) in the Outline view, the breadcrumbs and Go to Symbol in Editor
  (`Ctrl+Shift+O`). With Sosu 0.6 or later.
- Signature help: the parameters of the function or method being called, and the one being
  written, as you type `(` and `,`. With Sosu 0.6 or later.
- Rename (`F2`) tells at once when a name cannot be renamed (a keyword, a name of `core` or
  `std`, a module), and refuses a new name that would change the program: one already declared
  there, or one that would hide another name or be hidden by it. With Sosu 0.6 or later.
- References and rename on a program that does not load say so, instead of finding nothing.
  With Sosu 0.6 or later.
- `sosuc` is also found where the installers of Sosu put it (`%LOCALAPPDATA%\Programs\Sosu\bin`,
  `~/.local/bin`, `/usr/local/bin`, `/usr/bin`) when it is not in the `PATH` of VS Code: VS Code
  keeps the `PATH` it was started with.
- Highlighting of `export "C"` and `keeps`.
- A test of a whole session with `sosuc lsp` (`test/lsp.test.js`); the CI installs the latest
  `sosuc` with `install.sh` to run it.
- The `.vsix` carries a `LICENSE` file; `package.json` gives the issues and the home page.
- A workflow `Publish` for the Visual Studio Marketplace and Open VSX, by hand, which refuses a
  version below 1.0.0: the extension is published when Sosu launches.

## 0.2.0

- References (`Shift+F12`) and rename (`F2`) through `sosuc lsp`, in every file of the program.
- Generate the documentation: `sosuc doc` on the package, then the preview of
  `build/doc/<name>.md`.
- Formatting breaks the lines longer than 120 characters (from Sosu 0.5).

## 0.1.x

- Catalogs of translations (`<name>.locale.<language>.sosu`): the language `sosu-locale`, with
  the highlighting of gettext.
- Types `ui8` to `ui64`, `uf32` and `uf64` highlighted; `.ui.sosu` files formatted.
- The icon of Sosu, for the extension and for `.sosu` files.
- The language client of `sosuc lsp`: errors while typing, hover, go to definition, completion.
- Highlighting of `.sosu` and `.ui.sosu` files, snippets, commands and tasks, check on save,
  formatting, debugging through the C debugger.
