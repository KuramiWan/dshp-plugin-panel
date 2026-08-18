/**
 * DSHP 会话级 Skill 的斜杠命令（人类直接调用，不经模型）：与 session_skill_* 模型工具、
 * 技能面板共享 actions.ts 核心逻辑（幂等、会话隔离、影子覆盖）。注册到 ctx.commands，
 * dsh web 输入框 `/` 菜单经 commands remote 自动发现。注册包 ctx.effect：随插件实例生命周期回收。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionSkillStore } from './handles.ts';
export interface SessionSkillCommandConfig {
    /** 池根目录；默认 ~/.dsh/.skill-pool */
    readonly poolRoot: string;
    /** 会话引入句柄存储（插件实例共享）。 */
    readonly store: SessionSkillStore;
}
/** 注册五个 /skill-* 斜杠命令（全局，经 ctx.commands 供所有会话的 `/` 菜单发现）。 */
export declare function applySessionSkillCommands(ctx: Context, config: SessionSkillCommandConfig): void;
//# sourceMappingURL=commands.d.ts.map