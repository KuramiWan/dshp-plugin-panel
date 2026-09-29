/**
 * 会话级插件挂载管理器（issue #5「统一挂载点模型」的会话挂载点）。
 *
 * 把用户插件挂到**单个 agent 的会话 Context**（agent.ctx），卸载用 fiber.dispose()，
 * 不写任何组合文件（对比 plugin-manager 的 patch/bundles 写路径）。
 * 机制经 M0 spike 实测：见 tmp/plan-session-scoped-plugins.md「M0 结论」段。
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PluginManager } from './plugin-manager.ts'
import { withinFiber, type RegistryFiber } from './registry.ts'

/** FiberState.ACTIVE（cordis const enum 无运行时导出）。 */
const ACTIVE = 2

/** cordis.isolate 为 Symbol.for 全局注册符号（跨 cordis 副本一致）。 */
const ISOLATE = Symbol.for('cordis.isolate')

interface ServiceImpl { name: string; fiber: RegistryFiber }

/** 会话挂载点视图。 */
export interface SessionPluginMount {
  readonly id: string
  readonly packageName: string
  /** FiberState 数值。 */
  readonly state: number
  /** 是否 ACTIVE。 */
  readonly active: boolean
}

/** 单个挂载记录。 */
interface MountRecord {
  packageName: string
  fiber: { await: () => Promise<unknown>; dispose: () => unknown; state?: number }
}

export type SessionPluginMountResult =
  | { ok: true; id: string; mounted: true; alreadyMounted: boolean }
  | { ok: false; reason: string }

export type SessionPluginUnmountResult =
  | { ok: true; id: string; mounted: false }
  | { ok: false; reason: string }

export class SessionPluginManager {
  private readonly ctx: Context
  /** 活动 profile 目录（已安装插件包的解析根；与 plugin-manager 同源）。 */
  readonly profileDirPath: string | undefined
  private readonly plugins: PluginManager
  /** 每 agent 的挂载记录；agent 被回收时随 WeakMap 消失。 */
  private readonly byAgent = new WeakMap<Agent, Map<string, MountRecord>>()

  constructor(ctx: Context, profileDir: string | undefined, plugins: PluginManager) {
    this.ctx = ctx
    this.profileDirPath = profileDir
    this.plugins = plugins
  }

  private mapOf(agent: Agent): Map<string, MountRecord> {
    let map = this.byAgent.get(agent)
    if (map === undefined) {
      map = new Map()
      this.byAgent.set(agent, map)
    }
    return map
  }

  /** 该会话当前的挂载点列表。 */
  list(agent: Agent): SessionPluginMount[] {
    const out: SessionPluginMount[] = []
    for (const [id, record] of this.mapOf(agent)) {
      const state = typeof record.fiber.state === 'number' ? record.fiber.state : 0
      out.push({ id, packageName: record.packageName, state, active: state === ACTIVE })
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  }

  /** 本次挂载发布进 root realm 的服务名（空 = 无泄漏）。 */
  private leakedServices(
    agent: Agent,
    before: ReadonlySet<symbol>,
    store: Record<symbol, ServiceImpl | undefined>,
  ): string[] {
    const ctx = agent.ctx as unknown as {
      fiber: RegistryFiber
      root: Record<symbol, Record<string, symbol>>
    }
    const rootIsolate = ctx.root[ISOLATE]
    const leaked: string[] = []
    for (const key of Object.getOwnPropertySymbols(store)) {
      if (before.has(key)) continue
      const impl = store[key]
      if (impl === undefined) continue
      if (!withinFiber(impl.fiber, ctx.fiber)) continue
      if (rootIsolate[impl.name] === key) leaked.push(impl.name)
    }
    return leaked.sort((a, b) => a.localeCompare(b))
  }

  /**
   * 全部 live 会话的挂载点：插件 id → 会话 id 列表（供进程级视图标注「全局 / 哪些会话」）。
   * 只读已存在的簿记，不为无挂载的会话建表。
   */
  mountsByPlugin(): Map<string, string[]> {
    const out = new Map<string, string[]>()
    const agents = (this.ctx as unknown as { agents?: { list: () => Array<{ id?: unknown }> } })
      .agents?.list() ?? []
    for (const agent of agents) {
      const sessionId = String((agent as { id?: unknown }).id ?? '')
      if (sessionId === '') continue
      const map = this.byAgent.get(agent as never)
      if (map === undefined) continue
      for (const id of map.keys()) {
        const sessions = out.get(id) ?? []
        sessions.push(sessionId)
        out.set(id, sessions)
      }
    }
    for (const sessions of out.values()) sessions.sort()
    return out
  }

  /** 把插件挂到该会话（幂等：已挂载返回现状）。 */
  async mount(agent: Agent, id: string): Promise<SessionPluginMountResult> {
    const map = this.mapOf(agent)
    if (map.has(id)) return { ok: true, id, mounted: true, alreadyMounted: true }

    const row = this.plugins.list(agent).find(p => p.id === id)
    if (row === undefined) return { ok: false, reason: `no plugin row "${id}"` }
    const packageName = row.packageName ?? id
    if (this.profileDirPath === undefined) return { ok: false, reason: 'profile directory not resolved' }

    // 挂载前快照：只把「本次挂载新发布」的服务纳入判罚，避免并发挂载互相误判。
    const store = agent.ctx.reflect.store as unknown as Record<symbol, ServiceImpl | undefined>
    const before = new Set(Object.getOwnPropertySymbols(store))

    let fiber: MountRecord['fiber'] | undefined
    try {
      // 从活动 profile 的 node_modules 解析包入口（面板自身解析上下文解析不到 profile 包，M0 实测）。
      const require = createRequire(join(this.profileDirPath, 'package.json'))
      const entry = require.resolve(packageName)
      const ns = await import(pathToFileURL(entry).href) as { default?: unknown }
      // unwrapExports 语义：无 default 时 ESM namespace {name, apply} 本身即插件对象。
      const plugin = ns.default ?? ns
      // 会话 ctx 上挂载：返回 wrapped fiber（`Object.create(raw)`）；卸载/泄漏判定只用其方法。
      const pluginHost = agent.ctx as unknown as { plugin: (p: unknown) => MountRecord['fiber'] }
      fiber = pluginHost.plugin(plugin)
      await fiber.await()
    } catch (error) {
      // 启动失败（含服务名被占用）：回滚，不留半初始化 fiber。
      if (fiber !== undefined) void fiber.dispose()
      return { ok: false, reason: `mount "${id}" failed: ${error instanceof Error ? error.message : String(error)}` }
    }

    // 泄漏预检 = 硬拒绝（判据与 DSH 官方 agent-presets 一致）：
    // 本次挂载发布进 root realm（非 isolate realm）的服务即视为进程级泄漏 → 卸载回滚。
    const leaked = this.leakedServices(agent, before, store)
    if (leaked.length > 0) {
      try { await fiber.dispose() } catch { /* 回滚失败已由 dispose 内部记录 */ }
      return {
        ok: false,
        reason: `plugin "${id}" published process-global service(s) [${leaked.join(', ')}]; a session-mountable plugin must not provide services into the root realm`,
      }
    }

    map.set(id, { packageName, fiber })
    // 第二保险（MCP usedCount 泄漏教训）：会话结束（agent scope 展开）时清掉本管理器的簿记。
    // 不能只依赖 WeakMap——agent 对象在会话结束后仍可能被外部引用，WeakMap 不会立即生效。
    // 幂等：仅当记录仍指向本次挂载的 fiber 时才删。
    agent.ctx.effect(() => () => {
      const current = this.mapOf(agent).get(id)
      if (current === undefined || current.fiber !== fiber) return
      this.mapOf(agent).delete(id)
    })
    return { ok: true, id, mounted: true, alreadyMounted: false }
  }

  /** 从该会话移除挂载点（单独卸载，不销毁会话）。 */
  async unmount(agent: Agent, id: string): Promise<SessionPluginUnmountResult> {
    const map = this.mapOf(agent)
    const record = map.get(id)
    if (record === undefined) return { ok: false, reason: `"${id}" is not mounted in this session` }
    try {
      await record.fiber.dispose()
    } catch (error) {
      return { ok: false, reason: `unmount "${id}" failed: ${error instanceof Error ? error.message : String(error)}` }
    }
    map.delete(id)
    return { ok: true, id, mounted: false }
  }
}
