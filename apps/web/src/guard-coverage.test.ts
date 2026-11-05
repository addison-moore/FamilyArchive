import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Guard tripwire: authorization is enforced per call site —
 * every server action and API handler starts with its own guard call. A new
 * action that forgets its guard line is a privilege escalation; this test
 * fails the build instead.
 */

const APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "app");

const GUARD_PATTERN =
  /\b(requireMemberRole|requireTreeRole|requireUser|requireOwner|METRICS_TOKEN)\b/;

/** Unauthenticated by design. */
const PUBLIC_ROUTES = new Set(["api/health/route.ts", "api/auth/[...nextauth]/route.ts"]);

function findFiles(subdir: string, basename: string): string[] {
  return readdirSync(path.join(APP_DIR, subdir), { recursive: true })
    .map((entry) => String(entry).split(path.sep).join("/"))
    .filter((entry) => entry.split("/").pop() === basename)
    .map((entry) => `${subdir}/${entry}`);
}

interface ExportedFunction {
  name: string;
  body: string;
}

function exportedFunctions(file: string): ExportedFunction[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(path.join(APP_DIR, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: ExportedFunction[] = [];
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      found.push({ name: statement.name.text, body: statement.getText(source) });
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) &&
          ts.isIdentifier(decl.name)
        ) {
          found.push({ name: decl.name.text, body: decl.getText(source) });
        }
      }
    }
  }
  return found;
}

function violationsIn(files: string[]): string[] {
  return files.flatMap((file) =>
    exportedFunctions(file)
      .filter((fn) => !GUARD_PATTERN.test(fn.body))
      .map((fn) => `${file}: ${fn.name}`),
  );
}

/** Every source file in the web app and the packages. */
function sourceFiles(): string[] {
  const repoRoot = path.join(APP_DIR, "..", "..", "..", "..");
  return ["apps/web/src", "apps/worker/src", "packages"].flatMap((dir) =>
    readdirSync(path.join(repoRoot, dir), { recursive: true })
      .map(String)
      .filter((entry) => /\.tsx?$/.test(entry) && !entry.includes("node_modules"))
      .map((entry) => path.join(repoRoot, dir, entry)),
  );
}

describe("session invalidation", () => {
  it("only a password change or reset writes users.updatedAt", () => {
    // getSessionUser rejects any token older than users.updatedAt, so this column
    // doubles as "credentials changed at". Bumping it for anything else signs the
    // user out of every device, which is what the theme toggle used to do. Writes are
    // counted, not files: account.ts has to bump it for a password change, and its
    // name and email changes must not start doing the same.
    const writers = sourceFiles()
      .flatMap((file) => {
        const writes = readFileSync(file, "utf8").match(
          /\.update\(users\)\s*\.set\(\{[^}]*updatedAt/g,
        );
        return (writes ?? []).map(() => path.basename(file));
      })
      .sort();
    expect(writers).toEqual(["account.ts", "password-reset.ts"]);
  });
});

describe("database writes", () => {
  it("never discard a query with void", () => {
    // A Drizzle query runs only when awaited or chained, so `void query` silently does
    // nothing, and its types hide `then` from the floating-promise lint. A failed
    // export's status update was lost this way.
    const dropped = sourceFiles()
      .filter((file) => !file.endsWith(".test.ts"))
      .filter((file) => /\bvoid\s+(getDb\(\)|db|tx)\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.basename(file));
    expect(dropped).toEqual([]);
  });
});

describe("authorization guard coverage", () => {
  it("every (app) server action calls a guard", () => {
    const files = findFiles("(app)", "actions.ts");
    expect(files.length).toBeGreaterThan(5);
    expect(violationsIn(files)).toEqual([]);
  });

  it("every API route handler calls a guard, unless allowlisted public", () => {
    const files = findFiles("api", "route.ts").filter((file) => !PUBLIC_ROUTES.has(file));
    expect(files.length).toBeGreaterThan(3);
    expect(violationsIn(files)).toEqual([]);
  });
});
