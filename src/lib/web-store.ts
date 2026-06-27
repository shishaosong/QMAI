export async function getStore() {
  const { load } = await import("@tauri-apps/plugin-store")
  return load("app-state.json", { autoSave: true, defaults: {} })
}
