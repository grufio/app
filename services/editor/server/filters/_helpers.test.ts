import { afterEach, describe, expect, it } from "vitest"

import { contentTypeFor, filterServiceHeaders, pickOutputFormat, toInt } from "./_helpers"

describe("toInt", () => {
  it("rounds finite positive numbers", () => {
    expect(toInt(3.4)).toBe(3)
    expect(toInt(3.6)).toBe(4)
    expect(toInt(0)).toBe(0)
  })
  it("rejects negative, NaN, Infinity", () => {
    expect(toInt(-0.4)).not.toBeNull() // rounds to -0 which passes the n<0 check
    expect(toInt(-1)).toBeNull()
    expect(toInt(NaN)).toBeNull()
    expect(toInt(Infinity)).toBeNull()
    expect(toInt(-Infinity)).toBeNull()
  })
})

describe("pickOutputFormat", () => {
  it("normalises jpg/jpeg to jpeg", () => {
    expect(pickOutputFormat("jpg")).toBe("jpeg")
    expect(pickOutputFormat("JPG")).toBe("jpeg")
    expect(pickOutputFormat("jpeg")).toBe("jpeg")
    expect(pickOutputFormat("JPEG")).toBe("jpeg")
  })
  it("recognises webp case-insensitively", () => {
    expect(pickOutputFormat("webp")).toBe("webp")
    expect(pickOutputFormat("WEBP")).toBe("webp")
  })
  it("falls back to png for unknown / null / empty", () => {
    expect(pickOutputFormat(null)).toBe("png")
    expect(pickOutputFormat(undefined)).toBe("png")
    expect(pickOutputFormat("")).toBe("png")
    expect(pickOutputFormat("gif")).toBe("png")
    expect(pickOutputFormat("png")).toBe("png")
  })
})

describe("contentTypeFor", () => {
  it("maps each format to its MIME type", () => {
    expect(contentTypeFor("jpeg")).toBe("image/jpeg")
    expect(contentTypeFor("png")).toBe("image/png")
    expect(contentTypeFor("webp")).toBe("image/webp")
  })
})

describe("filterServiceHeaders", () => {
  const original = process.env.FILTER_SERVICE_TOKEN

  afterEach(() => {
    if (original == null) delete process.env.FILTER_SERVICE_TOKEN
    else process.env.FILTER_SERVICE_TOKEN = original
  })

  it("returns Content-Type only when no token is set", () => {
    delete process.env.FILTER_SERVICE_TOKEN
    expect(filterServiceHeaders()).toEqual({ "Content-Type": "application/json" })
  })

  it("attaches Bearer token when FILTER_SERVICE_TOKEN is set", () => {
    process.env.FILTER_SERVICE_TOKEN = "secret-abc"
    expect(filterServiceHeaders()).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-abc",
    })
  })

  it("treats empty/whitespace token as unset", () => {
    process.env.FILTER_SERVICE_TOKEN = "   "
    expect(filterServiceHeaders()).toEqual({ "Content-Type": "application/json" })
  })
})
