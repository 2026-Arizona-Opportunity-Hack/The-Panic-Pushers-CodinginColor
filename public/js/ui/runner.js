// Main-thread side of the in-browser Python runner (worker: /js/py-worker.js).
// Python runs in a Web Worker so an infinite loop can be stopped by killing it.
// runPython() resolves with { stdout, error, testError, passed, mismatch, timedOut }.
//
// Rules that keep a button from spinning forever:
//  - One request at a time. Runs queue here, so a run's 6-second clock starts
//    when it actually starts, not while it waits behind another run.
//  - Whenever the worker is stopped (timeout, crash), every request still
//    waiting is answered, never left hanging.
//  - Loading Python has its own (long) time limit with a clear message.
const RUN_TIMEOUT_MS = 6000;
const LOAD_TIMEOUT_MS = 60000;

let worker = null;
let nextId = 1;
let current = null;            // the request in flight: { id, resolve, timer }
let queue = Promise.resolve(); // serialises requests

function stopWorker(reason) {
  if (worker) worker.terminate();
  worker = null;
  if (current) {
    clearTimeout(current.timer);
    current.resolve({ stdout: '', error: reason });
    current = null;
  }
}

function start() {
  worker = new Worker('/js/py-worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    if (!current || e.data.id !== current.id) return;
    clearTimeout(current.timer);
    const done = current;
    current = null;
    done.resolve(e.data);
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    stopWorker(`The Python runner stopped: ${e.message || 'unknown error'}. Press Run to try again.`);
  };
  worker.onmessageerror = () => stopWorker('The Python runner sent a message it could not read. Press Run to try again.');
}

function send(msg, timeout, timeoutMessage) {
  const job = () => new Promise((resolve) => {
    if (!worker) start();
    const id = nextId++;
    const timer = setTimeout(() => stopWorker(timeoutMessage), timeout);
    current = { id, resolve: (r) => resolve({ ...r, timedOut: r.error === timeoutMessage }), timer };
    worker.postMessage({ ...msg, id });
  });
  const result = queue.then(job, job);
  queue = result.catch(() => {});
  return result;
}

/** Load Python in the background so the first Run is fast. */
export const warmup = () => send({ warmup: true }, LOAD_TIMEOUT_MS,
  "Python didn't load. Check your internet connection, then press Run again.");

const norm = (s) => String(s || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();

export async function runPython(code, { expected_output = '', tests = '' } = {}) {
  const w = await warmup(); // loading does not count against the 6 seconds
  if (w.error) return { stdout: '', error: w.error, passed: false, mismatch: null };
  const r = await send({ code, tests }, RUN_TIMEOUT_MS,
    'Timed out: your program ran for more than 6 seconds. Is there a loop that never stops?');
  let passed = !r.error && !r.testError;
  let mismatch = null;
  if (passed && expected_output && norm(r.stdout) !== norm(expected_output)) {
    passed = false;
    mismatch = 'Output does not match the expected output yet.';
  }
  return { ...r, passed, mismatch };
}
