import type { DatasetCore } from '@rdfjs/types'
import { DataFactory } from 'n3'
import { beforeAll, describe, expect, test } from 'vitest'

import { getAllMatchingQuads, getOneMatchingQuad, toStore } from '../src'

const INTEROP = 'http://www.w3.org/ns/solid/interop#'
const XSD = 'http://www.w3.org/2001/XMLSchema#'

const doc = {
  '@context': {
    id: '@id',
    type: '@type',
    registeredBy: { '@id': `${INTEROP}registeredBy`, '@type': '@id' },
    registeredWith: { '@id': `${INTEROP}registeredWith`, '@type': '@id' },
    registeredAt: { '@id': `${INTEROP}registeredAt`, '@type': `${XSD}dateTime` },
    registeredShapeTree: { '@id': `${INTEROP}registeredShapeTree`, '@type': '@id' },
  },
  id: 'https://acme.example/4d594c61-7cff-484a-a1d2-1f353ee4e1e7',
  type: `${INTEROP}DataRegistration`,
  registeredBy: ['https://garry.example/#id', 'https://jane.example/#id'],
  registeredWith: 'https://solidmin.example/#app',
  registeredAt: '2020-08-23T21:12:27.000Z',
  registeredShapeTree: 'https://solidshapes.example/trees/Project',
}

let dataset: DatasetCore

describe('getOneMatchingQuad', () => {
  beforeAll(async () => {
    dataset = await toStore(doc)
  })

  test('should return quad if matching exists', () => {
    const quadPattern = [null, DataFactory.namedNode(`${INTEROP}registeredAt`)]
    const quad = getOneMatchingQuad(dataset, ...quadPattern)
    expect(quad.object.value).toBe('2020-08-23T21:12:27.000Z')
  })
})

describe('getAllMatchingQuads', () => {
  test('should return array of quads if matches exists', () => {
    const quadPattern = [null, DataFactory.namedNode(`${INTEROP}registeredBy`)]
    const quads = getAllMatchingQuads(dataset, ...quadPattern)
    expect(quads.length).toBe(2)
  })
})
