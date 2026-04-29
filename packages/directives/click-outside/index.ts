import { isArray, isClient, isElement } from '@element-plus/utils'

import type {
  ComponentPublicInstance,
  DirectiveBinding,
  ObjectDirective,
} from 'vue'

type DocumentHandler = <T extends MouseEvent>(mouseup: T, mousedown: T) => void
type FlushList = Map<
  HTMLElement,
  {
    documentHandler: DocumentHandler
    bindingFn: (...args: unknown[]) => unknown
  }[]
>

const nodeList: FlushList = new Map()

if (isClient) {
  let startClick: MouseEvent | undefined
  document.addEventListener('mousedown', (e: MouseEvent) => (startClick = e))
  document.addEventListener('mouseup', (e: MouseEvent) => {
    if (!startClick) return
    // 👇 修复点：迭代前先过滤掉已经被卸载的 DOM
    for (const el of Array.from(nodeList.keys())) {
      if (!el.isConnected) {
        nodeList.delete(el)
      }
    }

    // 👇 安全遍历，防止迭代时被修改
    const handlersList = Array.from(nodeList.values())
    for (const handlers of handlersList) {
      for (const { documentHandler } of handlers) {
        documentHandler(e as MouseEvent, startClick)
      }
    }
    startClick = undefined
  })
}

function createDocumentHandler(
  el: HTMLElement,
  binding: DirectiveBinding
): DocumentHandler {
  let excludes: HTMLElement[] = []
  if (isArray(binding.arg)) {
    excludes = binding.arg
  } else if (isElement(binding.arg)) {
    // due to current implementation on binding type is wrong the type casting is necessary here
    excludes.push(binding.arg as unknown as HTMLElement)
  }
  return function (mouseup, mousedown) {
    const popperRef = (
      binding.instance as ComponentPublicInstance<{
        popperRef: HTMLElement
      }>
    ).popperRef
    const mouseUpTarget = mouseup.target as Node
    const mouseDownTarget = mousedown?.target as Node
    const isBound = !binding || !binding.instance
    const isTargetExists = !mouseUpTarget || !mouseDownTarget
    const isContainedByEl =
      el.contains(mouseUpTarget) || el.contains(mouseDownTarget)
    const isSelf = el === mouseUpTarget

    const isTargetExcluded =
      (excludes.length &&
        excludes.some((item) => item?.contains(mouseUpTarget))) ||
      (excludes.length && excludes.includes(mouseDownTarget as HTMLElement))
    const isContainedByPopper =
      popperRef &&
      (popperRef.contains(mouseUpTarget) || popperRef.contains(mouseDownTarget))
    if (
      isBound ||
      isTargetExists ||
      isContainedByEl ||
      isSelf ||
      isTargetExcluded ||
      isContainedByPopper
    ) {
      return
    }
    binding.value(mouseup, mousedown)
  }
}

const ClickOutside: ObjectDirective<HTMLElement, any> = {
  beforeMount(el, binding) {
    // there could be multiple handlers on the element
    if (!nodeList.has(el)) {
      nodeList.set(el, [])
    }

    nodeList.get(el)!.push({
      documentHandler: createDocumentHandler(el, binding),
      bindingFn: binding.value,
    })
  },
  updated(el, binding) {
    if (!nodeList.has(el)) {
      nodeList.set(el, [])
    }

    const handlers = nodeList.get(el)!
    const oldHandlerIndex = handlers.findIndex(
      (item) => item.bindingFn === binding.oldValue
    )
    const newHandler = {
      documentHandler: createDocumentHandler(el, binding),
      bindingFn: binding.value,
    }

    if (oldHandlerIndex >= 0) {
      // replace the old handler to the new handler
      handlers.splice(oldHandlerIndex, 1, newHandler)
    } else {
      handlers.push(newHandler)
    }
  },
  unmounted(el) {
    // 👇 【唯一修复点】真正清理 Map 引用，释放 DOM
    if (nodeList.has(el)) {
      const handlers = nodeList.get(el)!
      handlers.length = 0 // 清空数组，释放闭包
      nodeList.delete(el) // 从 Map 移除
    }
  },
}

export default ClickOutside
