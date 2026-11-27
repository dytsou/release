import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDistTag } from "./resolve-dist-tag.mjs";

test("auto maps stable versions to latest", () => {
  assert.equal(resolveDistTag("1.0.0"), "latest");
  assert.equal(resolveDistTag("0.1.0", "auto"), "latest");
  assert.equal(resolveDistTag("1.0.0+build.5"), "latest");
});

test("auto uses the prerelease identifier as the dist-tag", () => {
  assert.equal(resolveDistTag("1.0.0-beta-1"), "beta");
  assert.equal(resolveDistTag("1.0.0-beta.2"), "beta");
  assert.equal(resolveDistTag("2.0.0-rc.1"), "rc");
  assert.equal(resolveDistTag("2.0.0-Alpha"), "alpha");
});

test("auto falls back to next for unnamed prereleases", () => {
  assert.equal(resolveDistTag("1.0.0-0"), "next");
  assert.equal(resolveDistTag("1.0.0-1.2"), "next");
});

test("an explicit dist-tag overrides auto", () => {
  assert.equal(resolveDistTag("1.0.0", "beta"), "beta");
  assert.equal(resolveDistTag("1.0.0-beta.1", "next"), "next");
  assert.equal(resolveDistTag("1.0.0-beta.1", ""), "beta");
});

test("rejects invalid versions and dist-tags", () => {
  assert.throws(() => resolveDistTag("v1.0.0"), /Invalid version/);
  assert.throws(() => resolveDistTag("1.0.0", "1.0.0"), /dist-tag must/);
  assert.throws(() => resolveDistTag("1.0.0", "-x"), /dist-tag must/);
  assert.throws(() => resolveDistTag("1.0.0", "beta tag"), /dist-tag must/);
});
