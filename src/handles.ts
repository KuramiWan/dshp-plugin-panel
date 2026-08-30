/**
 * 按 agent+name 的引入句柄跟踪（模型工具与斜杠命令共用同一份，幂等语义）。
 * 实例化：由插件持有（PluginPanelPlugin 构造时创建），随插件实例生命周期存在；
 * 底层 WeakMap：Agent 对象被回收即释放，不泄漏、不跨会话。
 * 2026-08 重写：移除面板专用 appendAudit（审计是面板语义，已随面板下线）。
 * 2026-08 会话引入集持久化（§3.2）：track/drop 后把「本会话引入了哪些池技能」落盘到
 * <poolRoot>/.session-skills/<sessionId>.json；宿主重启后 resume 事件触发重放（见 replay）。
 * 键用 agent.session.id（持久字符串，跨重启稳定；WeakMap 的 Agent 对象键跨重启失效）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { readTextFileSync } from './fs.ts'
import { consoleLogger, type PanelLogger } from './logger.ts'

const SESSION_SKILLS_DIR = '.session-skills'

export class SessionSkillStore {
  private readonly introduced = new WeakMap<Agent, Map<string, () => void>>()
  /** 会话引入集落盘目录（poolRoot/.session-skills）；undefined = 不持久化（测试等）。 */
  private readonly persistDir: string | undefined
  /** 日志面（默认 console；插件实例可注入 ctx.logger('store')）。 */
  readonly logger: PanelLogger

  constructor(poolRoot?: string, logger: PanelLogger = consoleLogger) {
    this.persistDir = poolRoot === undefined ? undefined : join(poolRoot, SESSION_SKILLS_DIR)
    this.logger = logger
  }

  /** 当前会话已引入的 skill 名清单。 */
  names(agent: Agent): string[] {
    const map = this.introduced.get(agent)
    return map === undefined ? [] : [...map.keys()]
  }

  /** 获取某 agent+name 的 disposer（未引入返回 undefined）。 */
  disposer(agent: Agent, name: string): (() => void) | undefined {
    return this.introduced.get(agent)?.get(name)
  }

  /** 记录 disposer（幂等：同名覆盖）；随后把会话引入集落盘。 */
  track(agent: Agent, name: string, dispose: () => void): void {
    let map = this.introduced.get(agent)
    if (map === undefined) {
      map = new Map()
      this.introduced.set(agent, map)
    }
    map.set(name, dispose)
    this.persist(agent)
  }

  /** 摘除记录（disposer 由调用方先行执行）；随后把会话引入集落盘。 */
  drop(agent: Agent, name: string): void {
    this.introduced.get(agent)?.delete(name)
    this.persist(agent)
  }

  // ---- 会话引入集持久化（§3.2） ----

  /** 会话持久键：agent.session.id（与 agent.id 相同，跨重启稳定）。 */
  private sessionId(agent: Agent): string | undefined {
    return agent.session?.id ?? undefined
  }

  /** 把当前会话引入名集写入 <persistDir>/<sessionId>.json（失败仅告警，不阻断引入）。 */
  private persist(agent: Agent): void {
    const dir = this.persistDir
    const id = this.sessionId(agent)
    if (dir === undefined || id === undefined) return
    try {
      mkdirSync(dir, { recursive: true })
      const payload = { sessionId: id, skills: this.names(agent) }
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8')
    } catch (error) {
      // 落盘失败不使引入失败：会话内注册已成功，只是重启后不再恢复。
      this.logger.warn(`persist session introduce-set for "${id}" failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** 读取某会话上次落盘的引入名集（宿主重启后重放用）。 */
  readPersisted(sessionId: string): string[] {
    const dir = this.persistDir
    if (dir === undefined) return []
    const path = join(dir, `${sessionId}.json`)
    if (!existsSync(path)) return []
    const text = readTextFileSync(path)
    if (text === undefined) return []
    try {
      const data = JSON.parse(text) as { skills?: unknown }
      return Array.isArray(data?.skills) ? data.skills.filter(s => typeof s === 'string') as string[] : []
    } catch {
      return []
    }
  }
}
