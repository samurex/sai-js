<style>
.slide-enter-active,
.slide-leave-active {
  position: absolute;
  transition: left 1s ease;
  width: 100vw;
}

.slide-enter-from {
  left: 100vw;
}

.slide-enter-to {
  left: 0;
}

.slide-leave-from {
  left: 0;
}

.slide-leave-to {
  left: -100vw;
}
</style>
<template>
  <v-app-bar color="primary">
    <v-app-bar-title>
      {{ title }}
    </v-app-bar-title>
    <template v-slot:prepend v-if="icon">
      <v-btn :icon="icon" @click="navigateUp"> </v-btn>
    </template>
  </v-app-bar>

  <v-container>
    <router-view v-slot="{ Component }">
      <transition name="slide">
        <component :is="Component" />
      </transition>
    </router-view>
  </v-container>
  <v-snackbar v-model="showSnackbar" color="info">
    <v-icon icon="mdi-share-variant"></v-icon>
    Data from new peer - <strong>{{ newAgent?.label }}</strong>
    <template v-slot:actions>
      <v-btn color="white" variant="outlined" @click="showAgent()"> Show </v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts" setup>
import { Agent } from '@/models';
import { useAppStore } from '@/store/app';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
const router = useRouter();
const route = useRoute();

const title = computed(
  () => (route.query.project ? appStore.currentProject?.label : appStore.currentAgent?.label) || ''
);
const icon = computed(() => (route.query.project ? 'mdi-account-details' : 'mdi-account-convert'));

const appStore = useAppStore();
appStore.watchSai();
await appStore.loadAgents();

const showSnackbar = ref(false);
const newAgent = ref<Agent>();
const currentAgent = ref(appStore.agents.find((a) => a.id === route.query.agent)!);

function showAgent() {
  showSnackbar.value = false;
  if (newAgent.value) {
    router.push({ name: 'dashboard', query: { agent: newAgent.value.id } });
  }
}

function navigateUp() {
  if (route.query.project) {
    router.push({ name: 'agent' });
  } else {
    router.push({ name: 'dashboard' });
  }
}

watch(
  () => appStore.agents,
  (latestAgents, previousAgents) => {
    newAgent.value = latestAgents.find((agent) => !previousAgents.some((a) => a.id === agent.id));
  }
);

watch(newAgent, (agent) => {
  if (agent) {
    showSnackbar.value = true;
  }
});
</script>
