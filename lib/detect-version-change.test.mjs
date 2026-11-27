import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  detectVersionChange,
  GIT,
  readPreviousVersion,
  TRUSTED_PATH,
} from "./detect-version-change.mjs";

test("a manual run always releases", () => {
  assert.equal(
    detectVersionChange({
      eventName: "workflow_dispatch",
      currentVersion: "1.0.0",
      previousVersion: "1.0.0",
    }).release,
    true,
  );
});

test("a push releases when the version changed", () => {
  const result = detectVersionChange({
    eventName: "push",
    currentVersion: "1.0.0-beta-1",
    previousVersion: "0.1.0",
  });
  assert.equal(result.release, true);
  assert.match(result.reason, /from 0\.1\.0 to 1\.0\.0-beta-1/);
});

test("a push skips when the version is unchanged", () => {
  const result = detectVersionChange({
    eventName: "push",
    currentVersion: "1.0.0",
    previousVersion: "1.0.0",
  });
  assert.equal(result.release, false);
  assert.match(result.reason, /unchanged/);
});

test("a missing previous version counts as a change", () => {
  assert.equal(
    detectVersionChange({ eventName: "push", currentVersion: "1.0.0" }).release,
    true,
  );
});

test("detectVersionChange rejects an invalid current version", () => {
  assert.throws(
    () => detectVersionChange({ eventName: "push", currentVersion: "v1" }),
    /Invalid semver/,
  );
});

test("readPreviousVersion returns null without a usable base", () => {
  assert.equal(readPreviousVersion({ before: "" }), null);
  assert.equal(readPreviousVersion({ before: "0".repeat(40) }), null);
});

test("readPreviousVersion rejects a non-SHA base and unsafe paths", () => {
  assert.throws(() => readPreviousVersion({ before: "main" }), /commit SHA/);
  assert.throws(
    () => readPreviousVersion({ before: "a".repeat(40), packageJsonPath: "../x.json" }),
    /must not contain/,
  );
});

test("readPreviousVersion reads the version at the base commit", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "detect-version-"));
  try {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      PATH: TRUSTED_PATH,
    };
    const git = (...args) =>
      execFileSync(GIT, args, { cwd: dir, env, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    mkdirSync(path.join(dir, "app"));
    const pkg = path.join(dir, "app", "package.json");
    writeFileSync(pkg, JSON.stringify({ name: "x", version: "0.1.0" }));
    git("add", ".");
    git("commit", "-q", "-m", "first");
    const base = git("rev-parse", "HEAD");
    writeFileSync(pkg, JSON.stringify({ name: "x", version: "1.0.0-beta-1" }));
    git("commit", "-q", "-am", "bump");

    assert.equal(
      readPreviousVersion({ before: base, packageJsonPath: "app/package.json", cwd: dir }),
      "0.1.0",
    );
    assert.equal(
      readPreviousVersion({
        before: base,
        packageJsonPath: "missing.json",
        cwd: dir,
      }),
      null,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("git is looked up on the trusted PATH, not a writable PATH entry", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "detect-version-shadow-"));
  const shadow = path.join(dir, "bin");
  const marker = path.join(dir, "shadow-ran");
  const repo = path.join(dir, "repo");
  mkdirSync(shadow);
  mkdirSync(repo);
  writeFileSync(
    path.join(shadow, "git"),
    `#!/bin/sh\necho ran > "${marker}"\nexit 1\n`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: TRUSTED_PATH,
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  const git = (...args) =>
    execFileSync(GIT, args, { cwd: repo, env, encoding: "utf8" }).trim();
  const savedPath = process.env.PATH;
  try {
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version: "0.1.0" }));
    git("add", ".");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    process.env.PATH = `${shadow}:${savedPath}`;
    assert.equal(readPreviousVersion({ before: base, cwd: repo }), "0.1.0");
    assert.equal(existsSync(marker), false, "the writable shadow git must not run");
  } finally {
    process.env.PATH = savedPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
