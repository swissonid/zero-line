export interface AppConfig {
  readonly name: string
  readonly bundleId: string
}

export type Platform = "ios" | "android"

export interface PlatformConfig {
  readonly steps: ReadonlyArray<StepInstance>
}

export interface StepInstance {
  readonly name: string
  readonly options: Record<string, unknown>
}

export interface WorkflowConfig {
  readonly [name: string]: ReadonlyArray<string>
}

export interface ZlConfig {
  readonly app: AppConfig
  readonly platforms: Partial<Record<Platform, PlatformConfig>>
  readonly steps?: ReadonlyArray<StepInstance>
  readonly workflows: WorkflowConfig
}

export function defineConfig(config: ZlConfig): ZlConfig {
  return config
}
