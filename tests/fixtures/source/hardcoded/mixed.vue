<script setup lang="ts">
const t = (key: string) => key;
</script>

<template>
  <div>
    <h1>Welcome</h1>

    <button>
      {{ t("submit") }}
    </button>

    <input
      placeholder="Your name"
      aria-label="Name field"
    />

    <img
      alt="Logo"
      src="/logo.png"
      class="logo"
    />

    <span>{{ " " }}</span>
  </div>
</template>
