//! Codex CLI subprocess transport.
//!
//! This mirrors the Claude Code CLI transport, but treats `codex` as a
//! local completion engine via `codex exec --json`. The webview can only
//! spawn this fixed command; it cannot execute arbitrary shell commands.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::cli_resolver::{child_path_env, find_cli_command};
use super::local_cli_config::{
    apply_local_cli_environment, read_codex_local_config, resolve_cli_project_dir,
    resolve_home_dir, LocalCliConfigInfo,
};

// ── Event emitter abstraction ─────────────────────────────────────
// Allows both Tauri (app.emit) and the standalone server (broadcast
// channel) to share the same spawn logic.

/// Abstraction over "emit a data line" and "emit a done signal" for codex CLI.
pub trait CodexEmitter: Clone + Send + Sync + 'static {
    fn emit_data(&self, stream_id: &str, data: String);
    fn emit_done(&self, stream_id: &str, code: Option<i32>, stderr: String, stdout: String);
}

/// Tauri-based emitter that forwards to `app.emit()`.
#[derive(Clone)]
pub struct TauriCodexEmitter {
    app: AppHandle,
}

impl TauriCodexEmitter {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl CodexEmitter for TauriCodexEmitter {
    fn emit_data(&self, stream_id: &str, data: String) {
        let topic = format!("codex-cli:{stream_id}");
        let _ = self.app.emit(&topic, data);
    }

    fn emit_done(&self, stream_id: &str, code: Option<i32>, stderr: String, stdout: String) {
        let done_topic = format!("codex-cli:{stream_id}:done");
        let _ = self.app.emit(
            &done_topic,
            serde_json::json!({
                "code": code,
                "stderr": stderr,
                "stdout": stdout,
            }),
        );
    }
}

#[derive(Default)]
pub struct CodexCliState {
    children: Arc<Mutex<HashMap<String, Child>>>,
}

#[derive(Serialize)]
pub struct DetectResult {
    installed: bool,
    version: Option<String>,
    path: Option<String>,
    model: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct ModelListResult {
    models: Vec<String>,
}

const DEFAULT_CODEX_SPAWN_TIMEOUT_MINUTES: u64 = 10;
const MIN_CODEX_SPAWN_TIMEOUT_MINUTES: u64 = 1;
const MAX_CODEX_SPAWN_TIMEOUT_MINUTES: u64 = 240;
const STDERR_LIMIT_BYTES: usize = 1024 * 1024;
const STDOUT_LIMIT_BYTES: usize = 1024 * 1024;
const CODEX_PROMPT_DIR: &str = ".qmai/codex-prompts";

fn append_capped_line(collected: &mut String, line: &str, limit_bytes: usize) {
    if collected.len() >= limit_bytes {
        return;
    }
    for ch in line.chars() {
        if collected.len() + ch.len_utf8() > limit_bytes {
            break;
        }
        collected.push(ch);
    }
    if collected.len() < limit_bytes {
        collected.push('\n');
    }
}

async fn find_codex_command() -> Result<PathBuf, String> {
    find_cli_command("codex", &["codex.cmd", "codex.exe"]).await
}

fn safe_prompt_file_stem(stream_id: &str) -> String {
    let stem: String = stream_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if stem.is_empty() {
        "prompt".to_string()
    } else {
        stem
    }
}

async fn write_codex_prompt_file(
    project_dir: Option<&Path>,
    stream_id: &str,
    prompt: &str,
) -> Result<PathBuf, String> {
    let base_dir = match project_dir {
        Some(dir) => dir.to_path_buf(),
        None => std::env::current_dir()
            .map_err(|error| format!("Failed to resolve current directory: {error}"))?,
    };
    let prompt_dir = base_dir.join(CODEX_PROMPT_DIR);
    fs::create_dir_all(&prompt_dir).await.map_err(|error| {
        format!(
            "Failed to create Codex prompt directory '{}': {error}",
            prompt_dir.display()
        )
    })?;

    let path = prompt_dir.join(format!("{}.txt", safe_prompt_file_stem(stream_id)));
    fs::write(&path, prompt).await.map_err(|error| {
        format!(
            "Failed to write Codex prompt file '{}': {error}",
            path.display()
        )
    })?;
    Ok(path)
}

fn suppress_windows_console(_cmd: &mut Command) {
    #[cfg(windows)]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        _cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

fn isolate_llm_api_key_env(cmd: &mut Command) {
    for key in [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "OPENAI_BASE_URL",
        "OPENAI_API_BASE",
        "ANTHROPIC_BASE_URL",
    ] {
        cmd.env_remove(key);
    }
}

/// Detect whether `codex` is installed on PATH.
///
/// Shared implementation used by both the Tauri command and the server handler.
pub async fn do_codex_cli_detect() -> Result<DetectResult, String> {
    let local_config = read_current_codex_local_config();
    let path = match find_codex_command().await {
        Ok(p) => p,
        Err(error) => {
            return Ok(DetectResult {
                installed: false,
                version: None,
                path: None,
                model: local_config.model,
                error: Some(error),
            });
        }
    };

    let path_str = path.to_string_lossy().to_string();
    let mut cmd = Command::new(&path);
    suppress_windows_console(&mut cmd);
    apply_local_cli_environment(&mut cmd);
    if let Some(path_env) = child_path_env().await {
        cmd.env("PATH", path_env);
    }
    let output = tokio::time::timeout(Duration::from_secs(3), cmd.arg("--version").output()).await;

    match output {
        Ok(Ok(out)) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            Ok(DetectResult {
                installed: true,
                version: Some(stdout),
                path: Some(path_str),
                model: local_config.model,
                error: None,
            })
        }
        Ok(Ok(out)) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            Ok(DetectResult {
                installed: false,
                version: None,
                path: Some(path_str),
                model: local_config.model,
                error: Some(if stderr.is_empty() {
                    format!("`codex --version` exited with {}", out.status)
                } else {
                    stderr
                }),
            })
        }
        Ok(Err(e)) => Ok(DetectResult {
            installed: false,
            version: None,
            path: Some(path_str),
            model: local_config.model,
            error: Some(format!("Failed to spawn `codex`: {e}")),
        }),
        Err(_) => Ok(DetectResult {
            installed: false,
            version: None,
            path: Some(path_str),
            model: local_config.model,
            error: Some("`codex --version` timed out after 3s".to_string()),
        }),
    }
}

#[tauri::command]
pub async fn codex_cli_detect() -> Result<DetectResult, String> {
    do_codex_cli_detect().await
}

#[tauri::command]
pub async fn codex_cli_list_models() -> Result<ModelListResult, String> {
    let codex = find_codex_command().await?;
    let mut cmd = Command::new(&codex);
    suppress_windows_console(&mut cmd);
    apply_local_cli_environment(&mut cmd);
    if let Some(path_env) = child_path_env().await {
        cmd.env("PATH", path_env);
    }

    let output = tokio::time::timeout(
        Duration::from_secs(20),
        cmd.args(["debug", "models"]).output(),
    )
    .await
    .map_err(|_| "`codex debug models` timed out after 20 seconds".to_string())?
    .map_err(|error| format!("Failed to run `codex debug models`: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("`codex debug models` exited with {}", output.status)
        } else {
            stderr
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(ModelListResult {
        models: parse_codex_debug_models(&stdout)?,
    })
}

/// Spawn `codex exec --json` and pipe stdout back via the given emitter.
/// Closes stdin after writing the prompt so codex starts processing.
/// Emits a final done event with `{ code, stderr, stdout }` when the
/// child exits.
///
/// Shared implementation used by both the Tauri command and the server handler.
pub async fn do_codex_cli_spawn<E: CodexEmitter>(
    state: &CodexCliState,
    emitter: E,
    stream_id: String,
    model: String,
    prompt: String,
    isolate_local_config: bool,
    project_path: Option<String>,
    timeout_minutes: Option<u64>,
) -> Result<(), String> {
    if prompt.trim().is_empty() {
        return Err("No prompt to send to codex CLI".to_string());
    }

    let codex = find_codex_command().await?;
    let project_dir = resolve_cli_project_dir(project_path.as_deref())?;
    let prompt_file = write_codex_prompt_file(project_dir.as_deref(), &stream_id, &prompt).await?;
    let mut cmd = Command::new(&codex);
    suppress_windows_console(&mut cmd);
    apply_local_cli_environment(&mut cmd);
    if let Some(path_env) = child_path_env().await {
        cmd.env("PATH", path_env);
    }
    if isolate_local_config {
        isolate_llm_api_key_env(&mut cmd);
    }
    if let Some(dir) = &project_dir {
        cmd.current_dir(dir);
    }
    cmd.args(build_codex_cli_args(
        &model,
        isolate_local_config,
        project_dir.as_deref(),
        &prompt_file,
    ));

    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_file(&prompt_file).await;
            return Err(format!("Failed to spawn codex: {error}"));
        }
    };

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Missing stdout handle".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Missing stderr handle".to_string())?;

    state.children.lock().await.insert(stream_id.clone(), child);

    let children = Arc::clone(&state.children);
    let timeout_children = Arc::clone(&state.children);
    let timed_out = Arc::new(AtomicBool::new(false));
    let timeout_flag = Arc::clone(&timed_out);
    let timeout_stream_id = stream_id.clone();
    let timeout_minutes = codex_spawn_timeout_minutes(timeout_minutes);
    let timeout_duration = Duration::from_secs(timeout_minutes * 60);
    let stream_id_task = stream_id.clone();
    let prompt_file_task = prompt_file.clone();
    let emitter_task = emitter.clone();

    tokio::spawn(async move {
        tokio::time::sleep(timeout_duration).await;
        if let Some(mut child) = timeout_children.lock().await.remove(&timeout_stream_id) {
            timeout_flag.store(true, Ordering::SeqCst);
            let _ = child.start_kill();
        }
    });

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        let stderr_task = tokio::spawn(async move {
            let mut collected = String::new();
            while let Ok(Some(line)) = stderr_reader.next_line().await {
                eprintln!("[codex-cli stderr] {line}");
                append_capped_line(&mut collected, &line, STDERR_LIMIT_BYTES);
            }
            collected
        });

        let mut stdout_text = String::new();
        loop {
            match reader.next_line().await {
                Ok(Some(line)) => {
                    append_capped_line(&mut stdout_text, &line, STDOUT_LIMIT_BYTES);
                    emitter_task.emit_data(&stream_id_task, line);
                }
                Ok(None) => break,
                Err(e) => {
                    eprintln!("[codex-cli stdout] read error: {e}");
                    break;
                }
            }
        }

        let child_opt = children.lock().await.remove(&stream_id_task);
        let exit_code = if let Some(mut child) = child_opt {
            match child.wait().await {
                Ok(status) => status.code(),
                Err(_) => None,
            }
        } else {
            None
        };
        let _ = fs::remove_file(&prompt_file_task).await;

        let mut stderr_text = stderr_task.await.unwrap_or_default();
        if timed_out.load(Ordering::SeqCst) {
            if !stderr_text.is_empty() {
                stderr_text.push('\n');
            }
            stderr_text.push_str(&format!("Codex CLI timed out after {timeout_minutes} minutes."));
        } else if stderr_text.len() >= STDERR_LIMIT_BYTES {
            stderr_text.push_str("\n[stderr truncated]");
        }
        if stdout_text.len() >= STDOUT_LIMIT_BYTES {
            stdout_text.push_str("\n[stdout truncated]");
        }

        let code = if timed_out.load(Ordering::SeqCst) {
            Some(-1)
        } else {
            exit_code
        };

        emitter_task.emit_done(&stream_id_task, code, stderr_text, stdout_text);
    });

    Ok(())
}

#[tauri::command]
pub async fn codex_cli_spawn(
    app: AppHandle,
    state: State<'_, CodexCliState>,
    stream_id: String,
    model: String,
    prompt: String,
    isolate_local_config: bool,
    project_path: Option<String>,
    timeout_minutes: Option<u64>,
) -> Result<(), String> {
    let emitter = TauriCodexEmitter::new(app);
    do_codex_cli_spawn(
        &state,
        emitter,
        stream_id,
        model,
        prompt,
        isolate_local_config,
        project_path,
        timeout_minutes,
    )
    .await
}

fn codex_spawn_timeout_minutes(value: Option<u64>) -> u64 {
    value
        .unwrap_or(DEFAULT_CODEX_SPAWN_TIMEOUT_MINUTES)
        .clamp(MIN_CODEX_SPAWN_TIMEOUT_MINUTES, MAX_CODEX_SPAWN_TIMEOUT_MINUTES)
}

fn parse_codex_debug_models(stdout: &str) -> Result<Vec<String>, String> {
    let value: serde_json::Value = serde_json::from_str(stdout)
        .map_err(|error| format!("Failed to parse `codex debug models` JSON: {error}"))?;
    let Some(models) = value.get("models").and_then(serde_json::Value::as_array) else {
        return Ok(Vec::new());
    };

    let mut parsed = Vec::new();
    for model in models {
        let slug = model
            .get("slug")
            .or_else(|| model.get("id"))
            .or_else(|| model.get("name"))
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if let Some(slug) = slug {
            parsed.push(slug.to_string());
        }
    }
    parsed.sort();
    parsed.dedup();
    Ok(parsed)
}

fn build_codex_cli_args(
    model: &str,
    isolate_local_config: bool,
    project_dir: Option<&Path>,
    prompt_file: &Path,
) -> Vec<String> {
    let mut args = vec!["-a".to_string(), "never".to_string(), "exec".to_string()];

    if isolate_local_config {
        args.extend([
            "--ignore-user-config".to_string(),
            "--ignore-rules".to_string(),
        ]);
    }

    if let Some(dir) = project_dir {
        args.extend(["--cd".to_string(), dir.to_string_lossy().to_string()]);
    }

    args.extend([
        "--json".to_string(),
        "--skip-git-repo-check".to_string(),
        "--sandbox".to_string(),
        "read-only".to_string(),
        "--ephemeral".to_string(),
    ]);
    if !model.trim().is_empty() {
        args.extend(["--model".to_string(), model.to_string()]);
    }
    args.push(format!(
        "Read the complete user request from this UTF-8 text file and follow it exactly. Return only the final answer unless the file asks otherwise: {}",
        prompt_file.display()
    ));
    args
}

fn read_current_codex_local_config() -> LocalCliConfigInfo {
    let home = resolve_home_dir();
    read_codex_local_config(home.as_deref())
}

/// Kill a running codex child registered under `stream_id`.
/// No-op if the id is unknown (e.g. the process already exited).
///
/// Shared implementation used by both the Tauri command and the server handler.
pub async fn do_codex_cli_kill(state: &CodexCliState, stream_id: &str) -> Result<(), String> {
    if let Some(mut child) = state.children.lock().await.remove(stream_id) {
        let _ = child.start_kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn codex_cli_kill(
    state: State<'_, CodexCliState>,
    stream_id: String,
) -> Result<(), String> {
    do_codex_cli_kill(&state, &stream_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_capped_line_appends_newline_when_space_remains() {
        let mut out = String::new();
        append_capped_line(&mut out, "hello", 16);
        assert_eq!(out, "hello\n");
    }

    #[test]
    fn append_capped_line_never_exceeds_limit() {
        let mut out = String::new();
        append_capped_line(&mut out, "abcdef", 4);
        assert_eq!(out, "abcd");
        assert_eq!(out.len(), 4);
        append_capped_line(&mut out, "ignored", 4);
        assert_eq!(out, "abcd");
    }

    #[test]
    fn append_capped_line_preserves_utf8_boundaries() {
        let mut out = String::new();
        append_capped_line(&mut out, "é水x", 5);
        assert_eq!(out, "é水");
        assert_eq!(out.len(), 5);
        assert!(std::str::from_utf8(out.as_bytes()).is_ok());
    }

    #[test]
    fn codex_spawn_timeout_minutes_defaults_and_clamps() {
        assert_eq!(
            codex_spawn_timeout_minutes(None),
            DEFAULT_CODEX_SPAWN_TIMEOUT_MINUTES
        );
        assert_eq!(codex_spawn_timeout_minutes(Some(0)), MIN_CODEX_SPAWN_TIMEOUT_MINUTES);
        assert_eq!(codex_spawn_timeout_minutes(Some(42)), 42);
        assert_eq!(
            codex_spawn_timeout_minutes(Some(999)),
            MAX_CODEX_SPAWN_TIMEOUT_MINUTES
        );
    }

    #[test]
    fn codex_args_do_not_isolate_local_config_by_default() {
        let prompt_file = Path::new(".qmai/codex-prompts/test.txt");
        let args = build_codex_cli_args("gpt-5", false, None, prompt_file);

        assert!(args
            .windows(3)
            .any(|pair| pair[0] == "-a" && pair[1] == "never" && pair[2] == "exec"));
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"gpt-5".to_string()));
        assert!(!args.contains(&"--ignore-user-config".to_string()));
        assert!(!args.contains(&"--ignore-rules".to_string()));
    }

    #[test]
    fn codex_args_can_isolate_user_config_and_rules() {
        let prompt_file = Path::new(".qmai/codex-prompts/test.txt");
        let args = build_codex_cli_args("gpt-5", true, None, prompt_file);
        let exec_pos = args.iter().position(|arg| arg == "exec").expect("exec arg");
        let ignore_config_pos = args
            .iter()
            .position(|arg| arg == "--ignore-user-config")
            .expect("ignore-user-config arg");
        let ignore_rules_pos = args
            .iter()
            .position(|arg| arg == "--ignore-rules")
            .expect("ignore-rules arg");

        assert!(ignore_config_pos > exec_pos);
        assert!(ignore_rules_pos > exec_pos);
    }

    #[test]
    fn codex_args_do_not_isolate_user_api_key_by_default() {
        let prompt_file = Path::new(".qmai/codex-prompts/test.txt");
        let args = build_codex_cli_args("gpt-5", false, None, prompt_file);

        assert!(!args.contains(&"--ignore-user-config".to_string()));
        assert!(!args.contains(&"--ignore-rules".to_string()));
    }

    #[test]
    fn codex_args_skip_model_flag_when_model_is_empty() {
        let prompt_file = Path::new(".qmai/codex-prompts/test.txt");
        let args = build_codex_cli_args("", false, None, prompt_file);
        assert!(!args.contains(&"--model".to_string()));
        assert!(args
            .last()
            .map(|arg| arg.contains(".qmai/codex-prompts/test.txt"))
            .unwrap_or(false));
    }
}
