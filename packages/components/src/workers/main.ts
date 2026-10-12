import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { OpenTelemetryPlugin } from '@temporalio/interceptors-opentelemetry-v2'
import { NativeConnection, Worker } from '@temporalio/worker'

import * as accessRequestActivities from '../temporal/activities/access-request.ts'
import * as adminActivities from '../temporal/activities/admin.ts'
import * as forwardActivities from '../temporal/activities/forward-to-push.ts'
import * as grantsActivities from '../temporal/activities/grants.ts'
import * as invitationActivities from '../temporal/activities/invitation.ts'
import * as reciprocalActivities from '../temporal/activities/reciprocal.ts'
import { initNodeTracing } from '../tracing/bootstrap.ts'
import { temporalPluginConfig } from '../tracing/otel-state.ts'

async function connectWithRetry() {
  while (true) {
    try {
      return await NativeConnection.connect({
        address: process.env.TEMPORAL_ADDRESS,
      })
    } catch (err) {
      console.error('Temporal not ready, retrying...', err.message)
      await sleep(500)
    }
  }
}
async function run() {
  const connection = await connectWithRetry()
  // no-op unless an OTLP endpoint is set
  const otelSdk = await initNodeTracing('sai-worker')
  const pluginConfig = temporalPluginConfig()
  const plugins = pluginConfig ? [new OpenTelemetryPlugin(pluginConfig)] : []

  try {
    const forward = await Worker.create({
      connection,
      taskQueue: 'forward-to-push',
      workflowsPath: fileURLToPath(
        new URL('../temporal/workflows/forward-to-push.ts', import.meta.url)
      ),
      activities: forwardActivities,
      plugins,
    })

    const reciprocal = await Worker.create({
      connection,
      taskQueue: 'reciprocal-registration',
      workflowsPath: fileURLToPath(new URL('../temporal/workflows/reciprocal.ts', import.meta.url)),
      // markActivitiesDone (from grants) is called by establishReciprocal — it
      // must be registered on the queue that workflow runs on
      activities: { ...reciprocalActivities, ...grantsActivities },
      plugins,
    })

    const grants = await Worker.create({
      connection,
      taskQueue: 'create-grants',
      workflowsPath: fileURLToPath(
        new URL('../temporal/workflows/create-grants.ts', import.meta.url)
      ),
      // grants + org-admin + activity-first invitation activities — the
      // combined workflow module calls names from all three (the admin
      // workflows also use markActivitiesDone)
      activities: {
        ...grantsActivities,
        ...adminActivities,
        ...invitationActivities,
        ...accessRequestActivities,
      },
      plugins,
    })

    // Run all workers simultaneously
    await Promise.all([forward.run(), reciprocal.run(), grants.run()])
  } finally {
    // flush pending spans before the process exits (dagger kills the service
    // right after the test exec)
    await otelSdk?.shutdown()
    // only close once every worker is done — while a worker still holds the
    // connection close() throws IllegalStateError, which must not mask the
    // actual worker failure below
    try {
      await connection.close()
    } catch (err) {
      console.error('failed to close connection:', err)
    }
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
