# VSCode-Sosu-Plugins

The Visual Studio Code extension for [Sosu](https://github.com/Clement-Bonet/Sosu).

## Features

- **Highlighting** of `.sosu` files (language `sosu`) and of `.ui.sosu` interface files (language
  `sosu-ui`: windows, components, nodes and their properties, with Sosu expressions inside).
- **Editing**: comments (`Ctrl+/`), brackets and quotes closed as you type, indentation, folding
  (`// region` ... `// endregion`), and snippets (`main`, `fn`, `fnc`, `struct`, `class`, `enum`,
  `match`, `for`, `arena`, `test`, `extern`; `window`, `column`, `button`, `textfield`, `radio`,
  `list`... in `.ui.sosu` files).
- **Commands** (`Ctrl+Shift+P`, then "Sosu"): Run the program (`Ctrl+F5`, or the run button of
  the editor), Build the program, Run the tests, Check without compiling. They work on the
  package of the file being edited: the nearest folder up with a `sosu.toml`.
- **Tasks**: the same commands as tasks of type `sosu` (Terminal > Run Task), with the problem
  matcher `$sosuc`: the errors of the compiler go to the Problems panel.
- **Live diagnostics**: when a Sosu file is opened or saved, its package is checked
  (`sosuc check --format=json`), and the errors are underlined, with their help.
- **Formatting**: Format Document (`Shift+Alt+F`) runs `sosuc fmt` on `.sosu` files.
- **Debugging**: `F5` builds the package, then debugs the program with the C debugger of
  VS Code. The C that `sosuc` generates keeps `#line` directives to the `.sosu` files: breakpoints
  are set in the Sosu source, and steps follow it.

## Requirements

- `sosuc`, built from the Sosu repository (`build.bat` on Windows, `make` elsewhere). If it is not
  in the `PATH`, give its full path in the setting `sosu.path`.
- For debugging: the [C/C++ extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools)
  of Microsoft. It debugs with MSVC (`cppvsdbg`) on Windows, gdb on Linux and lldb on macOS.

## Installing

The extension is not on the Marketplace. Each run of the CI builds `sosu-<version>.vsix` (the
artifact `sosu-vsix` of the run); `npm run package` builds it too. Then, in VS Code:
Extensions > `...` > Install from VSIX, or:

```sh
code --install-extension sosu-0.1.0.vsix
```

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `sosu.path` | `sosuc` | the compiler |
| `sosu.home` | (empty) | the Sosu installation whose `lib` holds `core` and `std` (`SOSU_HOME`); empty: next to `sosuc` |
| `sosu.checkOnSave` | `true` | check the package when a file is opened or saved |

## Debugging

`F5` in a Sosu file, without a `launch.json`, debugs its package. For more control, a
`launch.json` (Run > Add Configuration > Sosu):

```json
{
    "type": "sosu",
    "request": "launch",
    "name": "Debug the form",
    "package": "${workspaceFolder}/examples/form",
    "cwd": "${workspaceFolder}",
    "args": [],
    "env": { "SDL_VIDEO_DRIVER": "dummy" }
}
```

`package` is the folder of the package; `cwd` the folder the program runs in (the workspace by
default); `stopAtEntry` stops at the start; `release` builds optimized. The configuration builds
the program with `sosuc build`, then becomes a configuration of the C debugger.

For now, the debugger shows the variables under their C names: `v_count` for a variable `count`,
`f_name` for a field `name`, `t12` for a temporary.

## Development

The extension is plain JavaScript, without a build step: `src/extension.js` (VS Code), and
`src/sosu.js` (what does not need VS Code: packages, diagnostics, debugger configurations).

```sh
npm install
npm test          # node --test (src/sosu.js), and the highlighting tests of test/grammar
npm run package   # sosu-<version>.vsix
```

To try it in VS Code: open this folder and run "Run Extension" (F5), or install the `.vsix`.
Without Node.js installed, the same commands run in Docker:

```sh
docker run --rm -v "$PWD:/ext" -w /ext node:22 bash -c "npm install && npm test && npm run package"
```

The highlighting tests (`test/grammar/*.sosu`) use
[vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test): under a line of code,
a comment line marks columns with `^` and names the scopes they must have.

## Branches

- `main`: stable. It only receives `dev`, through a pull request.
- `dev`: integration of the finished features.
- `feature/<name>`: one branch per feature, created from `dev` and merged back into `dev`
  through a pull request, checked by the CI (`.github/workflows/ci.yml`).

## Next

- A language server in `sosuc` (`sosuc lsp`, spec §11.4 of Sosu): completion, go to definition,
  hover with the types, renaming, diagnostics while typing.
- Variables under their Sosu names in the debugger.
- A formatter for `.ui.sosu` files, when `sosuc` has one.
