/**
 * DSH home 目录解析（跨平台统一入口）。
 * 优先级：显式 `$DSH_HOME`（trim 后非空）> `homedir()/.dsh`。
 * `homedir()` 在 win/linux/mac 均返回用户主目录（Windows 为 `C:\Users\<name>`），
 * 避免用 Windows 专属的 `USERPROFILE` 环境变量（Linux/macOS 上为 undefined）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface EnvLike {
  DSH_HOME?: string
}

export function defaultDshHome(env: EnvLike = process.env): string {
  const fromEnv = env.DSH_HOME?.trim()
  return fromEnv || join(homedir(), '.dsh')
}

/**
 * 从 ctx.baseUrl 派生所在 profile 目录：dsh boot 时（dsh-app-boot 的 boot()）设置
 * `ctx.baseUrl = pathToFileURL(profileDir 下 cordis.yml 所在目录)`，即正在挂载本面板的
 * profile 目录。这是「面板自动知道自己在哪个 profile」的官方入口——不再需要 setup
 * 往 patch 注入 profileDir（旧方案：扫描 + 注入才能避免猜错）。
 * 返回 undefined 表示 ctx 无 baseUrl（测试桩或非 dsh 环境），调用方回退扫描。
 */
export function profileDirFromBaseUrl(baseUrl: unknown): string | undefined {
  if (typeof baseUrl !== 'string' || baseUrl === '') return undefined
  try {
    // fileURLToPath('file:///x/profile/') → '/x/profile/'；去掉尾斜杠与目录路径惯例一致。
    return fileURLToPath(baseUrl).replace(/[\\/]$/, '')
  } catch {
    return undefined
  }
}
