// Git trees (content hashes) that passed the full `pnpm test`. The record lives in the git dir,
// so every worktree of this repo shares it and nothing gets committed. A landing whose tree is
// on the list has already been verified, so `pnpm gates --landing` need not run the suite again.
import fs from 'node:fs';
import path from 'node:path';

import { git } from './changed-files.mjs';

const RECORD_NAME = 'gates-green-trees';

/** @param {string} recordText One tree hash per line */
export function isTreeVerified(treeHash, recordText) {
  if (!treeHash) return false;
  return recordText.split('\n').some((line) => line.trim() === treeHash);
}

export function greenTreesFile() {
  return path.join(
    git(['rev-parse', '--path-format=absolute', '--git-common-dir']),
    RECORD_NAME
  );
}

export function readGreenTrees() {
  const file = greenTreesFile();
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

export function recordGreenTree(treeHash) {
  if (isTreeVerified(treeHash, readGreenTrees())) return;
  fs.appendFileSync(greenTreesFile(), `${treeHash}\n`);
}
