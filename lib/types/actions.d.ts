/**
 * DSHP skill 三入口（模型工具 / 斜杠命令 / 面板 Remote）共享的核心动作（ADR-0007「三面同源」）。
 * 把 browse / introduce / remove 的业务逻辑收敛到一处，避免 skills/commands/service 各自手写漂移。
 * 各表面（tools.ts / commands.ts / skill-panel-service.ts）只负责把统一结果格式化为自身形状。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionSkillStore } from './handles.ts';
/** 池浏览条目（含面板前置置灰原因；命令/工具取用其子集）。 */
export interface PoolBrowseEntry {
    readonly name: string;
    readonly origin: 'local' | 'ecosystem';
    readonly source?: string;
    readonly description: string;
    readonly available: boolean;
    readonly introduced: boolean;
    /** 未订阅 / 生态来源未确认（面板置灰原因；命令/工具以其渲染前置提示）。 */
    readonly blockReason?: string;
}
/**
 * 统一结果：成功 / 幂等已引入 / 失败。各表面据此渲染自身的成功与报错形状。
 */
export type IntroduceResult = {
    readonly ok: true;
    readonly name: string;
    readonly origin: 'local' | 'ecosystem';
    readonly shadowed: boolean;
    readonly alreadyIntroduced: boolean;
} | {
    readonly ok: false;
    readonly reason: string;
};
export type RemoveResult = {
    readonly ok: true;
    readonly name: string;
} | {
    readonly ok: false;
    readonly reason: string;
};
/** 生成池浏览条目列表（本地 + 已订阅生态 + 未订阅目录），标记 introduced 与 blockReason。 */
export declare function browsePool(poolRoot: string, agent: Agent, store: SessionSkillStore): PoolBrowseEntry[];
/** 关键词/来源过滤（命令与工具共用）。 */
export declare function filterBrowse(items: PoolBrowseEntry[], opts?: {
    origin?: 'local' | 'ecosystem' | undefined;
    query?: string | undefined;
}): PoolBrowseEntry[];
/**
 * 从池引入 skill 到当前会话（幂等；同名影子覆盖仅本会话）。
 * 统一校验序列：名称 → 幂等 → 存在 → 订阅 → 信任 → 可读 → 注册。
 */
export declare function introduceSkill(ctx: Context, poolRoot: string, store: SessionSkillStore, agent: Agent, name: string): Promise<IntroduceResult>;
/** 从当前会话移除（幂等；未引入时报错）。 */
export declare function removeSkill(store: SessionSkillStore, agent: Agent, name: string): RemoveResult;
//# sourceMappingURL=actions.d.ts.map