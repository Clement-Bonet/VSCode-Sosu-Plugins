// Tests of src/sosu.js, without VS Code: `node --test test/`.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const pkg = require('../package.json');
const sosu = require('../src/sosu');

test('the package of a file is the nearest folder up with a sosu.toml', () => {
    const root = path.resolve('/work/app');
    const exists = (file) => file === path.join(root, 'sosu.toml');
    assert.strictEqual(sosu.findPackageDir(path.join(root, 'src', 'ui', 'main.sosu'), exists), root);
    assert.strictEqual(sosu.findPackageDir(path.resolve('/elsewhere/main.sosu'), exists), null);
});

test('the name of a package is read from its [package] section', () => {
    const toml = '# a comment\n[package]\nname = "form"  # the name\nversion = "0.1.0"\n\n[dependencies]\nname = "other"\n';
    assert.strictEqual(sosu.packageName(toml), 'form');
    assert.strictEqual(sosu.packageName('[dependencies]\nname = "x"\n'), null);
    assert.strictEqual(sosu.packageName('[package]\r\nname = "crlf"\r\n'), 'crlf');
});

test('the program of a package is in its build folder', () => {
    assert.strictEqual(sosu.executablePath('/p', 'form', 'win32'), path.join('/p', 'build', 'form.exe'));
    assert.strictEqual(sosu.executablePath('/p', 'form', 'linux'), path.join('/p', 'build', 'form'));
});

test('the JSON diagnostics of sosuc are read, lines and columns from 0', () => {
    const stderr = [
        '[',
        ' {"severity":"error","code":"E0331","message":"expected `str`, found `i32`","file":"src/screen.ui.sosu",'
            + '"line":3,"column":10,"end_line":3,"end_column":15,"help":"write \\"x\\""},',
        ' {"severity":"warning","code":"E0999","message":"m","file":"/abs/lib.sosu","line":1,"column":1,"end_line":2,"end_column":1,"help":null}',
        ']',
        'sosuc: the C compiler failed',
    ].join('\n');
    const parsed = sosu.parseDiagnostics(stderr, '/work/app');
    assert.strictEqual(parsed.diagnostics.length, 2);
    const first = parsed.diagnostics[0];
    assert.strictEqual(first.file, path.resolve('/work/app', 'src/screen.ui.sosu'));
    assert.deepStrictEqual(first.start, { line: 2, character: 9 });
    assert.deepStrictEqual(first.end, { line: 2, character: 14 });
    assert.strictEqual(first.severity, 'error');
    assert.strictEqual(sosu.diagnosticText(first), 'expected `str`, found `i32`\nhelp: write "x"');
    assert.strictEqual(parsed.diagnostics[1].severity, 'warning');
    assert.strictEqual(sosu.diagnosticText(parsed.diagnostics[1]), 'm');
    assert.strictEqual(parsed.other, 'sosuc: the C compiler failed');
});

test('no diagnostics, or no JSON at all', () => {
    assert.deepStrictEqual(sosu.parseDiagnostics('[]\n', '/w').diagnostics, []);
    const fatal = sosu.parseDiagnostics('sosuc: no sosu.toml in `/w`\n', '/w');
    assert.deepStrictEqual(fatal.diagnostics, []);
    assert.strictEqual(fatal.other, 'sosuc: no sosu.toml in `/w`');
});

test('the C debugger: MSVC on Windows, gdb on Linux, lldb on macOS', () => {
    const windows = sosu.debuggerConfiguration({ name: 'D', args: ['a'], env: { X: 1 } }, 'p.exe', '/w', 'win32');
    assert.strictEqual(windows.type, 'cppvsdbg');
    assert.deepStrictEqual(windows.args, ['a']);
    assert.deepStrictEqual(windows.environment, [{ name: 'X', value: '1' }]);
    assert.strictEqual(windows.cwd, '/w');
    const linux = sosu.debuggerConfiguration({ cwd: '/elsewhere', stopAtEntry: true }, 'p', '/w', 'linux');
    assert.strictEqual(linux.type, 'cppdbg');
    assert.strictEqual(linux.MIMode, 'gdb');
    assert.strictEqual(linux.cwd, '/elsewhere');
    assert.strictEqual(linux.stopAtEntry, true);
    assert.strictEqual(sosu.debuggerConfiguration({}, 'p', '/w', 'darwin').MIMode, 'lldb');
});

test('the arguments of sosuc', () => {
    assert.deepStrictEqual(sosu.commandArgs('run', '/p'), ['run', '/p']);
    assert.deepStrictEqual(sosu.commandArgs('build', '/p', { release: true, json: true }), ['build', '/p', '--release', '--format=json']);
    assert.deepStrictEqual(sosu.commandArgs('check', '/p', { release: true }), ['check', '/p']);
});

test('the problem matcher reads the text diagnostics of sosuc', () => {
    const matcher = pkg.contributes.problemMatchers.find((m) => m.name === 'sosuc');
    const first = new RegExp(matcher.pattern[0].regexp).exec('error[E0331]: expected `str`, found `i32`');
    assert.deepStrictEqual([first[1], first[2], first[3]], ['error', 'E0331', 'expected `str`, found `i32`']);
    const second = new RegExp(matcher.pattern[1].regexp).exec('  --> tests/packages/bad_ui/src/screen.ui.sosu:3:10');
    assert.deepStrictEqual([second[1], second[2], second[3]], ['tests/packages/bad_ui/src/screen.ui.sosu', '3', '10']);
    const runtime = pkg.contributes.problemMatchers.find((m) => m.name === 'sosu-runtime');
    const failed = new RegExp(runtime.pattern.regexp).exec('    src/main.sosu:12:5: assertion failed: x > 0');
    assert.deepStrictEqual([failed[1], failed[2], failed[3], failed[4]], ['src/main.sosu', '12', '5', 'assertion failed: x > 0']);
});

test('every command of the manifest is contributed with a title', () => {
    const commands = pkg.contributes.commands.map((c) => c.command).sort();
    assert.deepStrictEqual(commands, ['sosu.build', 'sosu.check', 'sosu.run', 'sosu.test']);
});

test('the language server is `sosuc lsp`, for Sosu and interface files on disk', () => {
    const env = { SOSU_HOME: '/opt/sosu' };
    assert.deepStrictEqual(sosu.serverOptions('/bin/sosuc', env), { command: '/bin/sosuc', args: ['lsp'], options: { env } });
    assert.deepStrictEqual(sosu.DOCUMENT_SELECTOR.map((s) => s.language), ['sosu', 'sosu-ui']);
    assert.ok(sosu.DOCUMENT_SELECTOR.every((s) => s.scheme === 'file'));
    const lsp = pkg.contributes.configuration.properties['sosu.lsp'];
    assert.strictEqual(lsp.default, true);
    assert.ok(pkg.dependencies['vscode-languageclient'], 'a runtime dependency, packaged in the .vsix');
});
