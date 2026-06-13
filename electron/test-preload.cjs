// Preload for the visual test harness. Runs before page scripts and captures
// uncaught errors / promise rejections into window.__errors so the runner can
// read them after load (module-load errors happen before we could inject from
// the Node side). contextIsolation is disabled in the test window so this
// shares the page's `window`.

window.__errors = [];
window.addEventListener('error', (e) => {
  const loc = e.filename ? ` @ ${e.filename}:${e.lineno}:${e.colno}` : '';
  const stack = e.error && e.error.stack ? `\n${e.error.stack}` : '';
  window.__errors.push('error: ' + (e.message || e.error) + loc + stack);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  window.__errors.push('unhandledrejection: ' + ((r && (r.stack || r.message)) || r));
});
