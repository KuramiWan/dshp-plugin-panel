/**
 * 插件面板 client 侧 HTTP 客户端（发布方案一：DSH webServer 路由 + 相对路径 fetch）。
 * 替代旧 typert Remote 网关：
 * - host 返回裸业务 JSON（无 { ok, value } RPC 信封），故不再需要 valueOf 解包；
 * - 端点 POST /plugin-panel/<method>，body 为 JSON 载荷，响应为 JSON；
 * - 用相对路径 fetch（'/plugin-panel/<method>'），不硬编码 host/port，本地与反代均可工作。
 *
 * 错误语义与 host 统一：
 * - 业务失败：host 以 200 返回 { ok:false, reason }，本客户端原样透传；
 * - 传输/HTTP 失败（缺会话 400、网络等）：本客户端对 detail/introduce/removeSkill
 *   fold 成 { ok:false, reason }，对 browse/list 抛出（由调用方 .catch 转错误态）。
 */
import type {
  PluginPanelBrowseRequest,
  PluginPanelBrowseResult,
  PluginPanelListRequest,
  PluginPanelListResult,
  PluginPanelDetailRequest,
  PluginPanelDetailResult,
  PluginPanelIntroduceRequest,
  PluginPanelIntroduceResult,
  PluginPanelRemoveRequest,
  PluginPanelRemoveResult,
  PluginPanelSetTagsRequest,
  PluginPanelSetTagsResult,
  PluginPanelGlobalListRequest,
  PluginPanelGlobalListResult,
  PluginPanelGlobalActivateRequest,
  PluginPanelGlobalActivateResult,
  PluginPanelMcpListRequest,
  PluginPanelMcpListResult,
  PluginPanelMcpConnectRequest,
  PluginPanelMcpConnectResult,
  PluginPanelMcpDisconnectRequest,
  PluginPanelMcpDisconnectResult,
  PluginPanelMcpWhitelistRequest,
  PluginPanelMcpWhitelistResult,
  PluginPanelMcpUpsertRequest,
  PluginPanelMcpUpsertResult,
  PluginPanelMcpRemoveRequest,
  PluginPanelMcpRemoveResult,
  PluginPanelMcpDiscoverRequest,
  PluginPanelMcpDiscoverResult,
  PluginPanelMcpSelectRequest,
  PluginPanelMcpSelectResult,
  PluginPanelMcpCheckRequest,
  PluginPanelMcpCheckResult,
  PluginPanelPluginListRequest,
  PluginPanelPluginListResult,
  PluginPanelPluginToggleRequest,
  PluginPanelPluginToggleResult,
  PluginPanelPluginInstallRequest,
  PluginPanelPluginInstallResult,
  PluginPanelPluginPromoteRequest,
  PluginPanelPluginPromoteResult,
  PluginPanelPluginDemoteRequest,
  PluginPanelPluginDemoteResult,
} from '../types.ts'

/**
 * 面板 client 数据访问面。与旧 PluginPanelRemote 同签名的心智模型：
 * 各方法返回 Promise<业务结果>，失败依方法语义返回 { ok:false, reason } 或抛出。
 */
export interface PluginPanelClient {
  browse(request: PluginPanelBrowseRequest): Promise<PluginPanelBrowseResult>
  list(request: PluginPanelListRequest): Promise<PluginPanelListResult>
  detail(request: PluginPanelDetailRequest): Promise<PluginPanelDetailResult>
  introduce(request: PluginPanelIntroduceRequest): Promise<PluginPanelIntroduceResult>
  removeSkill(request: PluginPanelRemoveRequest): Promise<PluginPanelRemoveResult>
  setTags(request: PluginPanelSetTagsRequest): Promise<PluginPanelSetTagsResult>
  globalList(request: PluginPanelGlobalListRequest): Promise<PluginPanelGlobalListResult>
  globalActivate(request: PluginPanelGlobalActivateRequest): Promise<PluginPanelGlobalActivateResult>
  globalDeactivate(request: PluginPanelGlobalActivateRequest): Promise<PluginPanelGlobalActivateResult>
  mcpList(request: PluginPanelMcpListRequest): Promise<PluginPanelMcpListResult>
  mcpConnect(request: PluginPanelMcpConnectRequest): Promise<PluginPanelMcpConnectResult>
  mcpDisconnect(request: PluginPanelMcpDisconnectRequest): Promise<PluginPanelMcpDisconnectResult>
  mcpWhitelist(request: PluginPanelMcpWhitelistRequest): Promise<PluginPanelMcpWhitelistResult>
  mcpUpsert(request: PluginPanelMcpUpsertRequest): Promise<PluginPanelMcpUpsertResult>
  mcpRemove(request: PluginPanelMcpRemoveRequest): Promise<PluginPanelMcpRemoveResult>
  mcpDiscover(request: PluginPanelMcpDiscoverRequest): Promise<PluginPanelMcpDiscoverResult>
  mcpSelect(request: PluginPanelMcpSelectRequest): Promise<PluginPanelMcpSelectResult>
  mcpCheck(request: PluginPanelMcpCheckRequest): Promise<PluginPanelMcpCheckResult>
  pluginList(request: PluginPanelPluginListRequest): Promise<PluginPanelPluginListResult>
  pluginToggle(request: PluginPanelPluginToggleRequest): Promise<PluginPanelPluginToggleResult>
  pluginInstall(request: PluginPanelPluginInstallRequest): Promise<PluginPanelPluginInstallResult>
  pluginPromote(request: PluginPanelPluginPromoteRequest): Promise<PluginPanelPluginPromoteResult>
  pluginDemote(request: PluginPanelPluginDemoteRequest): Promise<PluginPanelPluginDemoteResult>
}

/** POST 一个面板方法；HTTP 非 2xx 时抛出（优先取 body 的 reason）。 */
async function post(method: string, body: unknown): Promise<unknown> {
  const response = await fetch(`/plugin-panel/${method}`, {
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
export function createPluginPanelClient(): PluginPanelClient {
  return {
    browse: request => post('browse', request) as Promise<PluginPanelBrowseResult>,
    list: request => post('list', request) as Promise<PluginPanelListResult>,
    detail: async (request) => {
      try {
        return (await post('detail', request)) as PluginPanelDetailResult
      } catch (error) {
        return foldFail<PluginPanelDetailResult>(error)
      }
    },
    introduce: async (request) => {
      try {
        return (await post('introduce', request)) as PluginPanelIntroduceResult
      } catch (error) {
        return foldFail<PluginPanelIntroduceResult>(error)
      }
    },
    removeSkill: async (request) => {
      try {
        return (await post('removeSkill', request)) as PluginPanelRemoveResult
      } catch (error) {
        return foldFail<PluginPanelRemoveResult>(error)
      }
    },
    setTags: async (request) => {
      try {
        return (await post('setTags', request)) as PluginPanelSetTagsResult
      } catch (error) {
        return foldFail<PluginPanelSetTagsResult>(error)
      }
    },
    globalList: request => post('globalList', request) as Promise<PluginPanelGlobalListResult>,
    globalActivate: async (request) => {
      try {
        return (await post('globalActivate', request)) as PluginPanelGlobalActivateResult
      } catch (error) {
        return foldFail<PluginPanelGlobalActivateResult>(error)
      }
    },
    globalDeactivate: async (request) => {
      try {
        return (await post('globalDeactivate', request)) as PluginPanelGlobalActivateResult
      } catch (error) {
        return foldFail<PluginPanelGlobalActivateResult>(error)
      }
    },
    mcpList: request => post('mcpList', request) as Promise<PluginPanelMcpListResult>,
    mcpConnect: async (request) => {
      try {
        return (await post('mcpConnect', request)) as PluginPanelMcpConnectResult
      } catch (error) {
        return foldFail<PluginPanelMcpConnectResult>(error)
      }
    },
    mcpDisconnect: async (request) => {
      try {
        return (await post('mcpDisconnect', request)) as PluginPanelMcpDisconnectResult
      } catch (error) {
        return foldFail<PluginPanelMcpDisconnectResult>(error)
      }
    },
    mcpWhitelist: request => post('mcpWhitelist', request) as Promise<PluginPanelMcpWhitelistResult>,
    mcpUpsert: async (request) => {
      try {
        return (await post('mcpUpsert', request)) as PluginPanelMcpUpsertResult
      } catch (error) {
        return foldFail<PluginPanelMcpUpsertResult>(error)
      }
    },
    mcpRemove: async (request) => {
      try {
        return (await post('mcpRemove', request)) as PluginPanelMcpRemoveResult
      } catch (error) {
        return foldFail<PluginPanelMcpRemoveResult>(error)
      }
    },
    mcpDiscover: request => post('mcpDiscover', request) as Promise<PluginPanelMcpDiscoverResult>,
    mcpSelect: async (request) => {
      try {
        return (await post('mcpSelect', request)) as PluginPanelMcpSelectResult
      } catch (error) {
        return foldFail<PluginPanelMcpSelectResult>(error)
      }
    },
    mcpCheck: async (request) => {
      try {
        return (await post('mcpCheck', request)) as PluginPanelMcpCheckResult
      } catch (error) {
        return foldFail<PluginPanelMcpCheckResult>(error)
      }
    },
    pluginList: request => post('pluginList', request) as Promise<PluginPanelPluginListResult>,
    pluginToggle: async (request) => {
      try {
        return (await post('pluginToggle', request)) as PluginPanelPluginToggleResult
      } catch (error) {
        return foldFail<PluginPanelPluginToggleResult>(error)
      }
    },
    pluginInstall: async (request) => {
      try {
        return (await post('pluginInstall', request)) as PluginPanelPluginInstallResult
      } catch (error) {
        return foldFail<PluginPanelPluginInstallResult>(error)
      }
    },
    pluginPromote: async (request) => {
      try {
        return (await post('pluginPromote', request)) as PluginPanelPluginPromoteResult
      } catch (error) {
        return foldFail<PluginPanelPluginPromoteResult>(error)
      }
    },
    pluginDemote: async (request) => {
      try {
        return (await post('pluginDemote', request)) as PluginPanelPluginDemoteResult
      } catch (error) {
        return foldFail<PluginPanelPluginDemoteResult>(error)
      }
    },
  }
}
