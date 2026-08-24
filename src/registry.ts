/**
 * cordis.registry 遍历与 mcp-client 配置识别（mcp-manager 与 plugin-manager 共享）。
 * registry 是 Map<unknown, { fibers }>，Fiber 携带 name/state/config。
 */
import type { Context } from '@deepseek-ai/cordis'

export interface RegistryFiber {
  name?: unknown
  state?: number
  config?: unknown
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
