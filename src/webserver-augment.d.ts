/**
 * Host 侧类型补丁：让 tsc 认识 `ctx.webServer`。
 *
 * 运行时 `webServer` 由 `@deepseek-ai/dsh-host-webserver`（组合里挂载的服务）提供，
 * 本插件通过 `SkillPanelService.inject = [..., 'webServer']` 等它就绪后使用。
 * 该包自带 `declare module '@deepseek-ai/cordis'` 的 Context 增强，但只有该模块被
 * 编进编译单元时增强才生效；本项目未直接依赖它，故这里显式引用其类型以加载增强。
 * 仅类型引用，不会产生运行时 import。
 */
import type WebServer from '@deepseek-ai/dsh-host-webserver'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServer
  }
}

export {}
