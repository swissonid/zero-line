// Step contract
export {
  defineStep,
  defineEffectStep,
  type StepContext,
  type OptionsSchema,
  type PluginStep,
  type SimplePluginStep,
  type EffectPluginStep,
  type ResolvedStep,
  type SubcommandHandler,
} from "./step-loader/StepContract"
export { buildSubcommandRegistry } from "./cli/SubcommandRegistry"
export { loadSteps } from "./step-loader/StepLoader"
export { resolveShortName, detectCollisions } from "./step-loader/StepNameResolver"
export {
  gatherRequirements,
  type RequirementEntry,
  type Requirements,
} from "./step-loader/StepRequirements"

// Config
export { defineConfig, type ZlConfig, type Platform, type StepInstance } from "./config/ConfigTypes"
export { ConfigValidationError } from "./config/validateConfig"
export {
  validateStepOptions,
  type PluginLike,
  type PluginLoader as OptionsPluginLoader,
} from "./config/validateStepOptions"
export {
  resolveStepInstances,
  defaultPluginLoader,
  type PluginLoader,
} from "./step-loader/StepInstanceResolver"
export { unwrapDefaultExport } from "./step-loader/unwrapDefaultExport"

// Engine
export { definePipeline, DefaultRuntimeLayer, type Pipeline, type StepResult, type PipelineConfig } from "./engine/Pipeline"
export { buildExecutionOrder, CyclicDependencyError } from "./engine/DependencyGraph"

// Ports (re-export from subpath)
export { LoggerService, ConfigService, PlatformService, ArtifactService, ShellService, ShellError, SecretStore, SecretStoreError, type SecretStoreErrorCode } from "./ports/index"

// Adapters
export { ConsoleLoggerLive } from "./adapters/ConsoleLogger"
export { makeFileConfigLayer } from "./adapters/FileConfig"
export { LocalEnvConfigLive } from "./adapters/LocalEnvConfig"
export { LocalPlatformLive } from "./adapters/LocalPlatform"
export { MemoryArtifactStoreLive } from "./adapters/MemoryArtifactStore"
export { LocalShellLive } from "./adapters/LocalShell"
export { MacOSKeychainSecretStoreLive } from "./adapters/MacOSKeychainSecretStore"
