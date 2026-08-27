/**
 * 技能面板 client 侧 HTTP 客户端（发布方案一：DSH webServer 路由 + 相对路径 fetch）。
 * 替代旧 typert Remote 网关：
 * - host 返回裸业务 JSON（无 { ok, value } RPC 信封），故不再需要 valueOf 解包；
 * - 端点 POST /skill-panel/<method>，body 为 JSON 载荷，响应为 JSON；
 * - 用相对路径 fetch（'/skill-panel/<method>'），不硬编码 host/port，本地与反代均可工作。
 *
 * 错误语义与 host 统一：
 * - 业务失败：host 以 200 返回 { ok:false, reason }，本客户端原样透传；
 * - 传输/HTTP 失败（缺会话 400、网络等）：本客户端对 detail/introduce/removeSkill
 *   fold 成 { ok:false, reason }，对 browse/list 抛出（由调用方 .catch 转错误态）。
 */
import type {
  SkillPanelBrowseRequest,
  SkillPanelBrowseResult,
  SkillPanelListRequest,
  SkillPanelListResult,
  SkillPanelDetailRequest,
  SkillPanelDetailResult,
  SkillPanelIntroduceRequest,
  SkillPanelIntroduceResult,
  SkillPanelRemoveRequest,
  SkillPanelRemoveResult,
  SkillPanelSetTagsRequest,
  SkillPanelSetTagsResult,
  SkillPanelGlobalListRequest,
  SkillPanelGlobalListResult,
  SkillPanelGlobalActivateRequest,
  SkillPanelGlobalActivateResult,
  SkillPanelMcpListRequest,
  SkillPanelMcpListResult,
  SkillPanelMcpConnectRequest,
  SkillPanelMcpConnectResult,
  SkillPanelMcpDisconnectRequest,
  SkillPanelMcpDisconnectResult,
  SkillPanelMcpWhitelistRequest,
  SkillPanelMcpWhitelistResult,
  SkillPanelMcpUpsertRequest,
  SkillPanelMcpUpsertResult,
  SkillPanelMcpRemoveRequest,
  SkillPanelMcpRemoveResult,
  SkillPanelMcpDiscoverRequest,
  SkillPanelMcpDiscoverResult,
  SkillPanelMcpSelectRequest,
  SkillPanelMcpSelectResult,
  SkillPanelMcpCheckRequest,
  SkillPanelMcpCheckResult,
  SkillPanelPluginListRequest,
  SkillPanelPluginListResult,
  SkillPanelPluginToggleRequest,
  SkillPanelPluginToggleResult,
  SkillPanelPluginInstallRequest,
  SkillPanelPluginInstallResult,
  SkillPanelPluginPromoteRequest,
  SkillPanelPluginPromoteResult,
  SkillPanelPluginDemoteRequest,
  SkillPanelPluginDemoteResult,
} from '../types.ts'

/**
 * 面板 client 数据访问面。与旧 SkillPanelRemote 同签名的心智模型：
 * 各方法返回 Promise<业务结果>，失败依方法语义返回 { ok:false, reason } 或抛出。
 */
export interface SkillPanelClient {
  browse(request: SkillPanelBrowseRequest): Promise<SkillPanelBrowseResult>
  list(request: SkillPanelListRequest): Promise<SkillPanelListResult>
  detail(request: SkillPanelDetailRequest): Promise<SkillPanelDetailResult>
  introduce(request: SkillPanelIntroduceRequest): Promise<SkillPanelIntroduceResult>
  removeSkill(request: SkillPanelRemoveRequest): Promise<SkillPanelRemoveResult>
  setTags(request: SkillPanelSetTagsRequest): Promise<SkillPanelSetTagsResult>
  globalList(request: SkillPanelGlobalListRequest): Promise<SkillPanelGlobalListResult>
  globalActivate(request: SkillPanelGlobalActivateRequest): Promise<SkillPanelGlobalActivateResult>
  globalDeactivate(request: SkillPanelGlobalActivateRequest): Promise<SkillPanelGlobalActivateResult>
  mcpList(request: SkillPanelMcpListRequest): Promise<SkillPanelMcpListResult>
  mcpConnect(request: SkillPanelMcpConnectRequest): Promise<SkillPanelMcpConnectResult>
  mcpDisconnect(request: SkillPanelMcpDisconnectRequest): Promise<SkillPanelMcpDisconnectResult>
  mcpWhitelist(request: SkillPanelMcpWhitelistRequest): Promise<SkillPanelMcpWhitelistResult>
  mcpUpsert(request: SkillPanelMcpUpsertRequest): Promise<SkillPanelMcpUpsertResult>
  mcpRemove(request: SkillPanelMcpRemoveRequest): Promise<SkillPanelMcpRemoveResult>
  mcpDiscover(request: SkillPanelMcpDiscoverRequest): Promise<SkillPanelMcpDiscoverResult>
  mcpSelect(request: SkillPanelMcpSelectRequest): Promise<SkillPanelMcpSelectResult>
  mcpCheck(request: SkillPanelMcpCheckRequest): Promise<SkillPanelMcpCheckResult>
  pluginList(request: SkillPanelPluginListRequest): Promise<SkillPanelPluginListResult>
  pluginToggle(request: SkillPanelPluginToggleRequest): Promise<SkillPanelPluginToggleResult>
  pluginInstall(request: SkillPanelPluginInstallRequest): Promise<SkillPanelPluginInstallResult>
  pluginPromote(request: SkillPanelPluginPromoteRequest): Promise<SkillPanelPluginPromoteResult>
  pluginDemote(request: SkillPanelPluginDemoteRequest): Promise<SkillPanelPluginDemoteResult>
}

/** POST 一个面板方法；HTTP 非 2xx 时抛出（优先取 body 的 reason）。 */
async function post(method: string, body: unknown): Promise<unknown> {
  const response = await fetch(`/skill-panel/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data: unknown
  try {
    data = await response.json()
  } catch {
    data = undefined
  }
  if (!response.ok) {
    const reason = (data as { reason?: string } | undefined)?.reason ?? `HTTP ${response.status}`
    throw new Error(reason)
  }
  return data
}

/** 把传输层异常 fold 成统一业务失败形状。 */
function foldFail<T>(error: unknown): T {
  return { ok: false, reason: error instanceof Error ? error.message : String(error) } as T
}

/** 创建 HTTP 客户端：实例化后无需等待 remote 就绪，可直接调用。 */
export function createSkillPanelClient(): SkillPanelClient {
  return {
    browse: request => post('browse', request) as Promise<SkillPanelBrowseResult>,
    list: request => post('list', request) as Promise<SkillPanelListResult>,
    detail: async (request) => {
      try {
        return (await post('detail', request)) as SkillPanelDetailResult
      } catch (error) {
        return foldFail<SkillPanelDetailResult>(error)
      }
    },
    introduce: async (request) => {
      try {
        return (await post('introduce', request)) as SkillPanelIntroduceResult
      } catch (error) {
        return foldFail<SkillPanelIntroduceResult>(error)
      }
    },
    removeSkill: async (request) => {
      try {
        return (await post('removeSkill', request)) as SkillPanelRemoveResult
      } catch (error) {
        return foldFail<SkillPanelRemoveResult>(error)
      }
    },
    setTags: async (request) => {
      try {
        return (await post('setTags', request)) as SkillPanelSetTagsResult
      } catch (error) {
        return foldFail<SkillPanelSetTagsResult>(error)
      }
    },
    globalList: request => post('globalList', request) as Promise<SkillPanelGlobalListResult>,
    globalActivate: async (request) => {
      try {
        return (await post('globalActivate', request)) as SkillPanelGlobalActivateResult
      } catch (error) {
        return foldFail<SkillPanelGlobalActivateResult>(error)
      }
    },
    globalDeactivate: async (request) => {
      try {
        return (await post('globalDeactivate', request)) as SkillPanelGlobalActivateResult
      } catch (error) {
        return foldFail<SkillPanelGlobalActivateResult>(error)
      }
    },
    mcpList: request => post('mcpList', request) as Promise<SkillPanelMcpListResult>,
    mcpConnect: async (request) => {
      try {
        return (await post('mcpConnect', request)) as SkillPanelMcpConnectResult
      } catch (error) {
        return foldFail<SkillPanelMcpConnectResult>(error)
      }
    },
    mcpDisconnect: async (request) => {
      try {
        return (await post('mcpDisconnect', request)) as SkillPanelMcpDisconnectResult
      } catch (error) {
        return foldFail<SkillPanelMcpDisconnectResult>(error)
      }
    },
    mcpWhitelist: request => post('mcpWhitelist', request) as Promise<SkillPanelMcpWhitelistResult>,
    mcpUpsert: async (request) => {
      try {
        return (await post('mcpUpsert', request)) as SkillPanelMcpUpsertResult
      } catch (error) {
        return foldFail<SkillPanelMcpUpsertResult>(error)
      }
    },
    mcpRemove: async (request) => {
      try {
        return (await post('mcpRemove', request)) as SkillPanelMcpRemoveResult
      } catch (error) {
        return foldFail<SkillPanelMcpRemoveResult>(error)
      }
    },
    mcpDiscover: request => post('mcpDiscover', request) as Promise<SkillPanelMcpDiscoverResult>,
    mcpSelect: async (request) => {
      try {
        return (await post('mcpSelect', request)) as SkillPanelMcpSelectResult
      } catch (error) {
        return foldFail<SkillPanelMcpSelectResult>(error)
      }
    },
    mcpCheck: async (request) => {
      try {
        return (await post('mcpCheck', request)) as SkillPanelMcpCheckResult
      } catch (error) {
        return foldFail<SkillPanelMcpCheckResult>(error)
      }
    },
    pluginList: request => post('pluginList', request) as Promise<SkillPanelPluginListResult>,
    pluginToggle: async (request) => {
      try {
        return (await post('pluginToggle', request)) as SkillPanelPluginToggleResult
      } catch (error) {
        return foldFail<SkillPanelPluginToggleResult>(error)
      }
    },
    pluginInstall: async (request) => {
      try {
        return (await post('pluginInstall', request)) as SkillPanelPluginInstallResult
      } catch (error) {
        return foldFail<SkillPanelPluginInstallResult>(error)
      }
    },
    pluginPromote: async (request) => {
      try {
        return (await post('pluginPromote', request)) as SkillPanelPluginPromoteResult
      } catch (error) {
        return foldFail<SkillPanelPluginPromoteResult>(error)
      }
    },
    pluginDemote: async (request) => {
      try {
        return (await post('pluginDemote', request)) as SkillPanelPluginDemoteResult
      } catch (error) {
        return foldFail<SkillPanelPluginDemoteResult>(error)
      }
    },
  }
}
