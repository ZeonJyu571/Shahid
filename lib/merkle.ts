import { sha256 } from './hash';

/**
 * Build a binary Merkle tree from an array of leaf values (hex strings or
 * arbitrary strings — each is hashed before use so callers don't need to
 * pre-hash).
 *
 * Returns the Merkle root as a lowercase hex SHA-256 digest.
 *
 * Odd-length levels carry the last node up unmodified (standard Bitcoin
 * convention).
 */
export function buildMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle tree from empty leaf set');
  }

  // Hash each leaf so the tree always works on uniform-length digests
  let nodes: string[] = leaves.map(l => sha256(l));

  while (nodes.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      if (i + 1 < nodes.length) {
        // Concatenate and hash the pair
        next.push(sha256(nodes[i] + nodes[i + 1]));
      } else {
        // Odd node: carry it up unchanged
        next.push(nodes[i]);
      }
    }
    nodes = next;
  }

  return nodes[0];
}

/**
 * Return every level of the tree (bottom = leaves, top = [root]).
 * Useful for generating audit proofs later.
 */
export function buildMerkleTree(leaves: string[]): string[][] {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle tree from empty leaf set');
  }

  const levels: string[][] = [];
  let nodes: string[] = leaves.map(l => sha256(l));
  levels.push([...nodes]);

  while (nodes.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      if (i + 1 < nodes.length) {
        next.push(sha256(nodes[i] + nodes[i + 1]));
      } else {
        next.push(nodes[i]);
      }
    }
    nodes = next;
    levels.push([...nodes]);
  }

  return levels; // levels[levels.length - 1][0] is the root
}
