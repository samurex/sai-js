/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */

// Types
import type { App } from 'vue';
import * as Sentry from '@sentry/vue';

// Plugins
import { loadFonts } from './webfontloader';
import vuetify from './vuetify';
import { fluent } from './fluent';
import pinia from '../store';
import router from '../router';

function loadSentry(app: App) {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      app,
      dsn: sentryDsn,
      integrations: [Sentry.browserTracingIntegration({ router })]
    });
  }
}

export function registerPlugins(app: App) {
  loadFonts();
  loadSentry(app);
  app.use(vuetify).use(fluent).use(router).use(pinia);
}
