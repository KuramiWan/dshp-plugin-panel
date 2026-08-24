/**
 * 宿主注入服务的类型声明（自包含，不依赖任何 @deepseek-ai/* 运行时包）。
 *
 * `ctx.locale` / `ctx.slots` 是 DSH 宿主（web 运行时）**注入**给 client 插件的服务，
 * 插件通过 `dsh.client.inject` 声明"需要它们"，并不拥有、也不运行它们。
 * 因此不为它们安装上游包（那是僵尸依赖），只在此声明插件实际用到的一小块表面。
 *
 * 注意：必须先 `import type { Context }` 让 TS 把 cordis 当作"已知模块"，下面的
 * `declare module '@deepseek-ai/cordis' { interface Context }` 才会作为**模块 augment**
 * 合并进真实的 Context（含 effect 等既有成员），而不是覆盖整个模块。
 */
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 宿主注入的国际化服务（仅声明本插件用到的 register/bind）。register 返回 disposer，供 ctx.effect 清理。 */
    locale: {
      register(ns: string, dict: unknown): () => void
      bind(ns: string): (key: string) => string
    }
    /** 宿主注入的槽位注册服务（仅声明本插件用到的 inject/register）。 */
    slots: {
      inject(name: string, register: () => unknown): unknown
      register(spec: unknown, render: unknown): () => void
    }
  }
}
