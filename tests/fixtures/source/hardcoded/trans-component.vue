<script setup lang="ts">
defineProps<{
  children?: unknown;
}>();
</script>

<template>
  <slot />
</template>

<script setup lang="ts">
import Trans from './Trans.vue';
</script>

<template>
  <Trans>Hello</Trans>
</template>