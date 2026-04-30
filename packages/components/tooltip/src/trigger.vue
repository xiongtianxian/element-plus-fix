<template>
  <el-popper-trigger
    :id="id"
    :virtual-ref="virtualRef"
    :open="open"
    :virtual-triggering="virtualTriggering"
    :class="ns.e('trigger')"
  >
    <slot />
  </el-popper-trigger>
</template>

<script lang="ts" setup>
import {
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  toRef,
  unref,
  onMounted,
} from 'vue'
import { ElPopperTrigger } from '@element-plus/components/popper'
import {
  composeEventHandlers,
  focusElement,
  getEventCode,
} from '@element-plus/utils'
import { useNamespace } from '@element-plus/hooks'
import { TOOLTIP_INJECTION_KEY } from './constants'
import { whenTrigger } from './utils'
import { useTooltipTriggerPropsDefaults } from './trigger'

import type { UseTooltipTriggerProps } from './trigger'
import type { OnlyChildExpose } from '@element-plus/components/slot'

defineOptions({
  name: 'ElTooltipTrigger',
})

const props = withDefaults(
  defineProps<UseTooltipTriggerProps>(),
  useTooltipTriggerPropsDefaults
)

const ns = useNamespace('tooltip')
const tooltip = inject(TOOLTIP_INJECTION_KEY, undefined)!

const { controlled, id, open, onOpen, onClose, onToggle } = tooltip

const triggerRef = ref<OnlyChildExpose | null>(null)
let triggerElement: HTMLElement | null = null

// --------------------------
// 关键：不闭包！不捕获！
// 所有回调变成 PURE FUNCTION
// --------------------------
const handlers = {
  mouseenter(e: Event) {
    if (unref(controlled) || props.disabled) return
    if (!whenTrigger(toRef(props, 'trigger'), 'hover')) return
    onOpen(e)
    if (props.focusOnTarget && e.target) {
      nextTick(() => {
        focusElement(e.target as HTMLElement, { preventScroll: true })
      })
    }
  },
  mouseleave(e: Event) {
    if (unref(controlled) || props.disabled) return
    if (!whenTrigger(toRef(props, 'trigger'), 'hover')) return
    onClose()
  },
  click(e: Event) {
    if (unref(controlled) || props.disabled) return
    if (!whenTrigger(toRef(props, 'trigger'), 'click')) return
    if ((e as MouseEvent).button === 0) {
      onToggle(e)
    }
  },
  focus(e: Event) {
    if (unref(controlled) || props.disabled) return
    if (!whenTrigger(toRef(props, 'trigger'), 'focus')) return
    onOpen(e)
  },
  blur(e: Event) {
    if (unref(controlled) || props.disabled) return
    if (!whenTrigger(toRef(props, 'trigger'), 'focus')) return
    onClose()
  },
  contextmenu(e: Event) {
    if (unref(controlled) || props.disabled) return
    if (!whenTrigger(toRef(props, 'trigger'), 'contextmenu')) return
    e.preventDefault()
    onToggle(e)
  },
  keydown(e: Event) {
    if (unref(controlled) || props.disabled) return
    const code = getEventCode(e as KeyboardEvent)
    if (props.triggerKeys.includes(code)) {
      e.preventDefault()
      onToggle(e)
    }
  },
}

onMounted(() => {
  nextTick(() => {
    const el = triggerRef.value?.$el
    if (!el) return
    triggerElement = el as HTMLElement

    triggerElement.addEventListener('mouseenter', handlers.mouseenter)
    triggerElement.addEventListener('mouseleave', handlers.mouseleave)
    triggerElement.addEventListener('click', handlers.click)
    triggerElement.addEventListener('focus', handlers.focus)
    triggerElement.addEventListener('blur', handlers.blur)
    triggerElement.addEventListener('contextmenu', handlers.contextmenu)
    triggerElement.addEventListener('keydown', handlers.keydown)
  })
})

onBeforeUnmount(() => {
  // 1. 关闭 tooltip
  if (unref(open)) onClose()

  // 2. 安全解绑事件
  if (triggerElement) {
    triggerElement.removeEventListener('mouseenter', handlers.mouseenter)
    triggerElement.removeEventListener('mouseleave', handlers.mouseleave)
    triggerElement.removeEventListener('click', handlers.click)
    triggerElement.removeEventListener('focus', handlers.focus)
    triggerElement.removeEventListener('blur', handlers.blur)
    triggerElement.removeEventListener('contextmenu', handlers.contextmenu)
    triggerElement.removeEventListener('keydown', handlers.keydown)
    triggerElement = null
  }

  // 3. 清空引用
  triggerRef.value = null
})

defineExpose({
  triggerRef,
})
</script>
