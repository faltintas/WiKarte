#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');

function readVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function runGit(args, options = {}) {
  const result = execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });

  return typeof result === 'string' ? result.trim() : '';
}

function ensureCleanWorktree() {
  const status = runGit(['status', '--porcelain']);
  if (status) {
    throw new Error('Working tree is not clean. Commit or stash changes before creating a release tag.');
  }
}

function ensureOnBranch(expectedBranch) {
  const branch = runGit(['branch', '--show-current']);
  if (branch !== expectedBranch) {
    throw new Error(`Release tags must be created from ${expectedBranch}. Current branch: ${branch || '(detached HEAD)'}`);
  }
}

function ensureTagDoesNotExist(tagName) {
  try {
    runGit(['rev-parse', '--verify', '--quiet', tagName]);
    throw new Error(`Tag ${tagName} already exists.`);
  } catch (error) {
    if (String(error.message || '').includes(`Tag ${tagName} already exists.`)) {
      throw error;
    }
  }
}

function createAnnotatedTag(tagName, version) {
  const message = `Release ${tagName}`;
  runGit(['tag', '-a', tagName, '-m', message], { stdio: 'inherit' });
  process.stdout.write(`${tagName}\n`);
  process.stdout.write(`Created annotated tag for version ${version}.\n`);
  process.stdout.write(`Push it with: git push origin ${tagName}\n`);
}

function main() {
  const version = readVersion();
  const tagName = `v${version}`;

  ensureCleanWorktree();
  ensureOnBranch('main');
  ensureTagDoesNotExist(tagName);
  createAnnotatedTag(tagName, version);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
