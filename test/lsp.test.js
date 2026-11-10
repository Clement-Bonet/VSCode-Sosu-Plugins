// The extension and `sosuc lsp` together: a session of the Language Server Protocol, as
// VS Code holds it, on the package test/lsp/hello. `node --test test/`.
//
// sosuc is $SOSUC, or found as the extension finds it. Without one, the test is skipped, unless
// SOSU_LSP_TEST=required (the CI installs sosuc with install.sh first). What came after a version
// of sosuc (prepareRename, the outline, signature help) is tested when the server offers it.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');
const sosu = require('../src/sosu');

const SOSUC = process.env.SOSUC || sosu.findSosuc('sosuc');
const AVAILABLE = childProcess.spawnSync(SOSUC, ['--version']).status === 0;
const SKIP = !AVAILABLE && process.env.SOSU_LSP_TEST !== 'required' && `no sosuc (${SOSUC}): set SOSUC to run it`;

const ROOT = path.join(__dirname, 'lsp', 'hello');
const MAIN = path.join(ROOT, 'src', 'main.sosu');
const MAIN_URI = url.pathToFileURL(MAIN).href;
const GOOD = fs.readFileSync(MAIN, 'utf8').replace(/\r\n/g, '\n');

// A client of the protocol: messages framed by Content-Length on the pipes of the server.
class Client {
    constructor(command) {
        this.server = childProcess.spawn(command, ['lsp'], { stdio: ['pipe', 'pipe', 'inherit'] });
        this.buffer = Buffer.alloc(0);
        this.next = 1;
        this.pending = new Map();
        this.notifications = [];
        this.waiting = [];
        this.server.stdout.on('data', (data) => this.receive(data));
    }

    receive(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
        for (;;) {
            const end = this.buffer.indexOf('\r\n\r\n');
            if (end < 0) return;
            const length = Number(/Content-Length: *(\d+)/i.exec(this.buffer.slice(0, end).toString())[1]);
            if (this.buffer.length < end + 4 + length) return;
            const message = JSON.parse(this.buffer.slice(end + 4, end + 4 + length).toString('utf8'));
            this.buffer = this.buffer.slice(end + 4 + length);
            if (message.id !== undefined && this.pending.has(message.id)) {
                this.pending.get(message.id)(message);
                this.pending.delete(message.id);
            } else {
                this.notifications.push(message);
                this.waiting = this.waiting.filter((w) => !w(message));
            }
        }
    }

    send(message) {
        const text = JSON.stringify({ jsonrpc: '2.0', ...message });
        this.server.stdin.write(`Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
    }

    // The response to a request: its `result`, or its `error`.
    request(method, params) {
        const id = this.next++;
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
            this.send({ id, method, params });
        });
    }

    notify(method, params) {
        this.send({ method, params });
    }

    // The next notification that `accept` takes.
    expect(accept) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('no such notification within 20 s')), 20000);
            this.waiting.push((message) => {
                if (!accept(message)) return false;
                clearTimeout(timer);
                resolve(message);
                return true;
            });
        });
    }
}

// The position of `needle` in `text`, plus `delta` characters.
function at(text, needle, delta = 0) {
    const index = text.indexOf(needle);
    assert.ok(index >= 0, `\`${needle}\` is in the text`);
    const before = text.slice(0, index).split('\n');
    return { line: before.length - 1, character: before[before.length - 1].length + delta };
}

function position(text, needle, delta) {
    return { textDocument: { uri: MAIN_URI }, position: at(text, needle, delta) };
}

function diagnosticsOf(uri) {
    return (m) => m.method === 'textDocument/publishDiagnostics' && path.resolve(url.fileURLToPath(m.params.uri)) === path.resolve(url.fileURLToPath(uri));
}

test('a session with sosuc lsp', { skip: SKIP, timeout: 120000 }, async () => {
    const client = new Client(SOSUC);
    try {
        const init = await client.request('initialize', { processId: process.pid, rootUri: url.pathToFileURL(ROOT).href, capabilities: {} });
        const caps = init.result.capabilities;
        assert.strictEqual(init.result.serverInfo.name, 'sosuc');
        assert.ok(caps.hoverProvider && caps.definitionProvider && caps.referencesProvider && caps.renameProvider, JSON.stringify(caps));
        client.notify('initialized', {});

        // errors while typing, then none
        const bad = GOOD.replace('i32 count = twice(2);', 'i32 count = "two";');
        let published = client.expect(diagnosticsOf(MAIN_URI));
        client.notify('textDocument/didOpen', { textDocument: { uri: MAIN_URI, languageId: 'sosu', version: 1, text: bad } });
        const errors = (await published).params.diagnostics;
        assert.ok(errors.length > 0 && errors[0].severity === 1 && errors[0].range.start.line === 7, JSON.stringify(errors));
        published = client.expect(diagnosticsOf(MAIN_URI));
        client.notify('textDocument/didChange', { textDocument: { uri: MAIN_URI, version: 2 }, contentChanges: [{ text: GOOD }] });
        assert.deepStrictEqual((await published).params.diagnostics, []);

        const hover = await client.request('textDocument/hover', position(GOOD, 'count - 4'));
        assert.match(hover.result.contents.value, /i32 count/);

        const definition = await client.request('textDocument/definition', position(GOOD, 'twice(2)'));
        assert.deepStrictEqual(definition.result.range.start, { line: 2, character: 4 });

        const references = await client.request('textDocument/references', { ...position(GOOD, 'count - 4'), context: { includeDeclaration: true } });
        assert.strictEqual(references.result.length, 3, JSON.stringify(references.result));

        const rename = await client.request('textDocument/rename', { ...position(GOOD, 'count - 4'), newName: 'total' });
        const edits = Object.values(rename.result.changes).flat();
        assert.strictEqual(edits.length, 3, JSON.stringify(rename.result));
        assert.ok(edits.every((e) => e.newText === 'total'));
        const keyword = await client.request('textDocument/rename', { ...position(GOOD, 'count - 4'), newName: 'return' });
        assert.ok(keyword.error, 'a keyword is not a name');

        if (caps.renameProvider.prepareProvider) {
            const prepared = await client.request('textDocument/prepareRename', position(GOOD, 'count - 4', 2));
            assert.strictEqual(prepared.result.placeholder, 'count');
            const clash = await client.request('textDocument/rename', { ...position(GOOD, 'twice(2)'), newName: 'main' });
            assert.ok(clash.error, `a function named as another: ${JSON.stringify(clash)}`);
        }
        if (caps.documentSymbolProvider) {
            const symbols = await client.request('textDocument/documentSymbol', { textDocument: { uri: MAIN_URI } });
            assert.deepStrictEqual(symbols.result.map((s) => s.name), ['twice', 'main']);
        }
        if (caps.signatureHelpProvider) {
            const help = await client.request('textDocument/signatureHelp', position(GOOD, 'twice(2)', 6));
            assert.strictEqual(help.result.signatures[0].label, 'i32 twice(i32 value)');
            assert.strictEqual(help.result.activeParameter, 0);
        }

        const shutdown = await client.request('shutdown', null);
        assert.strictEqual(shutdown.result, null);
        const exited = new Promise((resolve) => client.server.on('exit', resolve));
        client.notify('exit', null);
        assert.strictEqual(await exited, 0);
    } finally {
        client.server.kill();
    }
});
