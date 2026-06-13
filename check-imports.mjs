// Compatibility shim. The Stop hook in .claude/settings.json and the project
// permissions reference this filename; the real smoke test now lives in
// check.mjs. Running this just runs that (it calls process.exit with the
// pass/fail code, which propagates out of this process).
await import('./check.mjs');
