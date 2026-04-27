import { watch } from 'vue'
import { isClient, useEventListener } from '@vueuse/core'
import { EVENT_CODE } from '@element-plus/constants'
import { getEventCode } from '@element-plus/utils'

import type { Ref } from 'vue'

type ModalInstance = {
  handleClose: () => void
}

const modalStack: ModalInstance[] = []
let eventListenerAdded = false
let stopEventListener: (() => void) | undefined

const closeModal = (e: KeyboardEvent) => {
  if (modalStack.length === 0) return
  const code = getEventCode(e)
  if (code === EVENT_CODE.esc) {
    e.stopPropagation()
    const topModal = modalStack[modalStack.length - 1]
    topModal.handleClose()
  }
}

const addEventListener = () => {
  if (!eventListenerAdded && isClient) {
    stopEventListener = useEventListener(document, 'keydown', closeModal)
    eventListenerAdded = true
  }
}

const removeEventListener = () => {
  if (eventListenerAdded && modalStack.length === 0) {
    stopEventListener?.()
    eventListenerAdded = false
  }
}

export const useModal = (instance: ModalInstance, visibleRef: Ref<boolean>) => {
  watch(visibleRef, (val) => {
    if (val) {
      modalStack.push(instance)
      addEventListener()
    } else {
      modalStack.splice(modalStack.indexOf(instance), 1)
      removeEventListener()
    }
  })
}
