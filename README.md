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
- **Language server** (`sosuc lsp`): the errors while typing, underlined with their help; the type
  of what is under the mouse (signatures of functions and methods, types of variables and
  fields); go to definition (`F12`, `Ctrl+click`); completion of the members after `.` and of the
  names in scope. It works on the package of the file, with the text of the open files.
- **Check on save**, without the language server (setting `sosu.lsp` off, or a `sosuc` without
  it): when a Sosu file is opened or saved, its package is checked (`sosuc check --format=json`),
  and the errors are underlined.
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

The extension is not on the Marketplace. Its `.vsix` comes from the Releases page of the
repository (see [Releases](#releases)), from the artifact `sosu-vsix` of a run of the CI, from
`npm run package`, or from Docker without Node.js (see [Development](#development)). Then, in
VS Code: Extensions > `...` > Install from VSIX, or:

```sh
code --install-extension sosu-0.1.0.vsix
```

## Releases

The workflow `Release` (`.github/workflows/release.yml`) builds the `.vsix`, after the tests, and
attaches it to a GitHub Release. Its assets are downloaded from the Releases page, or with
`gh release download <tag> --repo Clement-Bonet/VSCode-Sosu-Plugins`; unlike the artifacts of
the CI, they do not count in the storage quota of the account.

- **A version**: set `version` in `package.json`, merge it, then push the tag of that version:
  `git tag v0.2.0` and `git push origin v0.2.0`. The release `v0.2.0` is created, with its notes
  generated from the pull requests merged since the previous one. A tag that does not match the
  version of `package.json` stops the workflow.
- **To try a branch**: Actions > Release > Run workflow, then pick the branch. It publishes a
  pre-release `v<version>-build.<run>` of its last commit. GitHub shows this button once the
  workflow is on the default branch, `main`.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `sosu.path` | `sosuc` | the compiler |
| `sosu.home` | (empty) | the Sosu installation whose `lib` holds `core` and `std` (`SOSU_HOME`); empty: next to `sosuc` |
| `sosu.lsp` | `true` | use the language server of `sosuc` (`sosuc lsp`) |
| `sosu.checkOnSave` | `true` | without the language server: check the package when a file is opened or saved |

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
`src/sosu.js` (what does not need VS Code: packages, diagnostics, debugger configurations, the
language server command). Its one runtime dependency, `vscode-languageclient`, is packaged in the
`.vsix` from `node_modules`.

```sh
npm install
npm test          # node --test (src/sosu.js), and the highlighting tests of test/grammar
npm run package   # sosu-<version>.vsix
```

To try it in VS Code: open this folder and run "Run Extension" (F5), or install the `.vsix`.
Without Node.js installed, the same commands run in Docker, from the folder of the extension.
Docker Desktop must be running (on Windows, its whale in the taskbar): otherwise `docker` answers
"failed to connect to the docker API". The command depends on the shell:

```powershell
# PowerShell (Windows)
docker run --rm -v "${PWD}:/ext" -w /ext node:22 bash -c "npm ci && npm test && npm run package"
```

```sh
# Git Bash (Windows): MSYS must not rewrite the paths, and `pwd -W` gives D:/...
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/ext" -w /ext node:22 bash -c "npm ci && npm test && npm run package"

# Linux, macOS
docker run --rm -v "$PWD:/ext" -w /ext node:22 bash -c "npm ci && npm test && npm run package"
```

`sosu-<version>.vsix` is then in the folder of the extension.

The highlighting tests (`test/grammar/*.sosu`) use
[vscode-tmgrammar-test](https://github.com/PanAeon/vscode-tmgrammar-test): under a line of code,
a comment line marks columns with `^` and names the scopes they must have.

## Branches

- `main`: stable. It only receives `dev`, through a pull request.
- `dev`: integration of the finished features.
- `feature/<name>`: one branch per feature, created from `dev` and merged back into `dev`
  through a pull request, checked by the CI (`.github/workflows/ci.yml`).

## Next

- In the language server: renaming, the references of a name, signature help.
- Variables under their Sosu names in the debugger.
- A formatter for `.ui.sosu` files, when `sosuc` has one.

## License

Licensed under either of

- the Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE)), or
- the MIT license ([LICENSE-MIT](LICENSE-MIT)),

at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in
the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without
any additional terms or conditions.
