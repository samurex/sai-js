import { discoverDescriptionResource } from './discovery.ts'
import { toNQuads } from './jsonld.ts'
import type { WhatwgFetch } from './whatwg-fetch.ts'

/**
 * Serialize a JSON-LD document (with embedded context) as a SPARQL
 * `INSERT DATA` block body. Default-graph documents yield N-Triples (valid
 * Turtle); a named-graph document yields N-Quads.
 */
export async function insertPatch(doc: Record<string, unknown>, base?: string): Promise<string> {
  return `INSERT DATA { ${await toNQuads(doc, base)} }`
}

export async function deletePatch(doc: Record<string, unknown>, base?: string): Promise<string> {
  return `DELETE DATA { ${await toNQuads(doc, base)} }`
}

/**
 * PATCH the description resource of a container with a SPARQL update.
 *
 * The description resource is discovered via HEAD + Link header unless
 * `descriptionResourceIri` is provided. Throws if the patch fails, if the
 * discovery HEAD fails, or if no description resource can be discovered.
 */
export async function applyPatch(
  containerIri: string,
  fetch: WhatwgFetch,
  sparqlUpdate: string,
  descriptionResourceIri?: string
): Promise<void> {
  let resourceIri = descriptionResourceIri
  if (!resourceIri) {
    const discovered = await discoverDescriptionResource(containerIri, fetch)
    if (!discovered) {
      throw new Error(`could not discover description resource of ${containerIri}`)
    }
    resourceIri = discovered
  }
  const response = await fetch(resourceIri, {
    method: 'PATCH',
    body: sparqlUpdate,
    headers: { 'Content-Type': 'application/sparql-update' },
  })
  if (!response.ok) {
    const body = response.text ? await response.text().catch(() => '') : ''
    throw new Error(`failed to patch ${resourceIri}: ${response.status} - ${body}`)
  }
}

/** Add a statement (JSON-LD document) to a container via SPARQL patch. */
export async function addStatement(
  containerIri: string,
  fetch: WhatwgFetch,
  doc: Record<string, unknown>
): Promise<void> {
  await applyPatch(containerIri, fetch, await insertPatch(doc))
}

/** Remove a statement (JSON-LD document) from a container via SPARQL patch. */
export async function removeStatement(
  containerIri: string,
  fetch: WhatwgFetch,
  doc: Record<string, unknown>
): Promise<void> {
  await applyPatch(containerIri, fetch, await deletePatch(doc))
}

/** Replace a statement (JSON-LD document) in a container via SPARQL patch. */
export async function replaceStatement(
  containerIri: string,
  fetch: WhatwgFetch,
  whichDoc: Record<string, unknown>,
  withDoc: Record<string, unknown>
): Promise<void> {
  const sparqlUpdate = [await deletePatch(whichDoc), await insertPatch(withDoc)].join(';')
  await applyPatch(containerIri, fetch, sparqlUpdate)
}
