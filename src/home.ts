/**
 * DSH home 目录解析（跨平台统一入口）。
 * 优先级：显式 `$DSH_HOME`（trim 后非空）> `homedir()/.dsh`。
 * `homedir()` 在 win/linux/mac 均返回用户主目录（Windows 为 `C:\Users\<name>`），
 * 避免用 Windows 专属的 `USERPROFILE` 环境变量（Linux/macOS 上为 undefined）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface EnvLike {
  DSH_HOME?: string
}

export function defaultDshHome(env: EnvLike = process.env): string {
  const fromEnv = env.DSH_HOME?.trim()
  return fromEnv || join(homedir(), '.dsh')
}
