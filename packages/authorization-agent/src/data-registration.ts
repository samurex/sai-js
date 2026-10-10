import { type DataRegistrationData, dataModelContext } from '@janeirodigital/interop-data-model'
import { type WhatwgFetch, createContainer, withContext } from '@janeirodigital/interop-utils'

// ──────────────────────────
// Write path: DataRegistrationData → container (container.create)
// ──────────────────────────

export async function createDataRegistration(
  data: DataRegistrationData,
  fetch: WhatwgFetch
): Promise<void> {
  // the document is the POJO with the shared context — the rdf:type quads come
  // from data.type; createContainer PUTs the container and patches its
  // description resource with `INSERT DATA`
  await createContainer(data.id, fetch, withContext(dataModelContext, data))
}
