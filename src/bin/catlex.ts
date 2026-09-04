#!/usr/bin/env bun

//* Local imports
import { createProgram } from "../cli/program.ts";
import { registerCrashHandlers } from "../core/reporting/register-crash-handlers.ts";

registerCrashHandlers();

const program = createProgram();

await program.parseAsync(process.argv);
