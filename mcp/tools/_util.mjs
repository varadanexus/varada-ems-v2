// mcp/tools/_util.mjs — shared helpers for tool handlers.

/** Wrap a JS value as a successful MCP tool result (pretty JSON text). */
export function ok(value, note) {
  const payload = note ? { note, ...value } : value;
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/** Wrap a short human message as a successful text result. */
export function text(msg) {
  return { content: [{ type: "text", text: String(msg) }] };
}

/** Wrap an error as an MCP error result (Claude sees it and can react). */
export function fail(msg) {
  return { content: [{ type: "text", text: "ERROR: " + String(msg) }], isError: true };
}

/** Run an async handler and convert thrown errors into fail() results. */
export function guard(fn) {
  return async (args, extra) => {
    try {
      return await fn(args, extra);
    } catch (e) {
      return fail(e?.message || String(e));
    }
  };
}

/** Confirmation banner for destructive / bulk actions. */
export function confirmation(action, targets) {
  const list = Array.isArray(targets) ? targets : [targets];
  return `✔ ${action}. Affected (${list.length}): ${list.map((t) => t).join(", ")}`;
}
