const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");

async function engine({ cosmetic = false, hasTest = true, result = true, throws = false } = {}) {
  const built = await esbuild.build({
    entryPoints: [path.join(root, "src/consent.js")], bundle: true, write: false, format: "iife",
    plugins: [{ name: "fake-cmp", setup(build) {
      build.onResolve({ filter: /^@duckduckgo\/autoconsent$/ }, () => ({ path: "engine", namespace: "fake" }));
      build.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ contents: `export default class {
        constructor(send) { globalThis.engine = this; this.send = send; this.foundCmp = {hasSelfTest: globalThis.hasTest}; }
        async doSelfTest() { globalThis.checks++; if (globalThis.throws) throw Error('check failed'); return globalThis.result; }
        receiveMessageCallback() {}
      }` }));
    } }]
  });
  const sent = [];
  const context = { hasTest, result, throws, checks: 0, location: { href: "https://example.com/" }, chrome: {
    runtime: { sendMessage: async message => { sent.push(message); }, onMessage: { addListener() {} } }
  } };
  vm.runInNewContext(built.outputFiles[0].text, context);
  context.engine.send({ type: "autoconsentDone", isCosmetic: cosmetic });
  await new Promise(setImmediate);
  return { sent, context, status: sent.find(m => m.type === "tt-consent-status")?.status };
}

test("a cosmetic rule is hidden, never a checked rejection", async () => {
  const h = await engine({ cosmetic: true });
  assert.equal(h.status, "hidden");
  assert.equal(h.context.checks, 0);
});
test("a rejection requires a passing self-test", async () => {
  assert.equal((await engine()).status, "declined");
  assert.equal((await engine({ result: false })).status, "attempted");
  assert.equal((await engine({ throws: true })).status, "attempted");
  assert.equal((await engine({ hasTest: false })).status, "attempted");
});
