// Main-thread side of the in-browser Python runner (worker: /js/py-worker.js).
// Python runs in a Web Worker so an infinite loop can be stopped by killing it.
// run() resolves with { stdout, error, testError, passed, timedOut }.
const TIMEOUT_MS = 6000;

let worker = null;
let nextId = 1;
const pending = new Map();

function start() {
  worker = new Worker('/js/py-worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (p) { pending.delete(e.data.id); clearTimeout(p.timer); p.resolve(e.data); }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.resolve({ error: `The Python runner failed to start: ${e.message || 'unknown error'}` }); }
    pending.clear();
    worker = null;
  };
}

function send(msg, timeout) {
  if (!worker) start();
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = timeout ? setTimeout(() => {
      pending.delete(id);
      worker.terminate();
      worker = null; // a fresh worker next time
      resolve({ id, stdout: '', error: 'Timed out: your program ran for more than 6 seconds. Is there a loop that never stops?', timedOut: true });
    }, timeout) : null;
    pending.set(id, { resolve, timer });
    worker.postMessage({ ...msg, id });
  });
}

/** Load Python in the background so the first Run is fast. */
export const warmup = () => send({ warmup: true }, 0);

const norm = (s) => String(s || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();

export async function runPython(code, { expected_output = '', tests = '' } = {}) {
  await warmup(); // first load can take a few seconds; do not count it against the timeout
  const r = await send({ code, tests }, TIMEOUT_MS);
  let passed = !r.error && !r.testError;
  let mismatch = null;
  if (passed && expected_output) {
    if (norm(r.stdout) !== norm(expected_output)) {
      passed = false;
      mismatch = 'Output does not match the expected output yet.';
    }
  }
  return { ...r, passed, mismatch };
}
