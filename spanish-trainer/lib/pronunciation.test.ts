import { describe, expect, it } from "vitest";
import { spanishSpeechText } from "./pronunciation";

describe("spanishSpeechText", () => {
  it("expands the -a gender shorthand to both full forms", () => {
    expect(spanishSpeechText("vuestro, -a")).toBe("vuestro, vuestra");
    expect(spanishSpeechText("nuestro, -a")).toBe("nuestro, nuestra");
    expect(spanishSpeechText("desconocido, -a")).toBe("desconocido, desconocida");
  });

  it("appends -a when the masculine ends in a consonant", () => {
    expect(spanishSpeechText("español, -a")).toBe("español, española");
  });

  it("leaves normal terms untouched", () => {
    expect(spanishSpeechText("el ordenador")).toBe("el ordenador");
    expect(spanishSpeechText("según")).toBe("según");
    expect(spanishSpeechText("¡Arriba!")).toBe("¡Arriba!");
  });
});
