<script setup lang="ts">
const t = (key: string) => key;
</script>

<template>
  <section>
    <h1>Account settings</h1>

    <label>
      Display name
      <input
        placeholder="Jane Doe"
        aria-label="Display name"
      />
    </label>

    <label>
      {{ t("email") }}
      <input :placeholder="t('emailPlaceholder')" />
    </label>

    <img
      alt="Profile photo"
      src="/avatar.png"
      class="avatar"
    />

    <button type="button">
      <span aria-hidden="true">⚙️</span>
      Save preferences
    </button>

    <button type="button">
      {{ t("cancel") }}
    </button>
  </section>
</template>
