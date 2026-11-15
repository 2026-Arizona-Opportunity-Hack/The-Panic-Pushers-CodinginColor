// Loaded with a plain <script> in <head> (not a module, not deferred) so the
// viewer's display settings apply before the first paint: no flash of the
// wrong theme or text size. Keep this file tiny.
(function () {
  try {
    var prefs = JSON.parse(localStorage.getItem('cic-prefs') || '{}');
    var root = document.documentElement;
    if (prefs.theme === 'light' || prefs.theme === 'dark') root.dataset.theme = prefs.theme;
    if (prefs.text === 'lg' || prefs.text === 'xl') root.dataset.text = prefs.text;
    if (prefs.contrast === 'more') root.dataset.contrast = 'more';
    if (prefs.motion === 'reduce') root.dataset.motion = 'reduce';
  } catch (e) {
    // Private mode or blocked storage: the device defaults still apply.
  }
})();
