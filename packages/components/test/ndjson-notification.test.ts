import { readableToString } from '@solid/community-server'
import { describe, expect, test } from 'vitest'
import { NdjsonNotificationSerializer, expandNotification } from '../src'

const AS = 'https://www.w3.org/ns/activitystreams#'
const NOTIFY = 'http://www.w3.org/ns/solid/notifications#'
const XSD_DATETIME = 'http://www.w3.org/2001/XMLSchema#dateTime'

const notification = {
  id: 'urn:1700000000000:https://storage.example/resource',
  type: 'Update',
  object: 'https://storage.example/resource',
  state: 'abc123',
  published: '2024-01-01T00:00:00.000Z',
}

describe('expandNotification', () => {
  test('expands to pinned JSON-LD IRIs (activitystreams + notifications)', () => {
    expect(expandNotification(notification)).toEqual([
      {
        '@id': notification.id,
        '@type': [`${AS}Update`],
        [`${AS}object`]: [{ '@id': notification.object }],
        [`${AS}published`]: [{ '@type': XSD_DATETIME, '@value': notification.published }],
        [`${NOTIFY}state`]: [{ '@value': 'abc123' }],
      },
    ])
  })

  test('renders target as node references and omits absent state', () => {
    const [expanded] = expandNotification({
      id: 'urn:1:x',
      type: 'Add',
      object: 'https://storage.example/resource',
      target: 'https://storage.example/container/',
      published: '2024-01-01T00:00:00.000Z',
    })

    expect(expanded[`${AS}target`]).toEqual([{ '@id': 'https://storage.example/container/' }])
    expect(expanded[`${NOTIFY}state`]).toBeUndefined()
  })
})

describe('NdjsonNotificationSerializer', () => {
  test('emits exactly one NDJSON line of expanded JSON-LD', async () => {
    const serializer = new NdjsonNotificationSerializer()

    const representation = await serializer.handle({ notification })
    const body = await readableToString(representation.data)

    expect(body.endsWith('\n')).toBe(true)
    expect(body.trimEnd().split('\n')).toHaveLength(1)
    expect(JSON.parse(body.trim())).toEqual(expandNotification(notification))
  })
})
