#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = /^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/;
const DIST_TAG = /^[A-Za-z][A-Za-z0-9._-]*$/;

/**
 * Pick the npm dist-tag a version is published under.
 *
 * `auto` (default): stable versions get `latest`; a prerelease with an
 * identifier (1.0.0-beta.1, 2.0.0-rc.1) gets that identifier; other
 * prereleases (1.0.0-0, 1.0.0-1.2) get `next`.
 * Any other value is used as the dist-tag as given.
 */
export function resolveDistTag(version, requested = "auto") {
  if (!VERSION.test(version)) {
    throw new Error(`Invalid version for dist-tag: ${version}`);
  }
  const input = String(requested ?? "").trim() || "auto";
  if (input !== "auto") {
    if (!DIST_TAG.test(input)) {
      throw new Error(
        `dist-tag must start with a letter and use only letters, digits, ".", "_" or "-" (got: ${input})`,
      );
    }
    return input;
  }
  const identifier = /^\d+\.\d+\.\d+-([A-Za-z]+)/.exec(version);
  if (identifier) return identifier[1].toLowerCase();
  return version.includes("-") ? "next" : "latest";
}

function main() {
  const [version = "", requested = "auto"] = process.argv.slice(2);
  process.stdout.write(`${resolveDistTag(version, requested)}\n`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
