import { provide } from 'vue'

import type { InjectionKey, ObjectDirective, Ref } from 'vue'

type ForwardRefSetter = <T>(el: T) => void

export type ForwardRefInjectionContext = {
  setForwardRef: ForwardRefSetter
}

export const FORWARD_REF_INJECTION_KEY: InjectionKey<ForwardRefInjectionContext> =
  Symbol('elForwardRef')

export const useForwardRef = <T>(forwardRef: Ref<T | null>) => {
  const setForwardRef = ((el: T) => {
    forwardRef.value = el
  }) as ForwardRefSetter

  const injection = {
    setForwardRef,
  }

  provide(FORWARD_REF_INJECTION_KEY, injection)

  // 🔥 【修复关键】unmount 时清空 injection 对象
  return () => {
    setForwardRef(null)
    // 切断闭包引用
    injection.setForwardRef = null
  }
}

export const useForwardRefDirective = (
  setForwardRef: ForwardRefSetter
): ObjectDirective => {
  return {
    mounted(el) {
      setForwardRef(el)
    },
    updated(el) {
      setForwardRef(el)
    },
    unmounted() {
      setForwardRef(null)
    },
  }
}
