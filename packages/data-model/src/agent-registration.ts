export type AgentRegistrationId = {
  id: string
  type: string[]
}

export type AgentRegistrationData = AgentRegistrationId & {
  registeredAgent: string
  hasDataGrant?: string[]
}

export function getDataGrantIris(data: AgentRegistrationData): string[] {
  return data.hasDataGrant ?? []
}
