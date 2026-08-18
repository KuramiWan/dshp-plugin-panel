import z from '@deepseek-ai/schemastery';
import { applySessionSkillTools } from "./tools.js";
import { applySessionSkillCommands } from "./commands.js";
import { SkillPanelService } from "./skill-panel-service.js";
import { resolvePoolRoot } from "./pool.js";
import { SessionSkillStore } from "./handles.js";
/** 纯 host 插件（服务/RPC + 工具 + 命令）：挂载后为所有会话提供三面管理入口，操作维度仍按会话。 */
export class SkillControlPlugin {
    static inject = ['agents', 'tools', 'skills', 'commands'];
    // schemastery fork：object 字段默认即可选（.required() 才必填），故 poolRoot 不必写 optional
    static Config = z.object({
        poolRoot: z.string(),
    });
    store = new SessionSkillStore();
    constructor(ctx, config = {}) {
        const poolRoot = resolvePoolRoot(config.poolRoot);
        applySessionSkillTools(ctx, { poolRoot, store: this.store });
        applySessionSkillCommands(ctx, { poolRoot, store: this.store });
        ctx.plugin(SkillPanelService, { poolRoot, store: this.store });
    }
}
export default SkillControlPlugin;
//# sourceMappingURL=index.js.map