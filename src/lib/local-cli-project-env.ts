import { createDirectory, fileExists, readFile, writeFileAtomic } from "@/commands/fs"
import { normalizePath } from "@/lib/path-utils"

export interface LocalCliProjectEnv {
  OPENAI_API_KEY: string
  ANTHROPIC_API_KEY: string
  OPENAI_BASE_URL: string
  OPENAI_API_BASE: string
  ANTHROPIC_BASE_URL: string
  HTTP_PROXY: string
  HTTPS_PROXY: string
  ALL_PROXY: string
  NO_PROXY: string
}

export const LOCAL_CLI_PROJECT_ENV_FILE = ".qmai/local-cli-env.json"

export const EMPTY_LOCAL_CLI_PROJECT_ENV: LocalCliProjectEnv = {
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  OPENAI_BASE_URL: "",
  OPENAI_API_BASE: "",
  ANTHROPIC_BASE_URL: "",
  HTTP_PROXY: "",
  HTTPS_PROXY: "",
  ALL_PROXY: "",
  NO_PROXY: "",
}

export function localCliProjectEnvFilePath(projectPath: string): string {
  return `${normalizePath(projectPath)}/${LOCAL_CLI_PROJECT_ENV_FILE}`
}

function localCliProjectEnvGitignorePath(projectPath: string): string {
  return `${normalizePath(projectPath)}/.qmai/.gitignore`
}

function normalizeLocalCliProjectEnv(raw: unknown): LocalCliProjectEnv {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  return {
    OPENAI_API_KEY: typeof obj.OPENAI_API_KEY === "string" ? obj.OPENAI_API_KEY : "",
    ANTHROPIC_API_KEY: typeof obj.ANTHROPIC_API_KEY === "string" ? obj.ANTHROPIC_API_KEY : "",
    OPENAI_BASE_URL: typeof obj.OPENAI_BASE_URL === "string" ? obj.OPENAI_BASE_URL : "",
    OPENAI_API_BASE: typeof obj.OPENAI_API_BASE === "string" ? obj.OPENAI_API_BASE : "",
    ANTHROPIC_BASE_URL: typeof obj.ANTHROPIC_BASE_URL === "string" ? obj.ANTHROPIC_BASE_URL : "",
    HTTP_PROXY: typeof obj.HTTP_PROXY === "string" ? obj.HTTP_PROXY : "",
    HTTPS_PROXY: typeof obj.HTTPS_PROXY === "string" ? obj.HTTPS_PROXY : "",
    ALL_PROXY: typeof obj.ALL_PROXY === "string" ? obj.ALL_PROXY : "",
    NO_PROXY: typeof obj.NO_PROXY === "string" ? obj.NO_PROXY : "",
  }
}

export async function loadLocalCliProjectEnv(projectPath: string): Promise<LocalCliProjectEnv> {
  const path = localCliProjectEnvFilePath(projectPath)
  if (!(await fileExists(path))) return { ...EMPTY_LOCAL_CLI_PROJECT_ENV }
  const raw = await readFile(path)
  return normalizeLocalCliProjectEnv(JSON.parse(raw))
}

async function ensureLocalCliProjectEnvIgnored(projectPath: string): Promise<void> {
  const path = localCliProjectEnvGitignorePath(projectPath)
  const existing = await fileExists(path).then((exists) => exists ? readFile(path) : "")
  const lines = existing.split(/\r?\n/).map((line) => line.trim())
  if (lines.includes("local-cli-env.json") || lines.includes("/local-cli-env.json")) return

  const trimmed = existing.trimEnd()
  const next = `${trimmed}${trimmed ? "\n" : ""}local-cli-env.json\n`
  await writeFileAtomic(path, next)
}

export async function saveLocalCliProjectEnv(
  projectPath: string,
  env: LocalCliProjectEnv,
): Promise<void> {
  const normalizedProjectPath = normalizePath(projectPath)
  await createDirectory(`${normalizedProjectPath}/.qmai`)
  await ensureLocalCliProjectEnvIgnored(normalizedProjectPath)
  await writeFileAtomic(
    localCliProjectEnvFilePath(normalizedProjectPath),
    `${JSON.stringify(normalizeLocalCliProjectEnv(env), null, 2)}\n`,
  )
}
