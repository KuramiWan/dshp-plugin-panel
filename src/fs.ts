/**
 * 跨平台文件读写小工具（BOM 剥离 + 原子写）。
 * 集中处理 Windows 与 POSIX 的差异，避免各模块各自手写漂移。
 */
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'

/**
 * 读取 UTF-8 文本并剥离 BOM（真实池文件由 PowerShell 写入、常带 \uFEFF 头；
 * 否则 frontmatter 正则匹配 ^--- 失败、JSON.parse 报 Unexpected token）。
 * 失败（不存在/不可读）返回 undefined。
 */
export function readTextFileSync(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return undefined
  }
}

/**
 * 原子写：先写临时文件再 rename 覆盖，避免半截文件被 watcher 读到。
 * Windows 上 rename 覆盖已存在（可能被 watcher/杀软占用）的文件会抛 EPERM/EACCES，
 * 故失败时回退为「先删后 rename」（牺牲原子性换取跨平台可用）。
 */
export function atomicWriteFileSync(file: string, data: string): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, data, 'utf8')
  try {
    renameSync(tmp, file)
  } catch (error) {
    try {
      if (existsSync(file)) unlinkSync(file)
      renameSync(tmp, file)
    } catch (error2) {
      try { unlinkSync(tmp) } catch { /* 清理临时文件失败可忽略 */ }
      throw error2
    }
  }
}
