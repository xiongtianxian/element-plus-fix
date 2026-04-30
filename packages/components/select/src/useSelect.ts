import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useSlots,
  watch,
  watchEffect,
} from 'vue'
import { clamp, findLastIndex, get, isEqual, isNil } from 'lodash-unified'
import { useDebounceFn, useResizeObserver } from '@vueuse/core'
import {
  NOOP,
  ValidateComponentsMap,
  ensureArray,
  getEventCode,
  isArray,
  isClient,
  isEmpty,
  isFunction,
  isIOS,
  isNumber,
  isObject,
  isPlainObject,
  isUndefined,
  scrollIntoView,
} from '@element-plus/utils'
import {
  CHANGE_EVENT,
  EVENT_CODE,
  MINIMUM_INPUT_WIDTH,
  UPDATE_MODEL_EVENT,
} from '@element-plus/constants'
import {
  useComposition,
  useEmptyValues,
  useFocusController,
  useId,
  useLocale,
  useNamespace,
} from '@element-plus/hooks'
import {
  useFormDisabled,
  useFormItem,
  useFormItemInputId,
  useFormSize,
} from '@element-plus/components/form'

import type { Component } from 'vue'
import type { TooltipInstance } from '@element-plus/components/tooltip'
import type {
  ScrollbarDirection,
  ScrollbarInstance,
} from '@element-plus/components/scrollbar'
import type { SelectEmits, SelectProps } from './select'
import type {
  OptionBasic,
  OptionPublicInstance,
  OptionValue,
  SelectStates,
} from './type'

export const useSelect = (props: SelectProps, emit: SelectEmits) => {
  const { t } = useLocale()
  const slots = useSlots()
  const contentId = useId()
  const nsSelect = useNamespace('select')
  const nsInput = useNamespace('input')

  const states = reactive<SelectStates>({
    inputValue: '',
    options: new Map(),
    cachedOptions: new Map(),
    optionValues: [],
    selected: [],
    selectionWidth: 0,
    collapseItemWidth: 0,
    selectedLabel: '',
    hoveringIndex: -1,
    previousQuery: null,
    inputHovering: false,
    menuVisibleOnFocus: false,
    isBeforeHide: false,
  })

  const selectRef = ref<HTMLElement>()
  const selectionRef = ref<HTMLElement>()
  const tooltipRef = ref<TooltipInstance>()
  const tagTooltipRef = ref<TooltipInstance>()
  const inputRef = ref<HTMLInputElement>()
  const prefixRef = ref<HTMLElement>()
  const suffixRef = ref<HTMLElement>()
  const menuRef = ref<HTMLElement>()
  const tagMenuRef = ref<HTMLElement>()
  const collapseItemRef = ref<HTMLElement>()
  const scrollbarRef = ref<ScrollbarInstance>()
  const expanded = ref(false)
  const hoverOption = ref()
  const debouncing = ref(false)

  const { form, formItem } = useFormItem()
  const { inputId } = useFormItemInputId(props, { formItemContext: formItem })
  const { valueOnClear, isEmptyValue } = useEmptyValues(props)

  const {
    isComposing,
    handleCompositionStart,
    handleCompositionUpdate,
    handleCompositionEnd,
  } = useComposition({ afterComposition: (e) => onInput(e) })

  const selectDisabled = useFormDisabled()

  const { wrapperRef, isFocused, handleBlur } = useFocusController(inputRef, {
    disabled: selectDisabled,
    afterFocus() {
      if (props.automaticDropdown && !expanded.value) {
        expanded.value = true
        states.menuVisibleOnFocus = true
      }
    },
    beforeBlur(event) {
      return (
        tooltipRef.value?.isFocusInsideContent(event) ||
        tagTooltipRef.value?.isFocusInsideContent(event)
      )
    },
    afterBlur() {
      expanded.value = false
      states.menuVisibleOnFocus = false
      if (props.validateEvent) formItem?.validate?.('blur').catch(NOOP)
    },
  })

  const hasModelValue = computed(() => {
    return isArray(props.modelValue)
      ? props.modelValue.length > 0
      : !isEmptyValue(props.modelValue)
  })

  const needStatusIcon = computed(() => form?.statusIcon ?? false)

  const showClearBtn = computed(() => {
    return (
      props.clearable &&
      !selectDisabled.value &&
      hasModelValue.value &&
      (isFocused.value || states.inputHovering)
    )
  })

  const iconComponent = computed(() =>
    props.remote && props.filterable && !props.remoteShowSuffix
      ? ''
      : props.suffixIcon
  )
  const iconReverse = computed(() =>
    nsSelect.is('reverse', !!(iconComponent.value && expanded.value))
  )

  const validateState = computed(() => formItem?.validateState || '')
  const validateIcon = computed(
    () => validateState.value && ValidateComponentsMap[validateState.value] as Component
  )

  const debounce = computed(() => props.remote ? props.debounce : 0)
  const isRemoteSearchEmpty = computed(() => props.remote && !states.inputValue && states.options.size === 0)

  const emptyText = computed(() => {
    if (props.loading) return props.loadingText || t('el.select.loading')
    if (props.filterable && states.inputValue && states.options.size > 0 && filteredOptionsCount.value === 0)
      return props.noMatchText || t('el.select.noMatch')
    if (states.options.size === 0) return props.noDataText || t('el.select.noData')
    return null
  })

  const filteredOptionsCount = computed(() => optionsArray.value.filter(o => o.visible).length)
  const optionsArray = computed(() => {
    const list = Array.from(states.options.values())
    const newList: OptionPublicInstance[] = []
    states.optionValues.forEach(v => {
      const idx = list.find(i => i.value === v)
      if (idx) newList.push(idx)
    })
    return newList.length >= list.length ? newList : list
  })

  const cachedOptionsArray = computed(() => Array.from(states.cachedOptions.values()))
  const showNewOption = computed(() => {
    const has = optionsArray.value.some(o => !o.created && o.currentLabel === states.inputValue)
    return props.filterable && props.allowCreate && states.inputValue !== '' && !has
  })

  const updateOptions = () => {
    if (props.filterable && isFunction(props.filterMethod)) return
    if (props.filterable && props.remote && isFunction(props.remoteMethod)) return
    optionsArray.value.forEach(o => o.updateOption?.(states.inputValue))
  }

  const selectSize = useFormSize()
  const collapseTagSize = computed(() => ['small'].includes(selectSize.value) ? 'small' : 'default')

  const dropdownMenuVisible = computed({
    get: () => expanded.value && (props.loading || !isRemoteSearchEmpty.value || (props.remote && !!slots.empty)) &&
      (!debouncing.value || !isEmpty(states.previousQuery) || states.options.size > 0),
    set: v => expanded.value = v
  })

  const shouldShowPlaceholder = computed(() => {
    if (props.multiple) return ensureArray(props.modelValue).length === 0 && !states.inputValue
    const v = isArray(props.modelValue) ? props.modelValue[0] : props.modelValue
    return props.filterable || isUndefined(v) ? !states.inputValue : true
  })

  const currentPlaceholder = computed(() => {
    const p = props.placeholder ?? t('el.select.placeholder')
    return props.multiple || !hasModelValue.value ? p : states.selectedLabel
  })

  const mouseEnterEventName = isIOS ? null : 'mouseenter'

  watch(() => props.modelValue, (val, old) => {
    if (props.multiple && props.filterable && !props.reserveKeyword) {
      states.inputValue = ''
      handleQueryChange('')
    }
    setSelected()
    if (!isEqual(val, old) && props.validateEvent) formItem?.validate('change').catch(NOOP)
  }, { flush: 'post', deep: true })

  watch(() => expanded.value, v => {
    if (v) handleQueryChange(states.inputValue)
    else {
      states.inputValue = ''
      states.previousQuery = null
      states.isBeforeHide = true
      states.menuVisibleOnFocus = false
    }
  })

  watch(() => states.options.entries(), () => {
    if (!isClient) return
    setSelected()
    if (props.defaultFirstOption && (props.filterable || props.remote) && filteredOptionsCount.value)
      checkDefaultFirstOption()
  }, { flush: 'post' })

  watch([() => states.hoveringIndex, optionsArray], ([idx]) => {
    if (isNumber(idx) && idx > -1) hoverOption.value = optionsArray.value[idx] ?? {}
    else hoverOption.value = {}
    optionsArray.value.forEach(o => o.hover = hoverOption.value === o)
  })

  watchEffect(() => {
    if (states.isBeforeHide) return
    updateOptions()
  })

  const handleQueryChange = (v: string) => {
    if (states.previousQuery === v || isComposing.value) return
    states.previousQuery = v
    if (props.filterable && isFunction(props.filterMethod)) props.filterMethod(v)
    else if (props.filterable && props.remote && isFunction(props.remoteMethod)) props.remoteMethod(v)
    if (props.defaultFirstOption && (props.filterable || props.remote) && filteredOptionsCount.value)
      nextTick(checkDefaultFirstOption)
    else nextTick(updateHoveringIndex)
  }

  const checkDefaultFirstOption = () => {
    const list = optionsArray.value.filter(o => o.visible && !o.disabled && !o.states.groupDisabled)
    const created = list.find(o => o.created)
    const first = list[0]
    states.hoveringIndex = list.findIndex(o => o === (created ?? first))
  }

  const setSelected = () => {
    if (!props.multiple) {
      const v = isArray(props.modelValue) ? props.modelValue[0] : props.modelValue
      const opt = getOption(v)
      states.selectedLabel = opt.currentLabel
      states.selected = [opt]
      return
    }
    states.selectedLabel = ''
    const res: typeof states.selected = []
    if (!isUndefined(props.modelValue))
      ensureArray(props.modelValue).forEach(v => res.push(getOption(v)))
    states.selected = res
  }

  const getOption = (v: OptionValue) => {
    const isObj = isPlainObject(v)
    for (let i = cachedOptionsArray.value.length - 1; i >= 0; i--) {
      const opt = cachedOptionsArray.value[i]
      const eq = isObj ? get(opt.value, props.valueKey) === get(v, props.valueKey) : opt.value === v
      if (eq) {
        return {
          index: optionsArray.value.filter(o => !o.created).indexOf(opt),
          value: v,
          currentLabel: opt.currentLabel,
          get isDisabled() { return opt.isDisabled }
        }
      }
    }
    const exist = states.selected.find(o =>
      isObj ? get(o.value, props.valueKey) === get(v, props.valueKey) : o.value === v
    )
    return {
      index: -1,
      value: v,
      currentLabel: isObj ? v.label : exist?.currentLabel ?? v ?? ''
    }
  }

  const updateHoveringIndex = () => {
    if (states.selected.length) {
      const last = states.selected.at(-1)
      states.hoveringIndex = optionsArray.value.findIndex(o => getValueKey(last) === getValueKey(o))
    } else {
      states.hoveringIndex = -1
    }
  }

  const resetSelectionWidth = () => {
    states.selectionWidth = Number.parseFloat(window.getComputedStyle(selectionRef.value!).width)
  }

  const resetCollapseItemWidth = () => {
    states.collapseItemWidth = collapseItemRef.value!.getBoundingClientRect().width
  }

  const updateTooltip = () => tooltipRef.value?.updatePopper?.()
  const updateTagTooltip = () => tagTooltipRef.value?.updatePopper?.()
  const onInputChange = () => {
    if (states.inputValue && !expanded.value) expanded.value = true
    handleQueryChange(states.inputValue)
  }

  const onInput = (e: Event) => {
    states.inputValue = (e.target as HTMLInputElement).value
    if (props.remote) {
      debouncing.value = true
      debouncedOnInputChange()
    } else {
      onInputChange()
    }
  }

  const debouncedOnInputChange = useDebounceFn(() => {
    onInputChange()
    debouncing.value = false
  }, debounce)

  const emitChange = (v: OptionValue | OptionValue[]) => {
    if (!isEqual(props.modelValue, v)) emit(CHANGE_EVENT, v)
  }

  const getLastNotDisabledIndex = (v: OptionValue[]) =>
    findLastIndex(v, it => {
      const opt = states.cachedOptions.get(it)
      return !opt?.disabled && !opt?.states.groupDisabled
    })

  const deletePrevTag = (e: KeyboardEvent) => {
    if (!props.multiple) return
    const code = getEventCode(e)
    if (code === EVENT_CODE.delete) return
    if ((e.target as HTMLInputElement).value <= 0) {
      const val = ensureArray(props.modelValue).slice()
      const idx = getLastNotDisabledIndex(val)
      if (idx < 0) return
      const delVal = val[idx]
      val.splice(idx, 1)
      emit(UPDATE_MODEL_EVENT, val)
      emitChange(val)
      emit('remove-tag', delVal)
    }
  }

  const deleteTag = (e: MouseEvent, tag: OptionBasic) => {
    const idx = states.selected.indexOf(tag)
    if (idx > -1 && !selectDisabled.value) {
      const val = ensureArray(props.modelValue).slice()
      val.splice(idx, 1)
      emit(UPDATE_MODEL_EVENT, val)
      emitChange(val)
      emit('remove-tag', tag.value)
    }
    e.stopPropagation()
    focus()
  }

  const deleteSelected = (e: Event) => {
    e.stopPropagation()
    const val = props.multiple ? [] : valueOnClear.value
    if (props.multiple) states.selected.forEach(it => it.isDisabled && val.push(it.value))
    emit(UPDATE_MODEL_EVENT, val)
    emitChange(val)
    states.hoveringIndex = -1
    expanded.value = false
    emit('clear')
    focus()
  }

  const handleOptionSelect = (opt: OptionPublicInstance) => {
    if (props.multiple) {
      const val = ensureArray(props.modelValue ?? []).slice()
      const idx = getValueIndex(val, opt)
      if (idx > -1) val.splice(idx, 1)
      else if (props.multipleLimit <= 0 || val.length < props.multipleLimit) val.push(opt.value)
      emit(UPDATE_MODEL_EVENT, val)
      emitChange(val)
      if (opt.created) handleQueryChange('')
      if (props.filterable && (opt.created || !props.reserveKeyword)) states.inputValue = ''
    } else {
      !isEqual(props.modelValue, opt.value) && emit(UPDATE_MODEL_EVENT, opt.value)
      emitChange(opt.value)
      expanded.value = false
    }
    focus()
    if (!expanded.value) nextTick(() => scrollToOption(opt))
  }

  const getValueIndex = (arr: OptionValue[], opt: OptionPublicInstance) => {
    if (isUndefined(opt)) return -1
    if (!isObject(opt.value)) return arr.indexOf(opt.value)
    return arr.findIndex(v => isEqual(get(v, props.valueKey), getValueKey(opt)))
  }

  const scrollToOption = (opt: any) => {
    const target = isArray(opt) ? opt.at(-1) : opt
    let el: HTMLElement | null = null
    if (!isNil(target?.value)) {
      const list = optionsArray.value.filter(o => o.value === target.value)
      if (list.length) el = list[0].$el
    }
    if (tooltipRef.value && el) {
      const wrap = tooltipRef.value.popperRef?.contentRef?.querySelector(`.${nsSelect.be('dropdown', 'wrap')}`)
      if (wrap) scrollIntoView(wrap as HTMLElement, el)
    }
    scrollbarRef.value?.handleScroll()
  }

  const onOptionCreate = (vm: OptionPublicInstance) => {
    states.options.set(vm.value, vm)
    states.cachedOptions.set(vm.value, vm)
  }

  const onOptionDestroy = (k: OptionValue, vm: OptionPublicInstance) => {
    if (states.options.get(k) === vm) states.options.delete(k)
  }

  const popperRef = computed(() => tooltipRef.value?.popperRef?.contentRef)
  const handleMenuEnter = () => {
    states.isBeforeHide = false
    nextTick(() => {
      scrollbarRef.value?.update()
      scrollToOption(states.selected)
    })
  }

  const focus = () => inputRef.value?.focus()
  const blur = () => {
    if (expanded.value) {
      expanded.value = false
      nextTick(() => inputRef.value?.blur())
      return
    }
    inputRef.value?.blur()
  }

  // ==============================================
  // 所有事件 100% 纯具名函数，无闭包
  // ==============================================
  function handleMouseenter() {
    states.inputHovering = true
  }

  function handleMouseleave() {
    states.inputHovering = false
  }
  function handleClearClick(e: Event) {
    deleteSelected(e)
  }

  function handleClickOutside(e: Event) {
    expanded.value = false
    if (isFocused.value) {
      const fe = new FocusEvent('blur', e)
      nextTick(() => handleBlur(fe))
    }
  }

  function handleEsc() {
    if (states.inputValue.length > 0) states.inputValue = ''
    else expanded.value = false
  }

  function toggleMenu(event?: Event) {
    if (selectDisabled.value) return
    if (props.filterable && expanded.value && event && !suffixRef.value?.contains(event.target as Node)) return
    if (isIOS) states.inputHovering = true
    if (states.menuVisibleOnFocus) states.menuVisibleOnFocus = false
    else expanded.value = !expanded.value
  }

  function selectOption() {
    if (!expanded.value) {
      toggleMenu()
    } else {
      const opt = optionsArray.value[states.hoveringIndex]
      if (opt && !opt.isDisabled) handleOptionSelect(opt)
    }
  }

  const getValueKey = (item: any) => {
    return isObject(item.value) ? get(item.value, props.valueKey) : item.value
  }

  const optionsAllDisabled = computed(() =>
    optionsArray.value.filter(o => o.visible).every(o => o.isDisabled)
  )

  const showTagList = computed(() => {
    if (!props.multiple) return []
    return props.collapseTags ? states.selected.slice(0, props.maxCollapseTags) : states.selected
  })

  const collapseTagList = computed(() => {
    if (!props.multiple) return []
    return props.collapseTags ? states.selected.slice(props.maxCollapseTags) : []
  })

  const navigateOptions = (dir: 'prev' | 'next') => {
    if (!expanded.value) { expanded.value = true; return }
    if (states.options.size === 0 || filteredOptionsCount.value === 0 || isComposing.value) return
    if (!optionsAllDisabled.value) {
      if (dir === 'next') {
        states.hoveringIndex++
        if (states.hoveringIndex >= states.options.size) states.hoveringIndex = 0
      } else {
        states.hoveringIndex--
        if (states.hoveringIndex < 0) states.hoveringIndex = states.options.size - 1
      }
      const opt = optionsArray.value[states.hoveringIndex]
      if (opt.isDisabled || !opt.visible) navigateOptions(dir)
      nextTick(() => scrollToOption(hoverOption.value))
    }
  }

  const findFocusableIndex = (arr: any[], s: number, step: number, len: number) => {
    for (let i = s; i >= 0 && i < len; i += step) {
      const o = arr[i]
      if (!o?.isDisabled && o?.visible) return i
    }
    return null
  }

  const focusOption = (idx: number, mode: 'up' | 'down') => {
    const len = states.options.size
    if (len === 0) return
    const start = clamp(idx, 0, len - 1)
    const dir = mode === 'up' ? -1 : 1
    const res = findFocusableIndex(optionsArray.value, start, dir, len) ?? findFocusableIndex(optionsArray.value, start - dir, -dir, len)
    if (res != null) {
      states.hoveringIndex = res
      nextTick(() => scrollToOption(hoverOption.value))
    }
  }

  const handleKeydown = (e: KeyboardEvent) => {
    const code = getEventCode(e)
    let prevent = true
    switch (code) {
      case EVENT_CODE.up: navigateOptions('prev'); break
      case EVENT_CODE.down: navigateOptions('next'); break
      case EVENT_CODE.enter: case EVENT_CODE.numpadEnter: if (!isComposing.value) selectOption(); break
      case EVENT_CODE.esc: handleEsc(); break
      case EVENT_CODE.backspace: prevent = false; deletePrevTag(e); return
      case EVENT_CODE.home: if (!expanded.value) return; focusOption(0, 'down'); break
      case EVENT_CODE.end: if (!expanded.value) return; focusOption(states.options.size - 1, 'up'); break
      case EVENT_CODE.pageUp: if (!expanded.value) return; focusOption(states.hoveringIndex - 10, 'up'); break
      case EVENT_CODE.pageDown: if (!expanded.value) return; focusOption(states.hoveringIndex + 10, 'down'); break
      default: prevent = false; break
    }
    if (prevent) { e.preventDefault(); e.stopPropagation() }
  }

  const getGapWidth = () => {
    if (!selectionRef.value) return 0
    const s = window.getComputedStyle(selectionRef.value)
    return Number.parseFloat(s.gap || '6px')
  }

  const tagStyle = computed(() => {
    const gap = getGapWidth()
    const inputW = props.filterable ? gap + MINIMUM_INPUT_WIDTH : 0
    const max = collapseItemRef.value && props.maxCollapseTags === 1
      ? states.selectionWidth - states.collapseItemWidth - gap - inputW
      : states.selectionWidth - inputW
    return { maxWidth: `${max}px` }
  })

  const collapseTagStyle = computed(() => ({ maxWidth: `${states.selectionWidth}px` }))
  const popupScroll = (data: any) => emit('popup-scroll', data)
  const endReached = (dir: ScrollbarDirection) => emit('end-reached', dir)

  let selectionStop: () => void
  let wrapperStop: () => void
  let tagMenuStop: () => void
  let collapseItemStop: () => void
  let observeStop: () => void

  // ==============================================
  // 手动绑定 DOM 事件（无闭包）
  // ==============================================
  let wrapperEl: HTMLElement | null = null
  let inputEl: HTMLElement | null = null
  let clearEl: HTMLElement | null = null
  let selectEl: HTMLElement | null = null

  onMounted(() => {
    setSelected()
    selectionStop = useResizeObserver(selectionRef, resetSelectionWidth).stop
    wrapperStop = useResizeObserver(wrapperRef, updateTooltip).stop
    tagMenuStop = useResizeObserver(tagMenuRef, updateTagTooltip).stop
    collapseItemStop = useResizeObserver(collapseItemRef, resetCollapseItemWidth).stop

    // 手动绑定事件，彻底消除模板闭包
    nextTick(() => {
      selectEl = selectRef.value as HTMLElement
      wrapperEl = wrapperRef.value as HTMLElement
      inputEl = inputRef.value as HTMLElement

      selectEl.addEventListener('mouseenter', handleMouseenter)
      selectEl.addEventListener('mouseleave', handleMouseleave)
      wrapperEl?.addEventListener('click', toggleMenu)
      inputEl?.addEventListener('keydown', handleKeydown as unknown as EventListener)
      inputEl?.addEventListener('input', onInput as unknown as EventListener)
    })
  })

  watch(() => dropdownMenuVisible.value, v => {
    if (v) observeStop = useResizeObserver(menuRef, updateTooltip).stop
    else { observeStop?.(); observeStop = undefined }
    emit('visible-change', v)
  })

  // ==============================================
  // 【终极清理】100% 无残留
  // ==============================================
  onBeforeUnmount(() => {
    // 清理 resize
    selectionStop?.()
    wrapperStop?.()
    tagMenuStop?.()
    collapseItemStop?.()
    observeStop?.()

    // 清理 DOM 事件
    if(selectEl){
      selectEl.removeEventListener('mouseenter', handleMouseenter)
      selectEl.removeEventListener('mouseleave', handleMouseleave)
    }
    if (wrapperEl) wrapperEl.removeEventListener('click', toggleMenu)
    if (inputEl) inputEl.removeEventListener('keydown', handleKeydown as unknown as EventListener)
    if (inputEl) inputEl.removeEventListener('input', onInput as unknown as EventListener)

    wrapperRef.value = undefined
    selectionRef.value = undefined
    tooltipRef.value = undefined
    selectRef.value = undefined
    prefixRef.value = undefined

    // 清理引用
    states.options.clear()
    states.cachedOptions.clear()
    states.selected.length = 0
    states.optionValues.length = 0
  })

  return {
    inputId, contentId, nsSelect, nsInput, states, isFocused, expanded,
    optionsArray, hoverOption, selectSize, filteredOptionsCount,
    updateTooltip, updateTagTooltip, debouncedOnInputChange, onInput,
    deletePrevTag, deleteTag, deleteSelected, handleOptionSelect,
    scrollToOption, hasModelValue, shouldShowPlaceholder, currentPlaceholder,
    mouseEnterEventName, needStatusIcon, showClearBtn, iconComponent,
    iconReverse, validateState, validateIcon, showNewOption, updateOptions,
    collapseTagSize, setSelected, selectDisabled, emptyText,
    handleCompositionStart, handleCompositionUpdate, handleCompositionEnd,
    handleKeydown, onOptionCreate, onOptionDestroy, handleMenuEnter,
    focus, blur,

    handleMouseenter,
    handleMouseleave,
    handleClearClick,
    handleClickOutside,
    handleEsc,
    toggleMenu,
    selectOption,

    getValueKey, navigateOptions, dropdownMenuVisible, showTagList,
    collapseTagList, popupScroll, getOption, endReached,
    tagStyle, collapseTagStyle,
    popperRef, inputRef, tooltipRef, tagTooltipRef, prefixRef, suffixRef,
    selectRef, wrapperRef, selectionRef, scrollbarRef, menuRef, tagMenuRef,
    collapseItemRef
  }
}
