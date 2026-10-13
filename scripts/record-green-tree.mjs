// Runs after a green full `pnpm test` (see the `test` script in package.json). Records HEAD's tree
// so a later landing of identical content can skip the suite. Only a clean worktree counts:
// the suite ran on the files on disk, and those must be exactly what HEAD names.
import { git } from './lib/changed-files.mjs';
import { recordGreenTree } from './lib/green-trees.mjs';

function main() {
  if (git(['status', '--porcelain']) !== '') {
    console.log('record-green-tree: uncommitted changes, tree not recorded.');
    return 0;
  }
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  recordGreenTree(tree);
  console.log(`record-green-tree: ${tree.slice(0, 12)} recorded as verified.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
