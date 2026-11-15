// Runs student Python in a Web Worker with Pyodide (CPython compiled to
// WebAssembly). Nothing is sent to a server, and no student account is needed.
// The page kills this worker if a run takes too long (e.g. an infinite loop).
import { loadPyodide } from '/pyodide/pyodide.mjs';

let pyReady = null;
function ready() {
  if (!pyReady) pyReady = loadPyodide({ indexURL: '/pyodide/' });
  return pyReady;
}

// Keep the error readable for a beginner: only frames from their code (or the
// checker) plus the final error line; Pyodide's internal frames are dropped.
function cleanError(err) {
  const lines = String(err?.message || err).split('\n');
  const frames = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*File "<(exec|tests)>"/.test(lines[i])) {
      frames.push(lines[i].replace('"<exec>"', 'your code').replace('"<tests>"', 'the checker'));
      const next = lines[i + 1];
      if (next && /^\s{4,}\S/.test(next) && !/^\s*File /.test(next) && !/^\s*[~^]+\s*$/.test(next)) { frames.push(next); i++; }
    }
  }
  const tail = [];
  for (let i = lines.length - 1; i >= 0 && tail.length < 3; i--) {
    if (!lines[i].trim()) continue;
    if (/^\s/.test(lines[i])) break;
    tail.unshift(lines[i]);
  }
  return [frames.length ? 'Traceback (most recent call last):' : '', ...frames, ...tail].filter(Boolean).join('\n');
}

self.onmessage = async (e) => {
  const { id, code, tests } = e.data;
  if (e.data.warmup) { await ready(); self.postMessage({ id, warm: true }); return; }
  const py = await ready();
  let stdout = '';
  py.setStdout({ batched: (s) => { stdout += s + '\n'; } });
  py.setStderr({ batched: (s) => { stdout += s + '\n'; } });
  py.setStdin({ stdin: () => { throw new Error('input() is not supported in this activity'); } });
  const ns = py.globals.get('dict')();
  const result = { id, stdout: '', error: null, testError: null };
  try {
    py.runPython(code, { globals: ns, filename: '<exec>' });
  } catch (err) {
    result.error = cleanError(err);
  }
  if (!result.error && tests) {
    const before = stdout.length;
    try {
      py.runPython(tests, { globals: ns, filename: '<tests>' });
    } catch (err) {
      const msg = cleanError(err);
      const assertMsg = msg.match(/AssertionError:?\s*(.*)$/m);
      result.testError = assertMsg ? (assertMsg[1] || 'A check did not pass') : msg;
    }
    stdout = stdout.slice(0, before); // tests should not add to what the student sees
  }
  ns.destroy();
  result.stdout = stdout.slice(0, 20_000);
  self.postMessage(result);
};
