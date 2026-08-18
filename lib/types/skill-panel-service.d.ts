/**
 * SkillPanelService —— 面板的 host 侧 HTTP 服务（发布方案一：webServer 路由 + fetch）。
 *
 * 5 个方法全部转发共享核心（actions.ts + pool.ts 只读层 + SessionSkillStore 会话句柄），
 * 与 session_skill_* 模型工具、/skill-* 斜杠命令三面同源（ADR-0007「三面同源」），不新增业务语义：
 * - browse / list / detail 为只读；
 * - introduce / remove 与命令/工具同一代码路径（幂等、会话隔离、影子覆盖提示）。
 *
 * 通道：DSH 自带 webServer（同进程 HTTP，client 用相对路径 fetch）。
 * 端点：POST /skill-panel/<method>，body 为 JSON 载荷，响应为 JSON。
 * 方法：browse / list / detail / introduce / removeSkill。
 *
 * 与 monorepo 解耦：本服务不依赖 typert 生成器/桩，仅用 node:http 与 DSH 的
 * webServer 服务，可脱离 monorepo 独立构建（发布 npm / 独立安装的前提）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionSkillStore } from './handles.ts';
import type { SkillPanelBrowseRequest, SkillPanelBrowseResult, SkillPanelDetailRequest, SkillPanelDetailResult, SkillPanelIntroduceRequest, SkillPanelIntroduceResult, SkillPanelListRequest, SkillPanelListResult, SkillPanelRemoveRequest, SkillPanelRemoveResult } from './types.ts';
export interface SkillPanelServiceOptions {
    /** 池根目录；默认 ~/.dsh/.skill-pool */
    readonly poolRoot: string;
    /** 会话引入句柄存储（插件实例共享）。 */
    readonly store: SessionSkillStore;
}
/** 面板 host 服务：只读为主；写操作与命令/工具同路径。 */
export declare class SkillPanelService {
    static inject: string[];
    private readonly ctx;
    private readonly poolRoot;
    private readonly store;
    constructor(ctx: Context, options: SkillPanelServiceOptions);
    private agentOf;
    /** 路由分发：POST /skill-panel/<method>，body 为 JSON 载荷。 */
    private dispatch;
    private pathMethod;
    private readBody;
    private send;
    /** 池浏览（本地 + 已订阅生态 + 未订阅目录），支持来源过滤与关键词。 */
    browse(request: SkillPanelBrowseRequest): SkillPanelBrowseResult;
    /** 当前会话已引入清单。 */
    list(request: SkillPanelListRequest): Promise<SkillPanelListResult>;
    /** 单个技能的完整定义（名称/来源/说明/适用场景/正文）。 */
    detail(request: SkillPanelDetailRequest): SkillPanelDetailResult;
    /** 从池引入到当前会话（幂等；同名影子覆盖仅本会话）。 */
    introduce(request: SkillPanelIntroduceRequest): Promise<SkillPanelIntroduceResult>;
    /** 从当前会话移除（幂等；未引入时报错）。方法名避开 RemoteNamespaceService 保留名（remove 冲突）。 */
    removeSkill(request: SkillPanelRemoveRequest): SkillPanelRemoveResult;
}
//# sourceMappingURL=skill-panel-service.d.ts.map