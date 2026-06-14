#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCliEntrypoint } from "./project-session-retro-ledger/cli.ts";

export { createProjectSessionRetroProposals } from "./project-session-retro-ledger/openspec-proposals.ts";
export { computeAnalysisProgress, refreshAnalysisProgress } from "./project-session-retro-ledger/progress.ts";
export { initProjectSessionRetroLedger } from "./project-session-retro-ledger/sqlite-source.ts";
export * from "./project-session-retro-ledger/types.ts";
export { validateProjectSessionRetroLedger } from "./project-session-retro-ledger/validator.ts";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCliEntrypoint();
}
