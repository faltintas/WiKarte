#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const manifestPath = path.join(rootDir, 'manifest.json');
const overridePath = path.join(rootDir, '.wikarte-bump-type');

const silent = process.argv.includes('--silent');
const allowedTypes = new Set(['major', 'minor', 'patch']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function bumpSemver(version, type) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  let [, major, minor, patch] = match;
  major = Number(major);
  minor = Number(minor);
  patch = Number(patch);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unsupported bump type: ${type}`);
  }
}

function resolveBumpType() {
  const requestedType = process.env.WIKARTE_BUMP_TYPE || process.argv[2] || 'minor';
  if (allowedTypes.has(requestedType)) return requestedType;
  throw new Error(`Bump type must be one of: ${Array.from(allowedTypes).join(', ')}`);
}

function readOverrideType() {
  try {
    const value = fs.readFileSync(overridePath, 'utf8').trim();
    return allowedTypes.has(value) ? value : null;
  } catch {
    return null;
  }
}

function clearOverrideType() {
  try {
    fs.unlinkSync(overridePath);
  } catch {
    // Ignore when the file does not exist.
  }
}

function setOverrideType(type) {
  fs.writeFileSync(overridePath, `${type}\n`);
}

function main() {
  const packageJson = readJson(packageJsonPath);
  const manifestJson = readJson(manifestPath);
  const nextVersion = bumpSemver(packageJson.version, resolveBumpType());

  packageJson.version = nextVersion;
  manifestJson.version = nextVersion;

  writeJson(packageJsonPath, packageJson);
  writeJson(manifestPath, manifestJson);

  if (!silent) {
    process.stdout.write(`${nextVersion}\n`);
  }
}

if (process.argv[2] === 'set-next') {
  const type = process.argv[3];
  if (!allowedTypes.has(type)) {
    throw new Error(`Bump type must be one of: ${Array.from(allowedTypes).join(', ')}`);
  }
  setOverrideType(type);
  process.stdout.write(`${type}\n`);
} else if (process.argv[2] === 'clear-next') {
  clearOverrideType();
} else if (process.argv[2] === 'next-type') {
  process.stdout.write(`${readOverrideType() || 'minor'}\n`);
} else if (process.argv[2] === 'hook') {
  process.env.WIKARTE_BUMP_TYPE = readOverrideType() || 'minor';
  main();
  clearOverrideType();
} else {
  main();
}
