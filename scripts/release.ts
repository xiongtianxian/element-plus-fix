import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import consola from 'consola'

const projRoot = path.resolve(__dirname, '..')

interface CatalogConfig {
  [key: string]: string
}

function runCommand(cmd: string, cwd?: string) {
  consola.log(`Running: ${cmd}`)
  execSync(cmd, {
    cwd: cwd || projRoot,
    stdio: 'inherit',
  })
}

function resolveCatalogDependencies() {
  consola.log('\n--- Resolving catalog dependencies ---')

  // 读取 pnpm-workspace.yaml 获取 catalog 配置
  const workspaceConfigPath = path.resolve(projRoot, 'pnpm-workspace.yaml')
  const workspaceContent = readFileSync(workspaceConfigPath, 'utf-8')

  // 解析 catalog 配置
  const lines = workspaceContent.split('\n')
  let inCatalog = false
  const catalog: CatalogConfig = {}

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === 'catalog:') {
      inCatalog = true
      continue
    }

    if (inCatalog && trimmed && !trimmed.startsWith('#')) {
      if (!line.startsWith(' ')) {
        break
      }

      const colonIndex = trimmed.indexOf(':')
      if (colonIndex > 0) {
        let pkg = trimmed.slice(0, Math.max(0, colonIndex)).trim()
        let version = trimmed.slice(Math.max(0, colonIndex + 1)).trim()
        pkg = pkg.replace(/['"]/g, '')
        version = version.replace(/['"]/g, '')
        if (pkg && version) {
          catalog[pkg] = version
        }
      }
    }
  }

  // 读取并更新 element-plus package.json
  const pkgPath = path.resolve(projRoot, 'packages/element-plus/package.json')
  const pkgContent = readFileSync(pkgPath, 'utf-8')
  const pkg = JSON.parse(pkgContent)

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

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
  consola.success('Catalog dependencies resolved successfully')
}

function main() {
  // 获取版本号参数
  const version = process.argv[2] || process.env.TAG_VERSION

  if (!version) {
    consola.error(
      'Please provide a version number as argument or set TAG_VERSION environment variable'
    )
    consola.error('Usage: pnpm tsx scripts/release.ts <version>')
    process.exit(1)
  }

  consola.info(`\n=== Releasing element-plus@${version} ===`)

  try {
    // 1. 更新版本号
    consola.log('\n--- Updating version ---')
    const gitHead = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
    process.env.TAG_VERSION = version
    process.env.GIT_HEAD = gitHead
    runCommand('pnpm run update:version')

    // 2. 生成版本文件
    consola.log('\n--- Generating version file ---')
    runCommand('pnpm run gen:version')

    // 3. 解析 catalog 依赖
    resolveCatalogDependencies()

    // 4. 构建项目
    consola.log('\n--- Building project ---')
    runCommand('pnpm run build')

    // 5. 构建主题样式
    consola.log('\n--- Building theme ---')
    runCommand('pnpm run build:theme')

    // 6. 更新 dist/element-plus/package.json 的版本号
    consola.log('\n--- Updating dist version ---')
    const distPkgPath = path.resolve(projRoot, 'dist/element-plus/package.json')
    const distPkgContent = readFileSync(distPkgPath, 'utf-8')
    const distPkg = JSON.parse(distPkgContent)
    distPkg.version = version
    writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2))
    consola.log(`Updated dist/element-plus/package.json version to ${version}`)

    // 7. 发布到私库（从 dist/element-plus 目录发布）
    consola.log('\n--- Publishing to registry ---')
    const pkgDir = path.resolve(projRoot, 'dist/element-plus')

    // 使用 powershell 绕过执行策略限制
    const publishCmd = `powershell -Command "cd ${pkgDir}; npm publish --tag hc --registry http://172.16.10.253:4873/"`
    execSync(publishCmd, { stdio: 'inherit' })

    consola.success(`\n=== Successfully released element-plus@${version} ===`)
    consola.info('You can install it with:')
    consola.info(
      `npm install element-plus@${version} --registry http://172.16.10.253:4873/`
    )
  } catch (error) {
    consola.error(`Release failed: ${error}`)
    process.exit(1)
  }
}

main()
