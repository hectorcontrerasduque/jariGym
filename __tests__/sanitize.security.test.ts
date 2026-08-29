import { describe, it, expect } from "vitest";
import { sanitizePostgrestILike, sanitizeOrFilter, sanitizePostgrestValue } from "@/lib/utils/sanitize";

describe("sanitizePostgrestILike", () => {
  it("escapa % _ \\", () => {
    expect(sanitizePostgrestILike("test%_\\")).toBe("test\\%\\_\\\\");
  });
  it("input vacío", () => expect(sanitizePostgrestILike("")).toBe(""));
  it("sin chars especiales", () => expect(sanitizePostgrestILike("juan")).toBe("juan"));
});

describe("sanitizeOrFilter", () => {
  it("genera condiciones seguras", () => {
    const result = sanitizeOrFilter(["juan", "perez"]);
    expect(result).toContain("nombre.ilike.%juan%");
    expect(result).toContain("nombre.ilike.%perez%");
    expect(result).toContain("nombre.ilike.%pere%"); // prefix
  });
  it("ignora palabras < 2 chars", () => {
    expect(sanitizeOrFilter(["a", "juan"])).not.toContain("%a%");
  });
  it("sanitiza cada palabra escapando % _", () => {
    const result = sanitizeOrFilter(["test%", "injection_"]);
    // Los caracteres especiales se escapan: % -> \%, _ -> \_
    expect(result).toContain("test\\%");
    expect(result).toContain("injection\\_");
  });
});

describe("sanitizePostgrestValue", () => {
  it("remueve prefijos operadores", () => {
    expect(sanitizePostgrestValue(".in")).toBe("in");
    expect(sanitizePostgrestValue(",or")).toBe("or");
  });
});