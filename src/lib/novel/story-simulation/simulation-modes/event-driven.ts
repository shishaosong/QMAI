import { runSimulation, type SimulationCallbacks } from "../simulation-engine"
import type { SimulationInput, ExtractionResult, SimulationEvent } from "../types"

export async function runEventDrivenSimulation(
  input: SimulationInput,
  extraction: ExtractionResult,
  callbacks: SimulationCallbacks,
  signal?: AbortSignal,
): Promise<SimulationEvent[]> {
  return runSimulation({ ...input, mode: "event-driven" }, extraction, callbacks, signal)
}
