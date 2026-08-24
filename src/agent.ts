/**
 * 从工具执行上下文取调用 agent（模型工具与 MCP 工具共用）。
 */
import type { Agent } from '@deepseek-ai/dsh-agent'

export function requireAgent(exec: { agent?: Agent }, label: string): Agent {
  if (exec.agent === undefined) throw new Error(`${label} require a calling agent`)
  return exec.agent
}
