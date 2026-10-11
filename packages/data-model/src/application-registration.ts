import { frameNode } from '@janeirodigital/interop-utils'

import { dataModelContext } from './context.ts'

export type ApplicationRegistrationId = {
  id: string
  type: string[]
}

export type ApplicationRegistrationData = ApplicationRegistrationId & {
  registeredAgent: string
  hasDataGrant: string[]
  /** Derived: whether the registration has any data grants. */
  granted: boolean
}

export type ApplicationId = {
  id: string
  type: string[]
}

/**
 * Convert a JSON-LD document (fetched as application/ld+json) directly into an
 * ApplicationRegistrationData POJO. The document can be in expanded, compacted,
 * or flattened form. `granted` is derived from the presence of data grants.
 */
export async function fromJsonLd(doc: unknown, id: string): Promise<ApplicationRegistrationData> {
  const node = await frameNode(doc, dataModelContext, id)
  const hasDataGrant = (node.hasDataGrant as string[] | undefined) ?? []
  return {
    id: node.id ?? node['@id'],
    type: node.type ?? [],
    registeredAgent: node.registeredAgent as string,
    hasDataGrant,
    granted: hasDataGrant.length > 0,
  }
}
