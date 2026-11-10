# VSCode-Sosu-Plugins

The Visual Studio Code extension for [Sosu](https://github.com/Clement-Bonet/Sosu).

## Features

- **Highlighting** of `.sosu` files (language `sosu`) and of `.ui.sosu` interface files (language
  `sosu-ui`: windows, components, nodes and their properties, with Sosu expressions inside), and
  of the catalogs of translations `<name>.locale.<language>.sosu` (language `sosu-locale`: the
  content of gettext, its keywords, comments, escapes and `{values}`; no diagnostics in them).
- **Editing**: comments (`Ctrl+/`), brackets and quotes closed as you type, indentation, folding
  (`// region` ... `// endregion`), and snippets (`main`, `fn`, `fnc`, `struct`, `class`, `enum`,
  `match`, `for`, `arena`, `test`, `extern`; `window`, `column`, `button`, `textfield`, `radio`,
  `list`... in `.ui.sosu` files).
- **Commands** (`Ctrl+Shift+P`, then "Sosu"): Run the program (`Ctrl+F5`, or the run button of
  the editor), Build the program, Run the tests, Check without compiling, Generate the
  documentation. They work on the package of the file being edited: the nearest folder up with
  a `sosu.toml`. Run, Run the tests, Build and Generate the documentation are also in the menu of
  a `sosu.toml` in the Explorer.
- **Tasks**: the same commands as tasks of type `sosu` (Terminal > Run Task), with the problem
  matcher `$sosuc`: the errors of the compiler go to the Problems panel.
- **Language server** (`sosuc lsp`): the errors while typing, underlined with their help; the type
  of what is under the mouse (signatures of functions and methods, types of variables and
  fields); go to definition (`F12`, `Ctrl+click`); the references of a name (`Shift+F12`, in
  every file of the program); rename (`F2`: the declaration and every reference, in every file;
  a keyword, a name of `core` or `std` or a module is refused before you type, and so is a new
  name that would change the program: one already declared there, or one that would hide another
  name or be hidden by it); completion of the members after `.` and of the names in scope;
  signature help (the parameters of the function being called, and the one being written, as
  you type `(` and `,`); the outline of the file (the Outline view, the breadcrumbs, Go to Symbol
  in Editor with `Ctrl+Shift+O`). It works on the package of the file, with the text of the open
  files. References and rename need a `sosuc` of 0.5 or later; signature help, the outline and
  the checks before a rename, a `sosuc` later than 0.5.4.
- **Check on save**, without the language server (setting `sosu.lsp` off, or a `sosuc` without
  it): when a Sosu file is opened or saved, its package is checked (`sosuc check --format=json`),
  and the errors are underlined.
- **Formatting**: Format Document (`Shift+Alt+F`) runs `sosuc fmt` on `.sosu` and `.ui.sosu` files.
  From Sosu 0.5, it breaks the lines longer than 120 characters.
- **Documentation**: Generate the documentation runs `sosuc doc` on the package (Sosu 0.5 or
  later) and opens the preview of `build/doc/<name>.md`: its modules, what they make `pub`, and
  the comments written above it.
- **Debugging**: `F5` builds the package, then debugs the program with the C debugger of
  VS Code. The C that `sosuc` generates keeps `#line` directives to the `.sosu` files: breakpoints
  are set in the Sosu source, and steps follow it.

## Requirements

- `sosuc`, from the installers of Sosu (`install.ps1`, `install.sh`, the Windows setup, the `.deb`
  or the macOS `.pkg`: see its [releases](https://github.com/Clement-Bonet/Sosu/releases)), or
  built from the Sosu repository (`build.bat` on Windows, `make` elsewhere). The extension runs
  the `sosuc` of the `PATH`; when there is none, as in a VS Code started before the installation,
  it looks where the installers put it: `%LOCALAPPDATA%\Programs\Sosu\bin` on Windows,
  `~/.local/bin`, `/usr/local/bin` and `/usr/bin` elsewhere. Any other place goes in the setting
  `sosu.path`.
- For debugging: the [C/C++ extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools)
  of Microsoft. It debugs with MSVC (`cppvsdbg`) on Windows, gdb on Linux and lldb on macOS.

## Installing

The extension is not on the Marketplace. Its `.vsix` comes from the Releases page of the
repository (see [Releases](#releases)), from the artifact `sosu-vsix` of a run of the CI, from
`npm run package`, or from Docker without Node.js (see [Development](#development)). Then, in
VS Code: Extensions > `...` > Install from VSIX, or:

```sh
code --install-extension sosu-0.3.0.vsix
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
npm test          # node --test (src/sosu.js, a session with sosuc lsp), and the highlighting tests
npm run package   # sosu-<version>.vsix
```

`test/lsp.test.js` holds a session of the language protocol with `sosuc lsp` on the package
`test/lsp/hello`: diagnostics, hover, definition, references, rename, and what the server offers
beyond them. It runs the `sosuc` that the extension would find, or `$SOSUC`, and is skipped
without one (the CI sets `SOSU_LSP_TEST=required`, after installing the latest `sosuc` with
`install.sh`).

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

## Publishing

The extension goes on the Visual Studio Marketplace and on Open VSX (for VSCodium, Cursor and
the other editors built on VS Code) when Sosu launches, at 1.0. Until then the workflow `Publish`
(`.github/workflows/publish.yml`) refuses a version below 1.0.0. What is to be done once:

1. **Marketplace**: sign in to <https://marketplace.visualstudio.com/manage> with a Microsoft
   account and create the publisher `clement-bonet` (the `publisher` of `package.json`). In
   Azure DevOps (<https://dev.azure.com>), create a personal access token for all accessible
   organizations, with the scope Marketplace > Manage, and save it as the secret `VSCE_PAT` of
   the repository (Settings > Secrets and variables > Actions).
2. **Open VSX**: sign in to <https://open-vsx.org> with GitHub, sign the publisher agreement of
   the Eclipse Foundation in the profile, create an access token, and save it as the secret
   `OVSX_PAT`. Then create the namespace once: `npx ovsx create-namespace clement-bonet -p <token>`.
3. **Each version**: set `version` in `package.json` (1.0.0 or later) and add its entry to
   `CHANGELOG.md`, merge it into `main`, then Actions > Publish > Run workflow on `main`. It runs
   the tests, builds the `.vsix` and publishes it on both, or on the one picked. The release on
   GitHub stays the workflow `Release`, on the tag of the version.

Both stores show this README, `CHANGELOG.md` and the icon. A version is published once: a fix is
a new version.

## Next

- Variables under their Sosu names in the debugger.

## License

Licensed under either of

- the Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE)), or
- the MIT license ([LICENSE-MIT](LICENSE-MIT)),

at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in
the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without
any additional terms or conditions.
