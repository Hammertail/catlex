<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<template>
  <slot />
</template>

<!-- TransWithAttrs.vue -->

<script setup lang="ts">
import Trans from "./Trans.vue";
</script>

<template>
  <Trans title="Tooltip copy">
    Hello from Trans
  </Trans>
</template>