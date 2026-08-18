/**
 * session_skill_* 模型工具（DSHP 规范源）：浏览/搜索/列表/引入/移除。
 * 业务逻辑收敛在 actions.ts；本文件只做 shape 与表面文案。
 * 引入/移除走 agent-scope（exec.agent）：exec.agent.ctx.get('skills') → 会话实例层。
 * 句柄跟踪由注入的 SessionSkillStore 提供（与 /skill-* 斜杠命令、面板共享，幂等）。
 * 注册包 ctx.effect：随插件实例生命周期回收。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionSkillStore } from './handles.ts';
export interface SessionSkillConfig {
    /** 池根目录；默认 ~/.dsh/.skill-pool */
    readonly poolRoot: string;
    /** 会话引入句柄存储（插件实例共享）。 */
    readonly store: SessionSkillStore;
}
export declare function applySessionSkillTools(ctx: Context, config: SessionSkillConfig): void;
//# sourceMappingURL=tools.d.ts.map