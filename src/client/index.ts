/**
 * 技能面板 client 半（ADR-0007）：注册一个加性槽位入口。
 * - settings.section「技能面板」节（order 30，全功能管理页）
 * （会话头「技能」popover 入口已按用户要求移除，仅在设置页管理。）
 * 数据走 HTTP 客户端（api.ts，相对路径 fetch /skill-panel/<method>，发布方案一）：
 * host webServer 路由随 host 半同步注册，client 半无需等待 remote 就绪，
 * 实例化后直接可用，故此处不再需要旧的 remote 轮询包装。
 */
import { createElement } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import { NS, en, zh } from './locale.ts';
import type { SkillPanelLocaleDict } from './locale.ts';
import { ensureStyle } from './styles.ts';
import { SkillPanelSettingsSection } from './sections.tsx';
import { createSkillPanelClient } from './api.ts';

export const inject = ['slots', 'locale'];

type Translate = (key: keyof SkillPanelLocaleDict) => string;

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-panel: dictionaries');
  ensureStyle(ctx);
  const t = ctx.locale.bind(NS) as Translate;

  // HTTP 客户端：无 remote 网关，无就绪竞态，实例化后即可调用。
  const client = createSkillPanelClient();

  function SkillPanelSectionEntry(props: unknown) {
    return createElement(SkillPanelSettingsSection, { ...(props as object), client, t });
  }

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'skill-panel',
        order: 30,
        label: () => t('nav'),
        locale: NS,
      },
      SkillPanelSectionEntry,
    ),
  );
}
