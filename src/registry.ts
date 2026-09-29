/**
 * cordis.registry 遍历与 mcp-client 配置识别（mcp-manager 与 plugin-manager 共享）。
 * registry 是 Map<unknown, { fibers }>，Fiber 携带 name/state/config。
 */
import type { Context } from '@deepseek-ai/cordis'

export interface RegistryFiber {
  name?: unknown
  state?: number
  config?: unknown
  /** cordis fiber 的父链（真实 fiber 有；测试桩可缺）。 */
  parent?: { fiber?: RegistryFiber }
}

/**
 * fiber 是否位于 root 子树内（沿 fiber.parent 上溯）。
 * 用于把「会话挂载 fiber」归入其所属会话，而不是进程级组合行。
 */
export function withinFiber(fiber: RegistryFiber | undefined, root: RegistryFiber | undefined): boolean {
  if (fiber === undefined || root === undefined) return false
  let current: RegistryFiber | undefined = fiber
  while (current !== undefined) {
    if (current === root) return true
    const parent: RegistryFiber | undefined = current.parent?.fiber
    if (parent === undefined || parent === current) return false
    current = parent
  }
  return false
}

/** 从 cordis.registry 拍平所有已加载插件 Fiber（含 mcp-client）。 */
export function registryFibers(ctx: Context): RegistryFiber[] {
  const registry = ctx.registry as unknown as Map<unknown, { fibers?: RegistryFiber[] }>
  const out: RegistryFiber[] = []
  for (const runtime of registry.values()) {
    for (const fiber of runtime.fibers ?? []) out.push(fiber)
  }
  return out
}

/**
 * mcp-client 插件配置签名：`serverName`（string）+ `transport`（stdio/streamable-http）。
 * Cordis `fiber.name` 是插件显示名/行 id（如 `mcp-chrome-devtools`），不是包名，
 * 故不能按包名过滤，须按该配置形状识别"这是一个 mcp-client 桥接的 server"。
 */
export function isMcpClientConfig(config: unknown): config is { serverName: string; transport: 'stdio' | 'streamable-http' } {
  const c = config as Record<string, unknown> | undefined
  return typeof c?.serverName === 'string' && c.serverName !== ''
    && (c.transport === 'stdio' || c.transport === 'streamable-http')
}
