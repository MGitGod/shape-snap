import { isLeaf } from "../src/core/types";
import type { LeafNode, SceneNode } from "../src/core/types";

/** Narrow a scene node to a leaf shape (throws when it is a container or missing). */
export function leafOf(n: SceneNode | undefined | null): LeafNode {
  if (!n || !isLeaf(n)) throw new Error("expected a leaf node");
  return n;
}
