<script setup>
defineProps({
  label: { type: String, default: 'gube' },
  width: { type: [Number, String], default: 180 },
  showLeftMarker: { type: Boolean, default: true },
})
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 720 329.92"
    class="logo-wordmark"
    role="img"
    :aria-label="`${label} logotipo`"
    :width="width"
  >
    <title>{{ label }}</title>
    <text transform="translate(5.52 250.66)" fill="currentColor">{{ label }}</text>
    <polygon
      v-if="showLeftMarker"
      points="60.34 198.02 84.8 150.91 107.45 198.02 60.34 198.02"
      fill="currentColor"
    />
  </svg>
</template>

<style scoped>
.logo-wordmark {
  display: block;
  width: auto;
  max-width: 100%;
  color: inherit;
}
.logo-wordmark text {
  font-size: 296.85px;
  font-family: 'Didact Gothic', 'Inter', sans-serif;
}
</style>
