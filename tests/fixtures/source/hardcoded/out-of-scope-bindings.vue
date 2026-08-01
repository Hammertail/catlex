<script setup lang="ts">
defineProps<{
  ready: boolean;
}>();

const label = "Save";
</script>

<template>
  <div>
    <button type="button">
      {{ label }}
    </button>

    <span>
      {{ ready ? "Yes" : "No" }}
    </span>

    <button type="button">
      Save
    </button>
  </div>
</template>
