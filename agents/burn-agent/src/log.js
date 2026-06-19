import fs from "node:fs";
import path from "node:path";

export function appendAuditLog(file, event) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    ...event
  };
  fs.appendFileSync(file, `${JSON.stringify(entry)}
`);
  return entry;
}
