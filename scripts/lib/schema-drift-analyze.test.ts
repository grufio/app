import { describe, expect, it } from "vitest"

import { analyzeDrift, stableIdentity } from "./schema-drift-analyze.mjs"

describe("analyzeDrift", () => {
  it("returns match when committed equals fresh", () => {
    const sql = `CREATE TABLE t (id int);\nALTER TABLE t ADD CONSTRAINT "t_pk" PRIMARY KEY (id);`
    expect(analyzeDrift(sql, sql).kind).toBe("match")
  })

  it("softens when committed has additions over fresh (pending migration)", () => {
    const fresh = `CREATE TABLE t (id int);`
    const committed = `CREATE TABLE t (id int);\nCREATE TABLE u (id int);`
    expect(analyzeDrift(committed, fresh).kind).toBe("pending_addition")
  })

  it("softens redefinition of the same constraint name (DROP+ADD migration)", () => {
    const fresh = `ALTER TABLE ONLY "public"."t" ADD CONSTRAINT "t_fkey" FOREIGN KEY ("x") REFERENCES "public"."u"("id") ON DELETE RESTRICT;`
    const committed = `ALTER TABLE ONLY "public"."t" ADD CONSTRAINT "t_fkey" FOREIGN KEY ("x") REFERENCES "public"."u"("id") ON DELETE CASCADE;`
    expect(analyzeDrift(committed, fresh).kind).toBe("pending_redefinition")
  })

  it("softens redefinition of an index by name", () => {
    const fresh = `CREATE INDEX "t_x_idx" ON "public"."t" USING btree ("x");`
    const committed = `CREATE INDEX "t_x_idx" ON "public"."t" USING btree ("x", "y");`
    expect(analyzeDrift(committed, fresh).kind).toBe("pending_redefinition")
  })

  it("flags real drift when fresh-only lines have no committed counterpart", () => {
    const fresh = `CREATE TABLE u (id int);\nCREATE INDEX "u_idx" ON "public"."u" USING btree ("id");`
    const committed = `CREATE TABLE u (id int);`
    const result = analyzeDrift(committed, fresh)
    expect(result.kind).toBe("drift")
    expect(result.unexplainedFresh).toHaveLength(1)
  })

  it("flags real drift when freshOnly lines change a different constraint than committedOnly", () => {
    const fresh = `ALTER TABLE ONLY "public"."t" ADD CONSTRAINT "different_name" FOREIGN KEY ("x") REFERENCES "u"("id") ON DELETE RESTRICT;`
    const committed = `ALTER TABLE ONLY "public"."t" ADD CONSTRAINT "t_fkey" FOREIGN KEY ("x") REFERENCES "u"("id") ON DELETE CASCADE;`
    expect(analyzeDrift(committed, fresh).kind).toBe("drift")
  })

  it("flags drift on unrecognised line shapes — no false positive softening", () => {
    const fresh = `ALTER TABLE "public"."t" ALTER COLUMN "x" SET NOT NULL;`
    const committed = `ALTER TABLE "public"."t" ALTER COLUMN "x" DROP NOT NULL;`
    expect(analyzeDrift(committed, fresh).kind).toBe("drift")
  })
})

describe("stableIdentity", () => {
  it("extracts constraint name", () => {
    expect(stableIdentity(`ADD CONSTRAINT "foo_bar" FOREIGN KEY ("x") REFERENCES "y"("id")`)).toBe(
      "constraint:foo_bar",
    )
  })

  it("extracts index name", () => {
    expect(stableIdentity(`CREATE UNIQUE INDEX "foo_idx" ON "public"."t" USING btree ("x")`)).toBe(
      "index:foo_idx",
    )
  })

  it("returns null for lines without a recognisable identity", () => {
    expect(stableIdentity(`ALTER TABLE "public"."t" ALTER COLUMN "x" SET NOT NULL;`)).toBeNull()
  })
})
