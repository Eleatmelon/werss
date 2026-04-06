import http from './http'

export interface Subscription {
  id: string
  mp_id: string
  name: string
  mp_name: string
  mp_cover: string
  mp_intro: string
  status: number
  sync_time: string | number
  rss_url: string
  rss_limit?: number | null
  article_count: number
  min_publish_time?: number | null
  max_publish_time?: number | null
}

export interface SubscriptionListResult {
  code?: number
  list?: Subscription[]
  total?: number
  data?: {
    list: Subscription[]
    total: number
  }
}

export interface AddSubscriptionParams {
  mp_name: string
  mp_id: string
  avatar: string
  mp_intro?: string
  rss_limit?: number
}

export interface MpItem {
  mp_id: string
  mp_name: string
  avatar: string
}

export interface MpSearchResult {
  code: number
  data: MpItem[]
}

export const getSubscriptions = (params?: { page?: number; pageSize?: number; kw?: string }) => {
  const apiParams = {
    offset: (params?.page || 0) * (params?.pageSize || 10),
    limit: params?.pageSize || 10,
    kw: params?.kw || ""
  }
  return http.get<SubscriptionListResult>('/wx/mps', { params: apiParams })
}

export const getSubscriptionDetail = (mp_id: string) => {
  return http.get<{code: number, data: Subscription}>(`/wx/mps/${mp_id}`)
}

// 添加订阅公众号信息
export const addSubscription = (data: AddSubscriptionParams) => {
  return http.post<{code: number, message: string}>('/wx/mps', data)
}
export const getSubscriptionInfo = (url: string) => {
  return http.post<{code: number, message: string}>(`/wx/mps/by_article?url=${url}`)
}

export const deleteMpApi = (mp_id: string) => {
  return http.delete<{code: number, message: string}>(`/wx/mps/${mp_id}`)
}

export const deleteSubscription = (mp_id: string) => {
  return http.delete<{code: number, message: string}>(`/wx/mps/${mp_id}`)
}

// 更新订阅公众号文章列表
export const UpdateMps = (mp_id: string, params?: { start_page?: number; end_page?: number; ignore_existing_limit?: boolean }) => {
  const target = `/wx/mps/update/${mp_id || 'all'}`
  if (params?.start_page === undefined && params?.end_page === undefined) {
    return http.get<{code: number, message: string}>(target)
  }

  const startPage = Math.max(1, params?.start_page || 1)
  const endPage = Math.max(startPage, params?.end_page || 1)

  return http.get<{code: number, message: string}>(target, {
    params: {
      start_page: startPage - 1,
      end_page: endPage,
      ignore_existing_limit: params?.ignore_existing_limit === true
    }
  })
}

// 更新订阅公众号信息
export const updateSubscription = (mp_id: string, data: Partial<Subscription>) => {
  return http.put<{code: number, message: string}>(`/wx/mps/${mp_id}`, data)
}

export const searchBiz = (kw: string, params: { page?: number; pageSize?: number }) => {
  const apiParams = {
    offset: (params?.page || 0) * (params?.pageSize || 10),
    limit: params?.pageSize || 10
  }
  return http.get<SubscriptionListResult>(`/wx/mps/search/${kw}`,{ params: apiParams })
}

// 搜索公众号(不分页)
export const searchMps = (kw: string, params: { page?: number; pageSize?: number }) => {
  const apiParams = {
    kw:kw||"",
    offset: (params?.page || 0) * (params?.pageSize || 10),
    limit: params?.pageSize || 10
  }
  return http.get<SubscriptionListResult>(`/wx/mps`,{ params: apiParams })
}
