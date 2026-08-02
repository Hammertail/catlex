<script setup lang="ts">
const t = Object.assign(
  (key: string) => key,
  {
    rich: (key: string) => key,
    markup: (key: string) => key,
  },
);
</script>

<template>
  <div>
    <p>{{ t.rich("welcome") }}</p>

    <p>{{ t.markup("footer") }}</p>
  </div>
</template>
