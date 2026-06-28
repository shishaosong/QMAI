import { runSimulation, type SimulationCallbacks } from "../simulation-engine"
import type { SimulationInput, ExtractionResult, SimulationEvent } from "../types"

export async function runFreeEmergenceSimulation(
  input: SimulationInput,
  extraction: ExtractionResult,
  callbacks: SimulationCallbacks,
  signal?: AbortSignal,
): Promise<SimulationEvent[]> {
  return runSimulation({ ...input, mode: "free-emergence", injectionEvent: undefined }, extraction, callbacks, signal)
}
