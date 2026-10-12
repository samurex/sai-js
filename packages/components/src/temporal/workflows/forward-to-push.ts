import { proxyActivities } from '@temporalio/workflow'

import type * as activities from '../activities/forward-to-push.ts'

const { forwardToPush } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
})

export async function sendPushNotifications(subscriptions: any[], payload: any): Promise<void> {
  await Promise.all(subscriptions.map((subscription) => forwardToPush(subscription, payload)))
}
