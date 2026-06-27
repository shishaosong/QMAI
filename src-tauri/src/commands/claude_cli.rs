//! Claude Code CLI subprocess transport.
//!
//! Users with a Claude Code subscription already have OAuth credentials
//! in ~/.claude/ and the `claude` binary on PATH. This module lets LLM
//! Wiki reuse that subscription instead of requiring a separate API key.
//! We treat `claude` purely as a text-completion engine — its agent
//! tools, MCPs, file-edit abilities, and --resume session state are all
//! out of scope. Multi-turn history is reconstructed from `messages`
//! on every call, symmetric with every other provider.
//!
//! Why tokio::process directly (not tauri-plugin-shell): the plugin's
//! scope model is designed for sidecars or fixed absolute paths; scoping
//! a user-installed PATH binary cleanly is awkward. A hardcoded Rust
//! command that always and only spawns `claude` provides the same
//! security property (the webview can't call this command to execute
//! anything else) without pulling in another plugin or editing
//! capabilities JSON.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::cli_resolver::find_cli_command;
use super::local_cli_config::{
    apply_local_cli_environment, apply_project_local_cli_environment, read_claude_local_config,
    resolve_cli_project_dir, resolve_home_dir, LocalCliConfigInfo,
};

const CLAUDE_CLI_KNOWN_MODEL_ALIASES: &[&str] = &["fable", "opus", "sonnet"];
const CLAUDE_CLI_KNOWN_MODELS: &[&str] = &[
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
];
// ── Event emitter abstraction ─────────────────────────────────────
// Allows both Tauri (app.emit) and the standalone server (broadcast
// channel) to share the same spawn logic.

/// Abstraction over "emit a data line" and "emit a done signal".
pub trait CliEmitter: Clone + Send + Sync + 'static {
    fn emit_data(&self, stream_id: &str, data: String);
    fn emit_done(&self, stream_id: &str, code: Option<i32>, stderr: String);
}

/// Tauri-based emitter that forwards to `app.emit()`.
#[derive(Clone)]
pub struct TauriCliEmitter {
    app: AppHandle,
}

impl TauriCliEmitter {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl CliEmitter for TauriCliEmitter {
    fn emit_data(&self, stream_id: &str, data: String) {
        let topic = format!("claude-cli:{stream_id}");
        let _ = self.app.emit(&topic, data);
    }

    fn emit_done(&self, stream_id: &str, code: Option<i32>, stderr: String) {
        let done_topic = format!("claude-cli:{stream_id}:done");
        let _ = self.app.emit(
            &done_topic,
            serde_json::json!({
                "code": code,
                "stderr": stderr,
            }),
        );
    }
}

/// Shared state holding running `claude` child processes keyed by the
/// frontend-generated stream id. Registered via .manage() in lib.rs.
#[derive(Default)]
pub struct ClaudeCliState {
    children: Arc<Mutex<HashMap<String, Child>>>,
}

#[derive(Serialize)]
pub struct DetectResult {
    installed: bool,
    version: Option<String>,
    path: Option<String>,
    model: Option<String>,
    /// When !installed, a short human-readable reason (missing from PATH,
    /// quarantined on macOS, spawn failed, etc). The frontend shows this
    /// verbatim in the status pill.
    error: Option<String>,
}

#[derive(Serialize)]
pub struct ModelListResult {
    models: Vec<String>,
}

#[derive(Deserialize)]
pub struct ClaudeMessage {
    /// "system" | "user" | "assistant"
    role: String,
    content: ClaudeContent,
}

#[derive(Clone, Deserialize)]
#[serde(untagged)]
enum ClaudeContent {
    Text(String),
    Blocks(Vec<ClaudeContentBlock>),
}

#[derive(Clone, Deserialize)]
#[serde(tag = "type")]
enum ClaudeContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image {
        #[serde(rename = "mediaType")]
        media_type: String,
        #[serde(rename = "dataBase64")]
        data_base64: String,
    },
}

fn claude_content_text_only(content: &ClaudeContent) -> String {
    match content {
        ClaudeContent::Text(text) => text.clone(),
        ClaudeContent::Blocks(blocks) => blocks
            .iter()
            .filter_map(|block| match block {
                ClaudeContentBlock::Text { text } => Some(text.as_str()),
                ClaudeContentBlock::Image { .. } => None,
            })
            .collect::<Vec<_>>()
            .join(""),
    }
}

fn claude_content_blocks(content: &ClaudeContent) -> Vec<serde_json::Value> {
    match content {
        ClaudeContent::Text(text) => vec![serde_json::json!({ "type": "text", "text": text })],
        ClaudeContent::Blocks(blocks) => blocks
            .iter()
            .map(|block| match block {
                ClaudeContentBlock::Text { text } => {
                    serde_json::json!({ "type": "text", "text": text })
                }
                ClaudeContentBlock::Image {
                    media_type,
                    data_base64,
                } => serde_json::json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": data_base64,
                    },
                }),
            })
            .collect(),
    }
}

async fn find_claude_command() -> Result<std::path::PathBuf, String> {
    find_cli_command("claude", &["claude.cmd", "claude.exe"]).await
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

/// Locate `claude` on PATH and confirm it's runnable by calling
/// `claude --version` with a short timeout. Cheap — safe to call on
/// mount of the settings panel.
///
/// Shared implementation used by both the Tauri command and the server handler.
pub async fn do_claude_cli_detect() -> Result<DetectResult, String> {
    let local_config = read_current_claude_local_config();
    let path = match find_claude_command().await {
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
    let output = tokio::time::timeout(Duration::from_secs(3), cmd.arg("--version").output()).await;

    match output {
        Ok(Ok(out)) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            Ok(DetectResult {
                installed: true,
                version: Some(version),
                path: Some(path_str),
                model: local_config.model,
                error: None,
            })
        }
        Ok(Ok(out)) => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            // macOS Gatekeeper quarantines produce a predictable error. If
            // we detect it, surface the remediation hint directly; the UI
            // renders this string into an actionable message.
            let error = if stderr.contains("quarantine") || stderr.contains("damaged") {
                Some(format!(
                    "Binary quarantined — try: xattr -d com.apple.quarantine {path_str}"
                ))
            } else if stderr.is_empty() {
                Some(format!("`claude --version` exited with {}", out.status))
            } else {
                Some(stderr)
            };
            Ok(DetectResult {
                installed: false,
                version: None,
                path: Some(path_str),
                model: local_config.model,
                error,
            })
        }
        Ok(Err(e)) => Ok(DetectResult {
            installed: false,
            version: None,
            path: Some(path_str),
            model: local_config.model,
            error: Some(format!("Failed to spawn `claude`: {e}")),
        }),
        Err(_) => Ok(DetectResult {
            installed: false,
            version: None,
            path: Some(path_str),
            model: local_config.model,
            error: Some("`claude --version` timed out after 3s".to_string()),
        }),
    }
}

#[tauri::command]
pub async fn claude_cli_detect() -> Result<DetectResult, String> {
    do_claude_cli_detect().await
}

pub async fn do_claude_cli_list_models(
    project_path: Option<String>,
) -> Result<ModelListResult, String> {
    let local_config = read_current_claude_local_config();
    let claude = find_claude_command().await?;
    let project_dir = resolve_cli_project_dir(project_path.as_deref())?;

    let mut cmd = Command::new(&claude);
    suppress_windows_console(&mut cmd);
    apply_local_cli_environment(&mut cmd);
    apply_project_local_cli_environment(&mut cmd, project_dir.as_deref());
    if let Some(dir) = &project_dir {
        cmd.current_dir(dir);
    }
    let output = tokio::time::timeout(Duration::from_secs(5), cmd.arg("--help").output())
        .await
        .map_err(|_| "`claude --help` timed out after 5s".to_string())?
        .map_err(|error| format!("Failed to run `claude --help`: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("`claude --help` exited with {}", output.status)
        } else {
            stderr
        });
    }

    let help = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(ModelListResult {
        models: build_claude_model_list(local_config.model.as_deref(), &help),
    })
}

#[tauri::command]
pub async fn claude_cli_list_models(
    project_path: Option<String>,
) -> Result<ModelListResult, String> {
    do_claude_cli_list_models(project_path).await
}

/// Spawn `claude -p --output-format stream-json --input-format stream-json
/// --verbose --model <model>` and pipe stdout back via the given emitter.
/// Closes stdin after writing the serialized history so claude starts
/// processing. Emits a final done event with `{ code }` when the child exits.
///
/// Shared implementation used by both the Tauri command and the server handler.
pub async fn do_claude_cli_spawn<E: CliEmitter>(
    state: &ClaudeCliState,
    emitter: E,
    stream_id: String,
    model: String,
    messages: Vec<ClaudeMessage>,
    isolate_local_config: bool,
    project_path: Option<String>,
) -> Result<(), String> {
    // Build the turn list: fold any system messages into a preamble on
    // the first user turn rather than using a CLI flag, because
    // --system-prompt / --append-system-prompt availability varies
    // across claude CLI versions. Inlining works on every version.
    let system_preamble: String = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| claude_content_text_only(&m.content))
        .collect::<Vec<_>>()
        .join("\n\n");

    let conversation: Vec<&ClaudeMessage> = messages
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .collect();

    if conversation.is_empty() {
        return Err("No user/assistant messages to send to claude CLI".to_string());
    }

    // Synthesize turns with the preamble merged into the first user turn.
    let mut first_user_seen = false;
    let turns: Vec<(String, Vec<serde_json::Value>)> = conversation
        .iter()
        .map(|m| {
            let role = m.role.clone();
            let mut content = claude_content_blocks(&m.content);
            if !first_user_seen && role == "user" && !system_preamble.is_empty() {
                content.insert(
                    0,
                    serde_json::json!({ "type": "text", "text": format!("{system_preamble}\n\n") }),
                );
                first_user_seen = true;
            }
            (role, content)
        })
        .collect();

    let claude = find_claude_command().await?;
    let project_dir = resolve_cli_project_dir(project_path.as_deref())?;
    let mut cmd = Command::new(&claude);
    suppress_windows_console(&mut cmd);
    apply_local_cli_environment(&mut cmd);
    apply_project_local_cli_environment(&mut cmd, project_dir.as_deref());
    if let Some(dir) = &project_dir {
        cmd.current_dir(dir);
    }
    let empty_mcp_config = if isolate_local_config {
        Some(ensure_empty_mcp_config_file()?)
    } else {
        None
    };
    cmd.args(build_claude_cli_args(
        &model,
        isolate_local_config,
        empty_mcp_config.as_deref(),
    ));

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Missing stdin handle".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Missing stdout handle".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Missing stderr handle".to_string())?;

    // Serialize turns to stdin then close. stream-json input format
    // expects one JSON event per line. Conversation history is laid out
    // in order; the final user turn triggers claude's response.
    //
    // `content` MUST be an array of blocks, not a plain string. The CLI
    // iterates content blocks looking for `tool_use_id` and crashes with
    // `W is not an Object. (evaluating '"tool_use_id"in W')` if it
    // encounters a raw string. User turns silently tolerated a string
    // in light testing, but assistant turns reject it immediately, so
    // we normalize both roles to the block-array form.
    for (role, content) in &turns {
        let event = serde_json::json!({
            "type": role,
            "message": {
                "role": role,
                "content": content,
            }
        });
        let line = format!("{}\n", event);
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to claude stdin: {e}"))?;
    }
    stdin
        .flush()
        .await
        .map_err(|e| format!("Failed to flush claude stdin: {e}"))?;
    drop(stdin);

    // Register the child so `claude_cli_kill` can reach it.
    state.children.lock().await.insert(stream_id.clone(), child);

    let children = Arc::clone(&state.children);
    let stream_id_task = stream_id.clone();
    let emitter_task = emitter.clone();

    // Drain stdout line-by-line in a background task, emitting each
    // line as an event. Completes when stdout closes (child exited).
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut stderr_reader = BufReader::new(stderr).lines();

        // Collect stderr in a background task so we can ship it with the
        // final :done event — otherwise a non-zero exit produces only
        // "exited with code N" with no diagnostic info on the frontend.
        // Also echo each line to the tauri dev terminal so the developer
        // can watch the CLI's stderr live while iterating.
        let stderr_task = tokio::spawn(async move {
            let mut collected = String::new();
            while let Ok(Some(line)) = stderr_reader.next_line().await {
                eprintln!("[claude-cli stderr] {line}");
                collected.push_str(&line);
                collected.push('\n');
            }
            collected
        });

        loop {
            match reader.next_line().await {
                Ok(Some(line)) => {
                    emitter_task.emit_data(&stream_id_task, line);
                }
                Ok(None) => break,
                Err(e) => {
                    eprintln!("[claude-cli stdout] read error: {e}");
                    break;
                }
            }
        }

        // Wait for the child to fully exit so we can report its code.
        // Don't hold the map lock across .wait() — kill could race.
        let child_opt = children.lock().await.remove(&stream_id_task);
        let exit_code = if let Some(mut child) = child_opt {
            match child.wait().await {
                Ok(status) => status.code(),
                Err(_) => None,
            }
        } else {
            // Already removed by claude_cli_kill — leave code as None.
            None
        };

        let stderr_text = stderr_task.await.unwrap_or_default();

        emitter_task.emit_done(&stream_id_task, exit_code, stderr_text);
    });

    Ok(())
}

#[tauri::command]
pub async fn claude_cli_spawn(
    app: AppHandle,
    state: State<'_, ClaudeCliState>,
    stream_id: String,
    model: String,
    messages: Vec<ClaudeMessage>,
    isolate_local_config: bool,
    project_path: Option<String>,
) -> Result<(), String> {
    let emitter = TauriCliEmitter::new(app);
    do_claude_cli_spawn(
        &state,
        emitter,
        stream_id,
        model,
        messages,
        isolate_local_config,
        project_path,
    )
    .await
}

fn ensure_empty_mcp_config_file() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("qmai-claude-cli");
    std::fs::create_dir_all(&dir).map_err(|error| {
        format!(
            "Failed to create Claude MCP config directory '{}': {error}",
            dir.display()
        )
    })?;

    let path = dir.join("empty-mcp-config.json");
    let contents = "{\"mcpServers\":{}}\n";
    std::fs::write(&path, contents).map_err(|error| {
        format!(
            "Failed to write empty Claude MCP config '{}': {error}",
            path.display()
        )
    })?;
    Ok(path)
}

fn build_claude_cli_args(
    model: &str,
    isolate_local_config: bool,
    empty_mcp_config_path: Option<&Path>,
) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];

    if isolate_local_config {
        let mcp_config_path = empty_mcp_config_path
            .expect("empty MCP config path is required when isolating Claude local config")
            .to_string_lossy()
            .to_string();
        args.extend([
            "--setting-sources".to_string(),
            "project".to_string(),
            "--strict-mcp-config".to_string(),
            "--mcp-config".to_string(),
            mcp_config_path,
            "--disable-slash-commands".to_string(),
            "--tools".to_string(),
            "".to_string(),
            "--no-session-persistence".to_string(),
            "--prompt-suggestions".to_string(),
            "false".to_string(),
        ]);
    }

    if !model.trim().is_empty() {
        args.extend(["--model".to_string(), model.to_string()]);
    }
    args
}

fn read_current_claude_local_config() -> LocalCliConfigInfo {
    let home = resolve_home_dir();
    read_claude_local_config(home.as_deref())
}

fn push_unique_model(models: &mut Vec<String>, model: &str) {
    let trimmed = model.trim();
    if trimmed.is_empty() || models.iter().any(|existing| existing == trimmed) {
        return;
    }
    models.push(trimmed.to_string());
}

fn build_claude_model_list(local_model: Option<&str>, help: &str) -> Vec<String> {
    let mut models = Vec::new();

    if let Some(model) = local_model {
        push_unique_model(&mut models, model);
    }

    for model in CLAUDE_CLI_KNOWN_MODELS {
        push_unique_model(&mut models, model);
    }

    for alias in CLAUDE_CLI_KNOWN_MODEL_ALIASES {
        if help.contains(alias) {
            push_unique_model(&mut models, alias);
        }
    }

    models.sort();
    models.dedup();
    models
}

/// Kill a running child registered under `stream_id`. Called on
/// AbortSignal in the frontend. No-op if the id is unknown (e.g. the
/// process already exited).
///
/// Shared implementation used by both the Tauri command and the server handler.
pub async fn do_claude_cli_kill(state: &ClaudeCliState, stream_id: &str) -> Result<(), String> {
    if let Some(mut child) = state.children.lock().await.remove(stream_id) {
        let _ = child.start_kill();
        // Don't wait() here — the stdout-drain task already holds a
        // wait future elsewhere when it can. Dropping the handle is
        // enough; kill_on_drop ensures the SIGKILL is sent.
    }
    Ok(())
}

#[tauri::command]
pub async fn claude_cli_kill(
    state: State<'_, ClaudeCliState>,
    stream_id: String,
) -> Result<(), String> {
    do_claude_cli_kill(&state, &stream_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_content_blocks_maps_frontend_image_blocks_to_anthropic_shape() {
        let content: ClaudeContent = serde_json::from_value(serde_json::json!([
            { "type": "text", "text": "describe this" },
            { "type": "image", "mediaType": "image/png", "dataBase64": "abc123" }
        ]))
        .expect("content block payload should deserialize");

        let blocks = claude_content_blocks(&content);

        assert_eq!(
            blocks,
            vec![
                serde_json::json!({ "type": "text", "text": "describe this" }),
                serde_json::json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": "abc123",
                    },
                }),
            ]
        );
    }

    #[test]
    fn system_text_drops_images_before_inlining_preamble() {
        let content: ClaudeContent = serde_json::from_value(serde_json::json!([
            { "type": "text", "text": "system rule" },
            { "type": "image", "mediaType": "image/png", "dataBase64": "abc123" }
        ]))
        .expect("content block payload should deserialize");

        assert_eq!(claude_content_text_only(&content), "system rule");
    }

    #[test]
    fn claude_args_do_not_isolate_local_config_by_default() {
        let args = build_claude_cli_args("sonnet", false, None);

        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"sonnet".to_string()));
        assert!(!args.contains(&"--setting-sources".to_string()));
        assert!(!args.contains(&"--strict-mcp-config".to_string()));
        assert!(!args.contains(&"--disable-slash-commands".to_string()));
    }

    #[test]
    fn claude_args_can_isolate_user_config_tools_and_mcp() {
        let mcp_config_path = std::env::temp_dir().join("qmai-test-empty-mcp-config.json");
        let mcp_config_path_string = mcp_config_path.to_string_lossy().to_string();
        let args = build_claude_cli_args("sonnet", true, Some(&mcp_config_path));

        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--setting-sources" && pair[1] == "project"));
        assert!(args.contains(&"--strict-mcp-config".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--mcp-config" && pair[1] == mcp_config_path_string));
        assert!(!args.iter().any(|arg| arg.starts_with("{\"mcpServers\"")));
        assert!(args.contains(&"--disable-slash-commands".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--tools" && pair[1].is_empty()));
        assert!(args.contains(&"--no-session-persistence".to_string()));
        assert!(args
            .windows(2)
            .any(|pair| pair[0] == "--prompt-suggestions" && pair[1] == "false"));
    }

    #[test]
    fn claude_args_skip_model_flag_when_model_is_empty() {
        let args = build_claude_cli_args("", false, None);
        assert!(!args.contains(&"--model".to_string()));
    }

    #[test]
    fn claude_model_list_includes_local_model_known_models_and_help_aliases() {
        let models = build_claude_model_list(
            Some("my-custom-claude"),
            "--model <model> Provide an alias for the latest model, e.g. 'fable', 'opus', or 'sonnet'.",
        );

        assert!(models.contains(&"my-custom-claude".to_string()));
        assert!(models.contains(&"claude-sonnet-4-6".to_string()));
        assert!(models.contains(&"fable".to_string()));
        assert!(models.contains(&"opus".to_string()));
        assert!(models.contains(&"sonnet".to_string()));
    }
}
