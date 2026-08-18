/**
 * DSHP 会话级 Skill 控制插件（ADR-0007：命令 + 工具 + 面板三入口）：
 * - 5 个 session_skill_* 模型工具（模型自主调用）+ 5 个 /skill-* 斜杠命令（人类直接调用）；
 * - SkillPanelService（webServer HTTP 路由，5 方法）供浏览器面板消费——三面共享同一
 *   SessionSkillStore（按 agent+name 跟踪 disposer，幂等语义）与 pool.ts 只读层；
 * - 注册走插件 ctx（ctx.effect / ctx.plugin），随插件实例生命周期回收——避免重复注册。
 * 数据源：池目录（默认 ~/.dsh/.skill-pool）。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export type { SkillPanelBrowseEntry, SkillPanelBrowseRequest, SkillPanelBrowseResult, SkillPanelIntroducedSkill, SkillPanelListRequest, SkillPanelListResult, SkillPanelDetailRequest, SkillPanelDetailResult, SkillPanelIntroduceRequest, SkillPanelIntroduceResult, SkillPanelRemoveRequest, SkillPanelRemoveResult, } from './types.ts';
export interface SkillControlConfig {
    /** 池根目录；默认 ~/.dsh/.skill-pool */
    readonly poolRoot?: string;
}
/** 纯 host 插件（服务/RPC + 工具 + 命令）：挂载后为所有会话提供三面管理入口，操作维度仍按会话。 */
export declare class SkillControlPlugin {
    static inject: string[];
    static Config: z<SkillControlConfig>;
    private readonly store;
    constructor(ctx: Context, config?: SkillControlConfig);
}
export default SkillControlPlugin;
//# sourceMappingURL=index.d.ts.map