/**
 * 按 agent+name 的引入句柄跟踪（模型工具与斜杠命令共用同一份，幂等语义）。
 * 实例化：由插件持有（SkillControlPlugin 构造时创建），随插件实例生命周期存在；
 * 底层 WeakMap：Agent 对象被回收即释放，不泄漏、不跨会话。
 * 2026-08 重写：移除面板专用 appendAudit（审计是面板语义，已随面板下线）。
 */
import type { Agent } from '@deepseek-ai/dsh-agent'

export class SessionSkillStore {
  private readonly introduced = new WeakMap<Agent, Map<string, () => void>>()

  /** 当前会话已引入的 skill 名清单。 */
  names(agent: Agent): string[] {
    const map = this.introduced.get(agent)
    return map === undefined ? [] : [...map.keys()]
  }

  /** 获取某 agent+name 的 disposer（未引入返回 undefined）。 */
  disposer(agent: Agent, name: string): (() => void) | undefined {
    return this.introduced.get(agent)?.get(name)
  }

  /** 记录 disposer（幂等：同名覆盖）。 */
  track(agent: Agent, name: string, dispose: () => void): void {
    let map = this.introduced.get(agent)
    if (map === undefined) {
      map = new Map()
      this.introduced.set(agent, map)
    }
    map.set(name, dispose)
  }

  /** 摘除记录（disposer 由调用方先行执行）。 */
  drop(agent: Agent, name: string): void {
    this.introduced.get(agent)?.delete(name)
  }
}