/**
 * Keeps docs/api/openapi.yaml in sync with app/api/**\/route.ts.
 * Adding, removing or renaming an endpoint without updating the docs fails this test
 * (and therefore the pre-commit hook).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse } from "yaml";

const ROOT = join(__dirname, "..");
const API_DIR = join(ROOT, "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type Operation = {
  operationId?: string;
  summary?: string;
  security?: unknown[];
  responses?: Record<string, unknown>;
};
type Spec = { paths: Record<string, Partial<Record<Lowercase<(typeof METHODS)[number]>, Operation>>> };

const spec = parse(readFileSync(join(ROOT, "docs", "api", "openapi.yaml"), "utf8")) as Spec & Record<string, unknown>;

function routeFiles(dir: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks the repo's app/api folder
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routeFiles(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : []
  );
}

/** "METHOD /api/path" for every exported handler in the code. */
function operacionesEnCodigo(): string[] {
  return routeFiles(API_DIR).flatMap((file) => {
    const path = "/api/" + relative(API_DIR, join(file, "..")).split(sep).join("/");
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- file comes from routeFiles
    const src = readFileSync(file, "utf8");
    return METHODS.filter((m) =>
      // eslint-disable-next-line security/detect-non-literal-regexp -- m is a fixed HTTP method name
      new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b|export\\s+const\\s+${m}\\b`).test(src)
    ).map((m) => `${m} ${path.replace(/\/$/, "")}`);
  });
}

function operacionesDocumentadas(): Array<[string, Operation]> {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m.toLowerCase() as Lowercase<typeof m>]).map(
      (m) => [`${m} ${path}`, item[m.toLowerCase() as Lowercase<typeof m>]!] as [string, Operation]
    )
  );
}

describe("docs/api/openapi.yaml", () => {
  it("documenta exactamente los endpoints que existen en app/api", () => {
    const codigo = operacionesEnCodigo().sort();
    const docs = operacionesDocumentadas().map(([k]) => k).sort();
    expect(codigo.length).toBeGreaterThan(0);
    expect({ sinDocumentar: codigo.filter((o) => !docs.includes(o)), documentadosQueNoExisten: docs.filter((o) => !codigo.includes(o)) })
      .toEqual({ sinDocumentar: [], documentadosQueNoExisten: [] });
  });

  it("cada operación tiene operationId único, summary, seguridad explícita y una respuesta de éxito", () => {
    const ids = new Set<string>();
    for (const [key, op] of operacionesDocumentadas()) {
      expect(op.operationId, `${key}: operationId`).toBeTruthy();
      expect(ids.has(op.operationId!), `${key}: operationId duplicado`).toBe(false);
      ids.add(op.operationId!);
      expect(op.summary, `${key}: summary`).toBeTruthy();
      expect(Array.isArray(op.security), `${key}: declarar security (usar [] si es público)`).toBe(true);
      expect(Object.keys(op.responses || {}).some((c) => /^[23]\d\d$/.test(c)), `${key}: respuesta 2xx/3xx`).toBe(true);
    }
  });

  it("todas las referencias $ref y esquemas de seguridad existen", () => {
    const text = JSON.stringify(spec);
    const refs = [...text.matchAll(/"\$ref":"#\/([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      const target = ref.split("/").reduce<unknown>((node, part) => (node && typeof node === "object" ? new Map(Object.entries(node)).get(part) : undefined), spec);
      expect(target, `$ref #/${ref}`).toBeDefined();
    }
    const schemes = Object.keys((spec.components as { securitySchemes: object }).securitySchemes);
    for (const [key, op] of operacionesDocumentadas()) {
      for (const req of op.security as Array<Record<string, unknown>>) {
        for (const name of Object.keys(req)) expect(schemes, `${key}: esquema ${name}`).toContain(name);
      }
    }
  });
});
