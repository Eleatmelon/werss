import http from './http'

/**
 * 文章实体接口
 * @property id 文章ID
 * @property title 文章标题
 * @property content 文章内容
 * @property mp_name 公众号名称
 * @property publish_time 发布时间
 * @property status 文章状态
 * @property link 文章链接
 * @property created_at 创建时间
 */
export interface Article {
  id: number
  title: string
  content: string
  mp_name: string
  publish_time: string
  status: number
  link: string
  created_at: string
}

/**
 * 文章列表查询参数接口
 * @property offset 分页偏移量
 * @property limit 每页数量
 * @property search 搜索关键词
 * @property status 文章状态
 * @property mp_id 公众号ID
 */
export interface ArticleListParams {
  offset?: number
  limit?: number
  page?: number
  pageSize?: number
  search?: string
  status?: number | string
  mp_id?: string
  /** 发布时间下界（秒或毫秒，与后端 publish_from 一致） */
  publish_from?: number
  /** 发布时间上界（秒或毫秒） */
  publish_to?: number
  /** YYYY-MM-DD，UTC 日历日起 */
  publish_date_from?: string
  /** YYYY-MM-DD，UTC 日历日止 */
  publish_date_to?: string
  /** 单个标签 ID */
  tag_id?: string
  /** 多个标签 ID，逗号分隔 */
  tag_ids?: string
  /** any=任一标签；all=同时包含全部 */
  tag_match?: 'any' | 'all'
  has_content?: boolean
}

/**
 * 文章列表查询结果接口
 * @property code 状态码
 * @property list 文章列表数据
 * @property total 总数
 */
export interface ArticleListResult {
  code?: number
  list?: Article[]
  total?: number
  data?: Article[]
}

/**
 * 获取文章列表
 * @param params 查询参数
 * @returns 文章列表结果
 */
export const getArticles = (params: ArticleListParams) => {
  // 转换分页参数
  const apiParams: Record<string, unknown> = {
    offset: (params.page || 0) * (params.pageSize || 10),
    limit: params.pageSize || 10,
    search: params.search,
    status: params.status,
    mp_id: params.mp_id,
    publish_from: params.publish_from,
    publish_to: params.publish_to,
    publish_date_from: params.publish_date_from,
    publish_date_to: params.publish_date_to,
    tag_id: params.tag_id,
    tag_ids: params.tag_ids,
    tag_match: params.tag_match,
    has_content: params.has_content
  }
  Object.keys(apiParams).forEach((k) => {
    if (apiParams[k] === undefined || apiParams[k] === '') {
      delete apiParams[k]
    }
  })
  return http.get<ArticleListResult>('/wx/articles', { 
    params: apiParams 
  })
}

/**
 * 获取文章详情
 * @param id 文章ID
 * @parama 类型 0当前,-1上一篇,1下一篇
 * @returns 文章详情结果
 */
export const getArticleDetail = (id: number,action_type:number) => {
  switch(action_type){
    case -1:
      return http.get<{code: number, data: Article}>(`/wx/articles/${id}/prev`)
    case 1:
      return http.get<{code: number, data: Article}>(`/wx/articles/${id}/next`)
    default:
      // 默认获取当前文章详情
      return http.get<{code: number, data: Article}>(`/wx/articles/${id}`)
      break
  }
}

/**
 * 获取上一篇文章详情
 * @param id 当前文章ID
 * @returns 上一篇文章详情结果
 */
export const getPrevArticleDetail = (id: number) => {
  return http.get<{code: number, data: Article}>(`/wx/articles/${id}/prev`)
}

/**
 * 获取下一篇文章详情
 * @param id 当前文章ID
 * @returns 下一篇文章详情结果
 */
export const getNextArticleDetail = (id: number) => {
  return http.get<{code: number, data: Article}>(`/wx/articles/${id}/next`)
}

/**
 * 删除文章
 * @param id 文章ID
 * @returns 删除结果
 */
export const deleteArticle = (id: number) => {
  return http.delete<{code: number, message: string}>(`/wx/articles/${id}`)
}

/**
 * 清空所有文章
 * @param id 无实际作用（保留参数）
 * @returns 清空结果
 */
export const ClearArticle = (id: number) => {
  return http.delete<{code: number, message: string}>(`/wx/articles/clean`)
}

/**
 * 清空重复文章
 * @param id 无实际作用（保留参数）
 * @returns 清空结果
 */
export const ClearDuplicateArticle = (id: number) => {
  return http.delete<{code: number, message: string}>(`/wx/articles/clean_duplicate_articles`)
}

/**
 * 重新获取文章内容
 * @param id 文章ID
 * @returns 获取结果
 */
export const fetchArticleContent = (id: number | string) => {
  return http.post<{code: number, message: string, data?: {content_length: number}}>(`/wx/articles/${id}/fetch_content`)
}

/**
 * 更新文章请求参数接口
 */
export interface UpdateArticleParams {
  title?: string
  description?: string
  url?: string
  pic_url?: string
}

/**
 * 更新文章
 * @param id 文章ID
 * @param params 更新参数
 * @returns 更新结果
 */
export const updateArticle = (id: number | string, params: UpdateArticleParams) => {
  return http.put<{code: number, message: string}>(`/wx/articles/${id}`, params)
}

