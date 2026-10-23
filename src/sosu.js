// What the extension knows about Sosu, without VS Code: packages, the diagnostics of sosuc,
// and the configurations of the C debuggers. Tested with `node --test` (test/sosu.test.js).
'use strict';

const fs = require('fs');
const path = require('path');

// The folder of the package that holds `file`: the nearest one up with a sosu.toml, or null.
function findPackageDir(file, exists = fs.existsSync) {
    let dir = path.dirname(path.resolve(file));
    for (;;) {
        if (exists(path.join(dir, 'sosu.toml'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

// The `name` of the [package] section of a sosu.toml, or null.
function packageName(toml) {
    let inPackage = false;
    for (const raw of toml.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        const section = /^\[([^\]]+)\]$/.exec(line);
        if (section) {
            inPackage = section[1].trim() === 'package';
            continue;
        }
        const name = /^name\s*=\s*"([^"]*)"$/.exec(line);
        if (inPackage && name) return name[1];
    }
    return null;
}

// The program `sosuc build` writes for a package: build/<name>, or build/<name>.exe.
function executablePath(packageDir, name, platform = process.platform) {
    return path.join(packageDir, 'build', platform === 'win32' ? `${name}.exe` : name);
}

// The diagnostics of `sosuc ... --format=json`, from its standard error: a JSON array, maybe
// with lines around it (a fatal error, the output of the C compiler). Each diagnostic gets an
// absolute `file`, resolved from the folder sosuc ran in. `other` is the rest of the text.
function parseDiagnostics(stderr, cwd) {
    const start = stderr.search(/^\[/m);
    const end = stderr.lastIndexOf(']');
    if (start < 0 || end < start) return { diagnostics: [], other: stderr.trim() };
    let list;
    try {
        list = JSON.parse(stderr.slice(start, end + 1));
    } catch (e) {
        return { diagnostics: [], other: stderr.trim() };
    }
    const diagnostics = list.map((d) => ({
        severity: d.severity === 'warning' ? 'warning' : d.severity === 'note' ? 'information' : 'error',
        code: d.code,
        message: d.message,
        help: d.help || null,
        file: path.resolve(cwd, d.file),
        // sosuc counts lines and columns from 1; the end is just after the span
        start: { line: d.line - 1, character: d.column - 1 },
        end: { line: d.end_line - 1, character: d.end_column - 1 },
    }));
    const other = (stderr.slice(0, start) + stderr.slice(end + 1)).trim();
    return { diagnostics, other };
}

// The message shown for a diagnostic: its text, then its help.
function diagnosticText(d) {
    return d.help ? `${d.message}\nhelp: ${d.help}` : d.message;
}

// The configuration of the C debugger for a Sosu program: the generated C keeps `#line`
// directives to the .sosu files, so breakpoints and steps follow the Sosu source.
// `cppvsdbg` (MSVC) on Windows, `cppdbg` with gdb (Linux) or lldb (macOS) elsewhere; both come
// with the C/C++ extension of Microsoft (ms-vscode.cpptools).
function debuggerConfiguration(config, program, cwd, platform = process.platform) {
    const common = {
        name: config.name || 'Sosu',
        request: 'launch',
        program,
        args: config.args || [],
        cwd: config.cwd || cwd,
        stopAtEntry: Boolean(config.stopAtEntry),
    };
    const environment = Object.entries(config.env || {}).map(([name, value]) => ({ name, value: String(value) }));
    if (platform === 'win32') {
        return { ...common, type: 'cppvsdbg', console: 'integratedTerminal', environment };
    }
    return {
        ...common,
        type: 'cppdbg',
        MIMode: platform === 'darwin' ? 'lldb' : 'gdb',
        externalConsole: false,
        environment,
        setupCommands: [{ description: 'Pretty printing', text: '-enable-pretty-printing', ignoreFailures: true }],
    };
}

// The arguments of sosuc for a command on a package.
function commandArgs(command, packageDir, options = {}) {
    const args = [command, packageDir];
    if (options.release && command !== 'check') args.push('--release');
    if (options.json) args.push('--format=json');
    return args;
}

// How the language client starts `sosuc lsp`: the compiler, with SOSU_HOME when it is set.
function serverOptions(sosucPath, env) {
    return { command: sosucPath, args: ['lsp'], options: { env } };
}

// The documents the language server handles: Sosu and interface files on disk.
const DOCUMENT_SELECTOR = [
    { scheme: 'file', language: 'sosu' },
    { scheme: 'file', language: 'sosu-ui' },
];

module.exports = {
    findPackageDir,
    packageName,
    executablePath,
    parseDiagnostics,
    diagnosticText,
    debuggerConfiguration,
    commandArgs,
    serverOptions,
    DOCUMENT_SELECTOR,
};
