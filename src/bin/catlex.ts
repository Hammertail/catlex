#!/usr/bin/env bun

//* Local imports
import { createProgram } from "../cli/program.ts";

const program = createProgram();

await program.parseAsync(process.argv);
