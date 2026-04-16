#!/usr/bin/env bun
import { runCli } from "./cli"

runCli(process.argv.slice(2), { cwd: process.cwd() }).then(process.exit)
