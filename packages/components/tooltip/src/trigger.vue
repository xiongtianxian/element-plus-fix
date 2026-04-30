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
  ref,
  toRef,
  unref,
  onMounted,
  onBeforeUnmount,
} from 'vue'
import { ElPopperTrigger } from '@element-plus/components/popper'
import { focusElement, getEventCode, isArray } from '@element-plus/utils'
import { useNamespace } from '@element-plus/hooks'
import { TOOLTIP_INJECTION_KEY } from './constants'
import { useTooltipTriggerPropsDefaults } from './trigger'

import type { UseTooltipTriggerProps } from './trigger'
import type { OnlyChildExpose } from '@element-plus/components/slot'
import type { TooltipTriggerType } from './trigger'

defineOptions({
  name: 'ElTooltipTrigger',
})

const props = withDefaults(
  defineProps<UseTooltipTriggerProps>(),
  useTooltipTriggerPropsDefaults
)

// 注入
const tooltip = inject(TOOLTIP_INJECTION_KEY)!
const { controlled, id, open, onOpen, onClose, onToggle } = tooltip

const ns = useNamespace('tooltip')
const triggerRef = ref<OnlyChildExpose | null>(null)
let triggerElement: HTMLElement | null = null
const trigger = toRef(props, 'trigger')

// ==============================
// 纯工具函数（顶级、无引用）
// ==============================
function isTriggerType(
  trigger: Arrayable<TooltipTriggerType>,
  type: TooltipTriggerType
) {
  if (isArray(trigger)) {
    return trigger.includes(type)
  }
  return trigger === type
}

// ==============================
// 全部 纯函数！无闭包！可GC！
// ==============================
function handleMouseenter(e: Event) {
  if (unref(controlled) || props.disabled) return
  const triggerVal = unref(trigger)
  if (!isTriggerType(triggerVal, 'hover')) return

  onOpen(e)
  if (props.focusOnTarget && e.target) {
    nextTick(() => {
      focusElement(e.target as HTMLElement, { preventScroll: true })
    })
  }
}

function handleMouseleave(e: Event) {
  if (unref(controlled) || props.disabled) return
  const triggerVal = unref(trigger)
  if (!isTriggerType(triggerVal, 'hover')) return

  onClose()
}

function handleClick(e: Event) {
  if (unref(controlled) || props.disabled) return
  const triggerVal = unref(trigger)
  if (!isTriggerType(triggerVal, 'click')) return
  if ((e as MouseEvent).button === 0) {
    onToggle(e)
  }
}

function handleFocus(e: Event) {
  if (unref(controlled) || props.disabled) return
  const triggerVal = unref(trigger)
  if (!isTriggerType(triggerVal, 'focus')) return

  onOpen(e)
}

function handleBlur(e: Event) {
  if (unref(controlled) || props.disabled) return
  const triggerVal = unref(trigger)
  if (!isTriggerType(triggerVal, 'focus')) return

  onClose()
}

function handleContextMenu(e: Event) {
  if (unref(controlled) || props.disabled) return
  const triggerVal = unref(trigger)
  if (!isTriggerType(triggerVal, 'contextmenu')) return

  e.preventDefault()
  onToggle(e)
}

function handleKeydown(e: Event) {
  if (unref(controlled) || props.disabled) return
  const code = getEventCode(e as KeyboardEvent)
  if (props.triggerKeys.includes(code)) {
    e.preventDefault()
    onToggle(e)
  }
}

// ==============================
// 生命周期：完全对称绑定/解绑
// ==============================
onMounted(() => {
  nextTick(() => {
    const el = triggerRef.value?.$el
    if (!el) return
    triggerElement = el as HTMLElement

    triggerElement.addEventListener('mouseenter', handleMouseenter)
    triggerElement.addEventListener('mouseleave', handleMouseleave)
    triggerElement.addEventListener('click', handleClick)
    triggerElement.addEventListener('focus', handleFocus)
    triggerElement.addEventListener('blur', handleBlur)
    triggerElement.addEventListener('contextmenu', handleContextMenu)
    triggerElement.addEventListener('keydown', handleKeydown)
  })
})

onBeforeUnmount(() => {
  if (!triggerElement) return

  // 完全对称解绑（同一个函数引用）
  triggerElement.removeEventListener('mouseenter', handleMouseenter)
  triggerElement.removeEventListener('mouseleave', handleMouseleave)
  triggerElement.removeEventListener('click', handleClick)
  triggerElement.removeEventListener('focus', handleFocus)
  triggerElement.removeEventListener('blur', handleBlur)
  triggerElement.removeEventListener('contextmenu', handleContextMenu)
  triggerElement.removeEventListener('keydown', handleKeydown)

  triggerElement = null
})

defineExpose({
  triggerRef,
})
</script>
