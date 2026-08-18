/**
 * 独立 client 构建所需类型增强（发布方案一）。
 * - 加载平台 client 服务类型：Context.slots / Context.locale 由
 *   dsh-client-runtime/client 与 dsh-client-locale/client 的 module augmentation 提供；
 * - 加载 settings 槽位契约（dsh-client-ui-settings/client 声明 settings.section 等
 *   SlotMap 条目），使 `ctx.slots.inject('settings.section')` / register 通过类型检查；
 * - 登记本包自己的 locale 命名空间 'skill-panel'（ns 的所有者是我们自己）。
 * 全部 type-only 导入，编译期擦除，不引入运行时副作用（运行时服务由平台注入）。
 */
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SkillPanelLocaleDict } from './locale'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 本插件「技能面板」locale 命名空间（settings.section 的 label / 文案源）。 */
    'skill-panel': SkillPanelLocaleDict
  }
}
