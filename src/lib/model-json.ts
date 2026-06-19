import { jsonrepair } from "jsonrepair"

const JSON_PREVIEW_LIMIT = 600

function findBalancedJsonObject(input: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (start === -1) {
      if (char === "{") {
        start = i
        depth = 1
      }
      continue
    }

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }
      continue
    }

    if (char === "\"") {
      inString = true
    } else if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        return input.slice(start, i + 1)
      }
    }
  }

  return null
}

function normalizeLooseJson(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
}

function preview(text: string): string {
  return text.slice(0, JSON_PREVIEW_LIMIT).replace(/\s+/g, " ").trim()
}

export function extractJsonObjectTextFromModelOutput(output: string): string | null {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  return findBalancedJsonObject(fenced ?? output) ?? findBalancedJsonObject(output)
}

export function parseJsonObjectFromModelOutput(output: string): Record<string, unknown> {
  const jsonText = extractJsonObjectTextFromModelOutput(output)
  if (!jsonText) {
    throw new Error("Model did not return a parseable JSON object.")
  }

  const normalized = normalizeLooseJson(jsonText)
  const candidates = [jsonText, normalized]
  let lastError: unknown = null

  try {
    candidates.push(jsonrepair(normalized))
  } catch (err) {
    lastError = err
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      throw new Error("Parsed JSON is not an object.")
    } catch (err) {
      lastError = err
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Model returned invalid JSON: ${message}. Preview: ${preview(jsonText)}`)
}
