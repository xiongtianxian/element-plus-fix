<template>
  <slot />
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, provide, ref } from 'vue'
import { POPPER_INJECTION_KEY } from './constants'

import type { Instance as PopperInstance } from '@popperjs/core'
import type { ElPopperInjectionContext } from './constants'
import type { PopperProps } from './popper'

defineOptions({
  name: 'ElPopper',
  inheritAttrs: false,
})
const props = withDefaults(defineProps<PopperProps>(), {
  role: 'tooltip',
})

const triggerRef = ref<HTMLElement>()
const popperInstanceRef = ref<PopperInstance>()
const contentRef = ref<HTMLElement>()
const referenceRef = ref<HTMLElement>()
const role = computed(() => props.role)

const popperProvides = {
  /**
   * @description trigger element
   */
  triggerRef,
  /**
   * @description popperjs instance
   */
  popperInstanceRef,
  /**
   * @description popper content element
   */
  contentRef,
  /**
   * @description popper reference element
   */
  referenceRef,
  /**
   * @description role determines how aria attributes are distributed
   */
  role,
} as ElPopperInjectionContext

defineExpose(popperProvides)

provide(POPPER_INJECTION_KEY, popperProvides)

onBeforeUnmount(() => {
  // 1. 销毁 popper 实例
  if (popperInstanceRef.value) {
    popperInstanceRef.value.destroy()
    popperInstanceRef.value = undefined
  }

  // 2. 清空所有 DOM 引用（彻底断链）
  triggerRef.value = undefined
  contentRef.value = undefined
  referenceRef.value = undefined
})
</script>
