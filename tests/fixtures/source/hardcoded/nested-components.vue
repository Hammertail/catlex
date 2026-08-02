<script setup lang="ts">
defineProps<{
  children?: unknown;
}>();
</script>

<template>
  <label><slot /></label>
</template>

<script setup lang="ts">
import FormLabel from "./FormLabel.vue";

const count = 3;
</script>

<script setup lang="ts">
import FormLabel from './FormLabel.vue';

const count = 3;
</script>

<template>
  <div>
    <FormLabel>Full name</FormLabel>
    <ul>
      <li>
        <article>
          <h2>Team plan</h2>
          <p>{{ count }} seats remaining</p>
        </article>
      </li>
      <li>
        <article>
          <h2>Starter plan</h2>
          <span>Includes {{ "basic" }} support</span>
        </article>
      </li>
    </ul>
  </div>
</template>
