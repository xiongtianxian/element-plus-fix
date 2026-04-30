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
import { inject, nextTick, onBeforeUnmount, ref, toRef, unref, onMounted } from 'vue'
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
const { controlled, id, open, onOpen, onClose, onToggle } = inject(
  TOOLTIP_INJECTION_KEY,
  undefined
)!

const triggerRef = ref<OnlyChildExpose | null>(null)
// 保存真实DOM，用于手动绑定事件（解决Vue跨组件闭包泄漏）
let triggerElement: HTMLElement | null = null

const stopWhenControlledOrDisabled = () => {
  if (unref(controlled) || props.disabled) {
    return true
  }
}

const trigger = toRef(props, 'trigger')

// 所有事件逻辑保持不变
const onMouseenter = composeEventHandlers(
  stopWhenControlledOrDisabled,
  whenTrigger(trigger, 'hover', (e) => {
    onOpen(e)

    if (props.focusOnTarget && e.target) {
      nextTick(() => {
        focusElement(e.target as HTMLElement, { preventScroll: true })
      })
    }
  })
)
const onMouseleave = composeEventHandlers(
  stopWhenControlledOrDisabled,
  whenTrigger(trigger, 'hover', onClose)
)
const onClick = composeEventHandlers(
  stopWhenControlledOrDisabled,
  whenTrigger(trigger, 'click', (e) => {
    if ((e as MouseEvent).button === 0) {
      onToggle(e)
    }
  })
)
const onFocus = composeEventHandlers(
  stopWhenControlledOrDisabled,
  whenTrigger(trigger, 'focus', onOpen)
)
const onBlur = composeEventHandlers(
  stopWhenControlledOrDisabled,
  whenTrigger(trigger, 'focus', onClose)
)
const onContextMenu = composeEventHandlers(
  stopWhenControlledOrDisabled,
  whenTrigger(trigger, 'contextmenu', (e: Event) => {
    e.preventDefault()
    onToggle(e)
  })
)
const onKeydown = composeEventHandlers(
  stopWhenControlledOrDisabled,
  (e: Event) => {
    const code = getEventCode(e as KeyboardEvent)
    if (props.triggerKeys.includes(code)) {
      e.preventDefault()
      onToggle(e)
    }
  }
)

// --------------------------
// 核心修复：手动绑定事件
// 解决 Vue 模板事件 + inject 闭包泄漏
// --------------------------
onMounted(() => {
  nextTick(() => {
    const el = triggerRef.value?.$el
    if (!el) return
    triggerElement = el as HTMLElement

    triggerElement.addEventListener('mouseenter', onMouseenter)
    triggerElement.addEventListener('mouseleave', onMouseleave)
    triggerElement.addEventListener('click', onClick)
    triggerElement.addEventListener('focus', onFocus)
    triggerElement.addEventListener('blur', onBlur)
    triggerElement.addEventListener('contextmenu', onContextMenu)
    triggerElement.addEventListener('keydown', onKeydown)
  })
})

// --------------------------
// 核心修复：手动解绑事件
// 这是泄漏彻底消失的关键
// --------------------------
onBeforeUnmount(() => {
  if (unref(open)) onClose()

  if (triggerElement) {
    triggerElement.removeEventListener('mouseenter', onMouseenter)
    triggerElement.removeEventListener('mouseleave', onMouseleave)
    triggerElement.removeEventListener('click', onClick)
    triggerElement.removeEventListener('focus', onFocus)
    triggerElement.removeEventListener('blur', onBlur)
    triggerElement.removeEventListener('contextmenu', onContextMenu)
    triggerElement.removeEventListener('keydown', onKeydown)
    triggerElement = null
  }

  triggerRef.value = null
})

defineExpose({
  triggerRef,
})
</script>
