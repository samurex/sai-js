import {
  type AgentAndClient,
  type ApplicationRegistrationData,
  type ApplicationRegistryData,
  dataModelContext,
} from '@janeirodigital/interop-data-model'
import { type WhatwgFetch, createContainer, withContext } from '@janeirodigital/interop-utils'

import { addApplicationRegistration, findApplicationRegistration } from './agent-registry'
import type { DataModelDependencies } from './types'

// ──────────────────────────
// Write path: ApplicationRegistrationData → container (container.create)
// ──────────────────────────

/**
 * Ensure the grantee has an application registration in the registry
 * (find-first idempotent) — the activity-first granting workflow's app-leg
 * (only Application grantees are auto-registered at grant time;
 * authorization-granting.md Step 2). The grantee kind cannot ride the wire
 * (no `agentType` term), so the workflow infers it (`typeGrantee` failure).
 */
export async function ensureApplicationRegistration(
  applicationRegistry: ApplicationRegistryData,
  deps: DataModelDependencies,
  creator: AgentAndClient,
  registeredAgent: string
): Promise<void> {
  const existing = await findApplicationRegistration(
    applicationRegistry,
    deps.fetch,
    registeredAgent
  )
  if (existing) return
  await addApplicationRegistration(applicationRegistry, deps, creator, registeredAgent)
}

export async function createApplicationRegistration(
  data: ApplicationRegistrationData,
  fetch: WhatwgFetch
): Promise<void> {
  // the document is the POJO with the shared context — the rdf:type quad comes
  // from `data.type` (captured from framing on read); createContainer PUTs the
  // container and patches its description resource with `INSERT DATA`
  await createContainer(data.id, fetch, withContext(dataModelContext, data))
}
