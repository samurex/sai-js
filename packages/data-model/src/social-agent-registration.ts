import { type JsonLdContext, type LanguageMap, frameNode, opt } from '@janeirodigital/interop-utils'
import type { AgentRegistrationId } from './agent-registration'
import { dataModelContext } from './context'

export type SocialAgentRegistrationId = AgentRegistrationId

export type SocialAgentRegistrationData = SocialAgentRegistrationId & {
  registeredAgent: string
  hasDataGrant?: string[]
  hasAdminGrant?: string[]
  /** language map — the untagged label under `@none`, translations under their tags */
  label: LanguageMap
  note?: string
  reciprocalRegistration?: string
}

export type SocialAgentId = {
  id: string
  type: string[]
}

// ──────────────────────────
// Read path: JSON-LD → SocialAgentRegistrationData
// ──────────────────────────

const SOCIAL_AGENT_REGISTRATION_TERMS = [
  'registeredAgent',
  'hasDataGrant',
  'hasAdminGrant',
  'label',
  'note',
  'reciprocalRegistration',
]

/**
 * Convert a JSON-LD document (fetched as application/ld+json) directly into a
 * SocialAgentRegistrationData POJO.
 *
 * The document can be in expanded, compacted, or flattened form. Uses
 * jsonld.frame with the shared data model context: node references
 * (`registeredAgent`, `reciprocalRegistration`) are
 * coerced to strings via `@type: '@id'`, `hasDataGrant` to a string array via
 * `@type: '@id'` + `@container: '@set'`, literals to plain strings, and the
 * rdf:type (from framing) to a string array.
 */
export async function fromJsonLd(doc: unknown, id: string): Promise<SocialAgentRegistrationData> {
  const node = await frameNode(doc, dataModelContext, id)
  return {
    id,
    type: node.type ?? [],
    registeredAgent: node.registeredAgent as string,
    hasDataGrant: node.hasDataGrant as string[],
    hasAdminGrant: node.hasAdminGrant as string[],
    label: (node.label as LanguageMap | undefined) ?? {},
    note: opt(node, 'note'),
    reciprocalRegistration: opt(node, 'reciprocalRegistration'),
  }
}

export function getAdminGrantIris(data: SocialAgentRegistrationData): string[] {
  return data.hasAdminGrant ?? []
}
