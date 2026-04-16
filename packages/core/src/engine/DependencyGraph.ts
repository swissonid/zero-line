export class CyclicDependencyError extends Error {
  constructor(readonly cycle: ReadonlyArray<string>) {
    super(`Cyclic dependency detected: ${cycle.join(" → ")}`)
    this.name = "CyclicDependencyError"
  }
}

export class StepNotFoundError extends Error {
  constructor(readonly stepName: string) {
    super(`Step '${stepName}' not found in loaded steps`)
    this.name = "StepNotFoundError"
  }
}

interface StepNode {
  readonly name: string
  readonly dependsOnSteps: ReadonlyArray<string>
}

export function buildExecutionOrder(
  allSteps: ReadonlyArray<StepNode>,
  workflowSteps: ReadonlyArray<string>,
  onWarn: (message: string) => void = (m) => console.warn(m)
): ReadonlyArray<string> {
  const stepMap = new Map<string, StepNode>()
  for (const step of allSteps) {
    stepMap.set(step.name, step)
  }

  for (const name of workflowSteps) {
    if (!stepMap.has(name)) {
      throw new StepNotFoundError(name)
    }
  }

  const workflowSet = new Set(workflowSteps)
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const order: string[] = []

  function visit(name: string, path: string[]) {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      throw new CyclicDependencyError([...path, name])
    }

    visiting.add(name)
    const step = stepMap.get(name)
    if (step) {
      for (const dep of step.dependsOnSteps) {
        if (workflowSet.has(dep)) {
          visit(dep, [...path, name])
        } else {
          onWarn(
            `Step '${name}' dependsOnSteps '${dep}', which is not in the current workflow — dependency skipped.`
          )
        }
      }
    }
    visiting.delete(name)
    visited.add(name)
    order.push(name)
  }

  for (const name of workflowSteps) {
    visit(name, [])
  }

  return order
}
