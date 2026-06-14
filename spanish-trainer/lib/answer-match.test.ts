import { describe, expect, it } from "vitest";
import { correctDisplay, isSingleWordTarget, matchAnswer } from "./answer-match";

describe("matchAnswer", () => {
  it("treats an exact match as correct", () => {
    expect(matchAnswer("según", "según")).toBe("correct");
    expect(matchAnswer("der Computer", "der Computer")).toBe("correct");
  });

  it("makes the article optional", () => {
    expect(matchAnswer("Computer", "der Computer")).toBe("correct");
    expect(matchAnswer("ordenador", "el ordenador")).toBe("correct");
  });

  it("accepts any ';'-separated alternative", () => {
    expect(matchAnswer("schwer", "schwierig; schwer")).toBe("correct");
    expect(matchAnswer("schwierig", "schwierig; schwer")).toBe("correct");
  });

  it("ignores parenthetical notes", () => {
    expect(matchAnswer("Wirtschaft", "Wirtschaft (Schulfach)")).toBe("correct");
  });

  it("grades missing accents as almost", () => {
    expect(matchAnswer("segun", "según")).toBe("almost");
    expect(matchAnswer("espanol", "español")).toBe("almost");
  });

  it("grades ß/ss variants as almost", () => {
    expect(matchAnswer("daß", "dass")).toBe("almost");
  });

  it("grades a single typo as almost (longer words only)", () => {
    expect(matchAnswer("ordenadr", "el ordenador")).toBe("almost");
  });

  it("rejects a clearly different or empty answer", () => {
    expect(matchAnswer("perro", "el ordenador")).toBe("wrong");
    expect(matchAnswer("", "según")).toBe("wrong");
  });

  it("does not over-accept short words via typo tolerance", () => {
    expect(matchAnswer("si", "su")).toBe("wrong");
  });
});

describe("correctDisplay", () => {
  it("returns the canonical first alternative", () => {
    expect(correctDisplay("schwierig; schwer")).toBe("schwierig");
    expect(correctDisplay("según")).toBe("según");
  });
});

describe("isSingleWordTarget", () => {
  it("is true for single words (incl. gender shorthand) and false for phrases", () => {
    expect(isSingleWordTarget("el ordenador")).toBe(true);
    expect(isSingleWordTarget("der Computer")).toBe(true);
    expect(isSingleWordTarget("desconocido, -a")).toBe(true);
    expect(isSingleWordTarget("schwierig; schwer")).toBe(true);
    expect(isSingleWordTarget("mit etwas/jdm. einverstanden sein")).toBe(false);
    expect(isSingleWordTarget("por ejemplo")).toBe(false);
  });
});
