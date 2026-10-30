import { execSync } from 'node:child_process';

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim();
}

function getLatestTag() {
  try {
    return run('git tag -l "v*.*.*" --sort=-v:refname | head -1');
  } catch {
    return '';
  }
}

function parseVersion(tag) {
  const match = tag.match(/^v(\d+)\.(\d+)\.(\d+)(-.*)?$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] || '',
  };
}

function bumpPatch(version) {
  return { ...version, patch: version.patch + 1, prerelease: '' };
}

function formatVersion(v) {
  return `v${v.major}.${v.minor}.${v.patch}${v.prerelease}`;
}

function main() {
  const moveMajorTag = process.env.INPUT_MOVE_MAJOR_TAG === 'true';

  const latestTag = getLatestTag();
  if (!latestTag) {
    console.error('No version tags found (expected v*.*.*)');
    process.exit(1);
  }

  const current = parseVersion(latestTag);
  if (!current) {
    console.error(`Invalid tag format: ${latestTag}`);
    process.exit(1);
  }

  const next = bumpPatch(current);
  const nextTag = formatVersion(next);

  // Check if this tag already exists
  const existingTags = run('git tag -l "' + nextTag + '"');
  if (existingTags) {
    console.error(`Tag ${nextTag} already exists`);
    process.exit(1);
  }

  // Create the tag locally
  run(`git tag ${nextTag}`);

  // Move major tag if requested
  if (moveMajorTag) {
    const majorTag = `v${next.major}`;
    run(`git tag -f ${majorTag} ${nextTag}`);
    console.log(`Moved major tag ${majorTag} to ${nextTag}`);
  }

  // Output for GitHub Actions
  console.log(`version=${nextTag}`);
  console.log(`::set-output name=version::${nextTag}`);
}

main();