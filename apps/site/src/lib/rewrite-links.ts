import path from "node:path";

import type { Link, Root } from "mdast";
import { visit } from "unist-util-visit";

import { GITHUB_URL } from "@/lib/site";

import { routeForDocFile } from "./docs-manifest";

/**
 * remark plugin: rewrite the GitHub-style relative links used inside docs/
 * so they work on the site.
 *
 * - `self-hosting/quickstart.md`, `../concepts.md` → the matching /docs route
 *   (fragments preserved — rehype-slug uses the same slugger as GitHub).
 * - Paths escaping docs/ (`../CONTRIBUTING.md`) → GitHub blob URLs.
 * - An unresolvable relative link throws, so broken docs links fail the build.
 */
export function rewriteRelativeLinks({ docFile }: { docFile: string }) {
  return (tree: Root) => {
    visit(tree, "link", (node: Link) => {
      const url = node.url;
      if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("/") || url.startsWith("#")) {
        return; // absolute, root-relative, or in-page — leave untouched
      }
      const [target = "", fragment] = url.split("#");
      // Resolve against the current doc's location within docs/.
      const resolved = path.join(path.dirname(docFile), target);
      const suffix = fragment ? `#${fragment}` : "";
      if (resolved.startsWith("..")) {
        // Escapes docs/ — point at the file on GitHub (e.g. ../CONTRIBUTING.md).
        const repoPath = path.normalize(path.join("docs", path.dirname(docFile), target));
        node.url = `${GITHUB_URL}/blob/main/${repoPath}${suffix}`;
        return;
      }
      const route = routeForDocFile(resolved);
      if (!route) {
        throw new Error(
          `docs/${docFile}: link "${url}" resolves to "${resolved}", which is not in the docs manifest`,
        );
      }
      node.url = `${route}${suffix}`;
    });
  };
}
