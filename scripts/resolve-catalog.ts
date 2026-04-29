import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import consola from 'consola'

interface CatalogConfig {
  [key: string]: string
}

const projRoot = path.resolve(__dirname, '..')

async function main() {
  consola.log('Resolving catalog dependencies...')

  // 读取 pnpm-workspace.yaml 获取 catalog 配置
  const workspaceConfigPath = path.resolve(projRoot, 'pnpm-workspace.yaml')
  const workspaceContent = await readFile(workspaceConfigPath, 'utf-8')

  // 解析 catalog 配置
  const lines = workspaceContent.split('\n')
  let inCatalog = false
  const catalog: CatalogConfig = {}

  for (const line of lines) {
    const trimmed = line.trim()

    // 找到 catalog 部分
    if (trimmed === 'catalog:') {
      inCatalog = true
      continue
    }

    // 如果在 catalog 部分且不是注释
    if (inCatalog && trimmed && !trimmed.startsWith('#')) {
      // 检查是否是下一个 section（不以空格开头）
      if (!line.startsWith(' ')) {
        break
      }

      const colonIndex = trimmed.indexOf(':')
      if (colonIndex > 0) {
        let pkg = trimmed.slice(0, Math.max(0, colonIndex)).trim()
        let version = trimmed.slice(Math.max(0, colonIndex + 1)).trim()
        // 移除包名和版本中的单引号或双引号
        pkg = pkg.replace(/['"]/g, '')
        version = version.replace(/['"]/g, '')
        if (pkg && version) {
          catalog[pkg] = version
        }
      }
    }
  }

  consola.log('Parsed catalog:', catalog)

  // 读取 element-plus package.json
  const pkgPath = path.resolve(projRoot, 'packages/element-plus/package.json')
  const pkgContent = await readFile(pkgPath, 'utf-8')
  const pkg = JSON.parse(pkgContent)

  // 替换 dependencies 中的 catalog: 引用
  if (pkg.dependencies) {
    for (const [dep, version] of Object.entries(pkg.dependencies)) {
      if (version === 'catalog:') {
        if (catalog[dep]) {
          pkg.dependencies[dep] = catalog[dep]
          consola.log(`Replaced ${dep}: catalog: -> ${catalog[dep]}`)
        } else {
          consola.warn(`No catalog entry found for ${dep}`)
        }
      }
    }
  }

  // 写回 package.json
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2))

  consola.success('Catalog dependencies resolved successfully')
}

main().catch((err) => {
  consola.error(err)
  process.exit(1)
})
