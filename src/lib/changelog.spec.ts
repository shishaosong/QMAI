import { describe, expect, it } from "vitest"
import { allChangelog, currentVersionChangelog } from "./changelog"

describe("changelog", () => {
  it("shows a consolidated 2.0.0 release instead of separate 1.0.8-1.0.32 entries", () => {
    const entries = allChangelog()
    const versions = entries.map((entry) => entry.version)

    expect(versions[0]).toBe("2.0.0")
    expect(versions).toContain("1.0.7")
    for (let patch = 8; patch <= 32; patch += 1) {
      expect(versions).not.toContain(`1.0.${patch}`)
    }

    const release = currentVersionChangelog("2.0.0")[0]
    expect(release.highlights.zh.join("\n")).toContain("大型版本升级")
    expect(release.highlights.zh.join("\n")).toContain("六维审查")
    expect(release.highlights.zh.join("\n")).toContain("AI修改流程")
  })
})
