import { runSimulation, type SimulationCallbacks } from "../simulation-engine"
import type { SimulationInput, ExtractionResult, SimulationEvent } from "../types"

export async function runHybridSimulation(
  input: SimulationInput,
  extraction: ExtractionResult,
  callbacks: SimulationCallbacks,
  signal?: AbortSignal,
): Promise<SimulationEvent[]> {
  return runSimulation({ ...input, mode: "hybrid" }, extraction, callbacks, signal)
}
