这个项目存在的意义在于解决官方社区没有事件修复内存泄漏的问题，这个项目会持续更新官方的最红版本，并只保留一个修复的版本

## 修复useResizeObserver的内存泄漏问题，官方指出这个组件必须在setup中使用才会自动清理内存，否则会导致内存泄漏。

修复方式 对于每个有问题的组件，需要:

1. 在 onMounted 或 watchEffect 中使用 useResizeObserver 并保存 stop 函数
2. 在 onBeforeUnmount 或 onUnmounted 中调用 stop 函数清理
