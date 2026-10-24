// The Sosu extension: commands and tasks around `sosuc`, live diagnostics, formatting, and
// debugging through the C debuggers.
'use strict';

const vscode = require('vscode');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sosu = require('./sosu');

const LANGUAGES = ['sosu', 'sosu-ui'];
let diagnostics;
let output;
// The files that have diagnostics, per package folder, to clear them at the next check.
const reported = new Map();

function settings() {
    return vscode.workspace.getConfiguration('sosu');
}

function sosucPath() {
    return settings().get('path') || 'sosuc';
}

// The environment of sosuc: SOSU_HOME when the setting gives it.
function sosucEnv() {
    const home = settings().get('home');
    return home ? { ...process.env, SOSU_HOME: home } : process.env;
}

// Runs sosuc and gives its exit code and its outputs (it never rejects).
function runSosuc(args, cwd) {
    return new Promise((resolve) => {
        childProcess.execFile(sosucPath(), args, { cwd, env: sosucEnv(), maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error && error.code === 'ENOENT') {
                resolve({ code: -1, stdout: '', stderr: '', missing: true });
                return;
            }
            resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr });
        });
    });
}

let warnedMissing = false;
function warnMissing() {
    if (warnedMissing) return;
    warnedMissing = true;
    vscode.window
        .showErrorMessage(`sosuc was not found (\`${sosucPath()}\`). Set "sosu.path" to the compiler.`, 'Open settings')
        .then((choice) => {
            if (choice) vscode.commands.executeCommand('workbench.action.openSettings', 'sosu.path');
        });
}

// The package of the active editor, or of the only sosu.toml of the workspace, or null.
async function currentPackage(uri) {
    const target = uri || (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri);
    if (target && target.scheme === 'file') {
        const dir = fs.statSync(target.fsPath).isDirectory()
            ? (fs.existsSync(path.join(target.fsPath, 'sosu.toml')) ? target.fsPath : null)
            : sosu.findPackageDir(target.fsPath);
        if (dir) return dir;
    }
    const manifests = await vscode.workspace.findFiles('**/sosu.toml', '**/{build,node_modules}/**', 2);
    if (manifests.length === 1) return path.dirname(manifests[0].fsPath);
    if (manifests.length > 1) {
        const all = await vscode.workspace.findFiles('**/sosu.toml', '**/{build,node_modules}/**');
        const picked = await vscode.window.showQuickPick(
            all.map((m) => ({ label: vscode.workspace.asRelativePath(path.dirname(m.fsPath)), dir: path.dirname(m.fsPath) })),
            { placeHolder: 'Which Sosu package?' },
        );
        return picked ? picked.dir : null;
    }
    vscode.window.showWarningMessage('No Sosu package here: a package is a folder with a sosu.toml.');
    return null;
}

// ---- Diagnostics: `sosuc check --format=json` when a file is opened or saved ----

async function checkPackage(dir) {
    const result = await runSosuc(sosu.commandArgs('check', dir, { json: true }), dir);
    if (result.missing) {
        warnMissing();
        return;
    }
    const parsed = sosu.parseDiagnostics(result.stderr, dir);
    for (const file of reported.get(dir) || []) diagnostics.delete(vscode.Uri.file(file));
    const byFile = new Map();
    for (const d of parsed.diagnostics) {
        const item = new vscode.Diagnostic(
            new vscode.Range(d.start.line, d.start.character, d.end.line, Math.max(d.end.character, d.start.character + 1)),
            sosu.diagnosticText(d),
            d.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error,
        );
        item.code = d.code;
        item.source = 'sosuc';
        if (!byFile.has(d.file)) byFile.set(d.file, []);
        byFile.get(d.file).push(item);
    }
    for (const [file, items] of byFile) diagnostics.set(vscode.Uri.file(file), items);
    reported.set(dir, [...byFile.keys()]);
    if (parsed.other && result.code === 2) output.appendLine(parsed.other);
}

const pending = new Map();
function scheduleCheck(document) {
    if (!LANGUAGES.includes(document.languageId) || document.uri.scheme !== 'file') return;
    if (!settings().get('checkOnSave')) return;
    if (client) return;  // the language server checks while typing
    const dir = sosu.findPackageDir(document.uri.fsPath);
    if (!dir) return;
    clearTimeout(pending.get(dir));
    pending.set(dir, setTimeout(() => {
        pending.delete(dir);
        checkPackage(dir);
    }, 200));
}

// ---- The language server: `sosuc lsp` ----

let client = null;  // the running language client, or null (then: check on save)

async function startLanguageServer() {
    if (!settings().get('lsp')) return;
    const { LanguageClient } = require('vscode-languageclient/node');
    const candidate = new LanguageClient(
        'sosu',
        'Sosu language server',
        sosu.serverOptions(sosucPath(), sosucEnv()),
        { documentSelector: sosu.DOCUMENT_SELECTOR, outputChannel: output },
    );
    try {
        await candidate.start();
        client = candidate;
        // its diagnostics replace those of `sosuc check`
        diagnostics.clear();
        reported.clear();
    } catch (error) {
        // sosuc missing, or older than its language server: check on save instead
        output.appendLine(`The language server did not start (${error && error.message ? error.message : error}): the package is checked on save.`);
        try {
            await candidate.dispose();
        } catch (ignored) {
            // it never ran
        }
    }
}

async function stopLanguageServer() {
    const running = client;
    client = null;
    if (running) await running.stop();
}

async function restartLanguageServer() {
    await stopLanguageServer();
    await startLanguageServer();
    if (!client) vscode.workspace.textDocuments.forEach(scheduleCheck);
}

// ---- Commands and tasks ----

const COMMANDS = {
    run: 'Run the program',
    build: 'Build the program',
    test: 'Run the tests',
    check: 'Check without compiling',
};

function makeTask(definition, folder) {
    const dir = definition.package;
    const args = sosu.commandArgs(definition.command, dir, { release: definition.release });
    const task = new vscode.Task(
        definition,
        folder || vscode.TaskScope.Workspace,
        `${definition.command} ${path.basename(dir)}`,
        'sosu',
        new vscode.ProcessExecution(sosucPath(), args, { cwd: dir, env: sosucEnv() }),
        '$sosuc',
    );
    if (definition.command === 'build') task.group = vscode.TaskGroup.Build;
    if (definition.command === 'test') task.group = vscode.TaskGroup.Test;
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, clear: true };
    return task;
}

const taskProvider = {
    async provideTasks() {
        const manifests = await vscode.workspace.findFiles('**/sosu.toml', '**/{build,node_modules}/**');
        const tasks = [];
        for (const manifest of manifests) {
            const folder = vscode.workspace.getWorkspaceFolder(manifest);
            for (const command of Object.keys(COMMANDS)) {
                tasks.push(makeTask({ type: 'sosu', command, package: path.dirname(manifest.fsPath) }, folder));
            }
        }
        return tasks;
    },
    resolveTask(task) {
        const definition = task.definition;
        if (!definition.command) return undefined;
        const folder = task.scope && task.scope.uri ? task.scope : undefined;
        const dir = definition.package
            ? path.resolve(folder ? folder.uri.fsPath : '', definition.package)
            : folder && folder.uri.fsPath;
        return dir ? makeTask({ ...definition, package: dir }, folder) : undefined;
    },
};

async function runCommand(command, uri) {
    const dir = await currentPackage(uri);
    if (!dir) return;
    await vscode.workspace.saveAll(false);
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(dir));
    vscode.tasks.executeTask(makeTask({ type: 'sosu', command, package: dir }, folder));
}

// ---- Formatting: `sosuc fmt` on a copy of the document ----

const formatter = {
    async provideDocumentFormattingEdits(document) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sosu-fmt-'));
        const copy = path.join(dir, path.basename(document.uri.fsPath) || 'file.sosu');
        try {
            fs.writeFileSync(copy, document.getText(), 'utf8');
            const result = await runSosuc(['fmt', copy], dir);
            if (result.missing) {
                warnMissing();
                return [];
            }
            if (result.code !== 0) return [];  // syntax errors: the diagnostics show them
            const formatted = fs.readFileSync(copy, 'utf8');
            if (formatted === document.getText()) return [];
            const all = new vscode.Range(0, 0, document.lineCount, 0);
            return [vscode.TextEdit.replace(all, formatted)];
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    },
};

// ---- Debugging: build, then the C debugger on the program ----

const debugProvider = {
    provideDebugConfigurations(folder) {
        return [{
            type: 'sosu',
            request: 'launch',
            name: 'Debug the Sosu program',
            package: folder ? '${workspaceFolder}' : '${fileDirname}',
        }];
    },

    async resolveDebugConfiguration(folder, config) {
        if (!config.type && !config.request && !config.name) {  // F5 without launch.json
            const editor = vscode.window.activeTextEditor;
            if (!editor || !LANGUAGES.includes(editor.document.languageId)) return config;
            config = { type: 'sosu', request: 'launch', name: 'Debug the Sosu program' };
        }
        if (!vscode.extensions.getExtension('ms-vscode.cpptools')) {
            const choice = await vscode.window.showErrorMessage(
                'Debugging Sosu uses the C/C++ extension of Microsoft (ms-vscode.cpptools): the generated C keeps the lines of the .sosu files.',
                'Install it',
            );
            if (choice) vscode.commands.executeCommand('workbench.extensions.installExtension', 'ms-vscode.cpptools');
            return undefined;
        }
        const dir = config.package
            ? path.resolve(folder ? folder.uri.fsPath : '', config.package)
            : await currentPackage();
        if (!dir) return undefined;
        const manifest = path.join(dir, 'sosu.toml');
        if (!fs.existsSync(manifest)) {
            vscode.window.showErrorMessage(`No sosu.toml in ${dir}.`);
            return undefined;
        }
        const name = sosu.packageName(fs.readFileSync(manifest, 'utf8'));
        await vscode.workspace.saveAll(false);
        const built = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Building ${name}...` },
            () => runSosuc(sosu.commandArgs('build', dir, { release: config.release, json: true }), dir),
        );
        if (built.missing) {
            warnMissing();
            return undefined;
        }
        if (built.code !== 0) {
            if (!client) await checkPackage(dir);
            output.appendLine(built.stderr);
            vscode.window.showErrorMessage(`The build of ${name} failed: see the Problems panel.`, 'Show problems')
                .then((choice) => { if (choice) vscode.commands.executeCommand('workbench.actions.view.problems'); });
            return undefined;
        }
        const cwd = folder ? folder.uri.fsPath : dir;
        return sosu.debuggerConfiguration(config, sosu.executablePath(dir, name), cwd);
    },
};

function activate(context) {
    diagnostics = vscode.languages.createDiagnosticCollection('sosu');
    output = vscode.window.createOutputChannel('Sosu');
    context.subscriptions.push(diagnostics, output);

    for (const command of Object.keys(COMMANDS)) {
        context.subscriptions.push(vscode.commands.registerCommand(`sosu.${command}`, (uri) => runCommand(command, uri)));
    }
    context.subscriptions.push(
        vscode.tasks.registerTaskProvider('sosu', taskProvider),
        vscode.languages.registerDocumentFormattingEditProvider({ language: 'sosu', scheme: 'file' }, formatter),
        vscode.debug.registerDebugConfigurationProvider('sosu', debugProvider),
        vscode.workspace.onDidSaveTextDocument(scheduleCheck),
        vscode.workspace.onDidOpenTextDocument(scheduleCheck),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (['sosu.lsp', 'sosu.path', 'sosu.home'].some((key) => event.affectsConfiguration(key))) restartLanguageServer();
        }),
    );
    startLanguageServer().then(() => {
        if (!client) vscode.workspace.textDocuments.forEach(scheduleCheck);
    });
}

function deactivate() {
    return stopLanguageServer();
}

module.exports = { activate, deactivate };
