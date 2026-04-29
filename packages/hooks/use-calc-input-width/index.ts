import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import { MINIMUM_INPUT_WIDTH } from '@element-plus/constants'

export function useCalcInputWidth() {
  const calculatorRef = shallowRef<HTMLElement>()
  const calculatorWidth = ref(0)

  const inputStyle = computed(() => ({
    minWidth: `${Math.max(calculatorWidth.value, MINIMUM_INPUT_WIDTH)}px`,
  }))

  const resetCalculatorWidth = () => {
    calculatorWidth.value =
      calculatorRef.value?.getBoundingClientRect().width ?? 0
  }

  let stopper: ReturnType<typeof useResizeObserver>['stop']
  stopper = useResizeObserver(calculatorRef, resetCalculatorWidth).stop

  onBeforeUnmount(() => {
    stopper?.()
  })

  return {
    calculatorRef,
    calculatorWidth,
    inputStyle,
  }
}
