import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Message } from '@/utils/message'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, ChevronDown, Download, Upload, Share2, RefreshCw, Trash2, Eye, Wifi, Copy, Search, Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Avatar } from '@/utils/constants'
import { formatDateTime, formatTimestamp } from '@/utils/date'
import { getArticles, deleteArticle as deleteArticleApi, ClearArticle, ClearDuplicateArticle, getArticleDetail, ArticleListResult } from '@/api/article'
import { ExportOPML, ExportMPS, ImportMPS } from '@/api/export'
import { getSubscriptions, UpdateMps, deleteMpApi, SubscriptionListResult } from '@/api/subscription'
import ExportModal from '@/components/ExportModal'
import TextIcon from '@/components/TextIcon'

interface Article {
  id: number
  title: string
  content: string
  mp_name: string
  mp_id: string
  publish_time: string | number
  created_at: string
  url: string
  status: string
  tags?: any[]
  topics?: any[]
  tag_names?: string[]
  topic_names?: string[]
}

interface MpItem {
  id: string
  name: string
  mp_name: string
  avatar: string
  mp_cover: string
  mp_intro: string
  article_count: number
}

const ArticleListDesktop: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const exportModalRef = useRef<any>(null)
  const [fullLoading, setFullLoading] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [mpList, setMpList] = useState<MpItem[]>([])
  const [mpLoading, setMpLoading] = useState(false)
  const [activeMpId, setActiveMpId] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
  const [mpPagination, setMpPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [searchText, setSearchText] = useState('')
  const [mpSearchText, setMpSearchText] = useState('')
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [activeFeed, setActiveFeed] = useState<MpItem>({
    id: '',
    name: '全部',
    mp_name: '全部',
    avatar: '',
    mp_cover: '',
    mp_intro: '',
    article_count: 0
  })
  const [refreshModalVisible, setRefreshModalVisible] = useState(false)
  const [articleModalVisible, setArticleModalVisible] = useState(false)
  const [currentArticle, setCurrentArticle] = useState({
    id: '',
    title: '',
    content: '',
    time: '',
    url: ''
  })
  const [rssFormat, setRssFormat] = useState('atom')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)

  const refreshForm = useForm({
    defaultValues: {
      startPage: 1,
      endPage: 1
    }
  })

  const columns = [
    {
      title: '文章标题',
      dataIndex: 'title',
      width: window.innerWidth - 1000,
      ellipsis: true,
      render: (_: any, record: Article) => (
        <a href={record.url || '#'} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
          {record.title}
        </a>
      )
    },
    {
      title: '公众号',
      dataIndex: 'mp_id',
      width: 120,
      ellipsis: true,
      render: (_: any, record: Article) => {
        const mp = mpList.find(item => item.id === record.mp_id)
        return <span className="text-muted-foreground text-xs">{record.mp_name || mp?.name || record.mp_id}</span>
      }
    },
    {
      title: '更新时间',
      dataIndex: 'created_at',
      width: 140,
      render: (_: any, record: Article) => (
        <span className="text-muted-foreground text-xs">
          {formatDateTime(record.created_at)}
        </span>
      )
    },
    {
      title: '发布时间',
      dataIndex: 'publish_time',
      width: 140,
      render: (_: any, record: Article) => (
        <span className="text-muted-foreground text-xs">
          {formatTimestamp(record.publish_time as number)}
        </span>
      )
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 150,
      ellipsis: true,
      render: (_: any, record: Article) => {
        const tags = record.tags || record.topics || record.tag_names || record.topic_names || []
        if (!tags || tags.length === 0) {
          return <span className="text-muted-foreground text-xs">-</span>
        }
        const tagNames = Array.isArray(tags) && tags[0]?.name ? tags.map((t: any) => t.name) : tags
        return (
          <div className="flex flex-wrap gap-1">
            {tagNames.slice(0, 5).map((name: string, idx: number) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {name}
              </Badge>
            ))}
            {tagNames.length > 5 && (
              <Badge variant="outline" className="text-xs">+{tagNames.length - 5}</Badge>
            )}
          </div>
        )
      }
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 120,
      render: (_: any, record: Article) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => viewArticle(record)} title={record.id.toString()}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => {
            setDeleteTargetId(record.id)
            setDeleteDialogOpen(true)
          }}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )
    }
  ]

  useEffect(() => {
    fetchMpList().then(() => {
      fetchArticles()
    })
  }, [])

  const fetchMpList = async () => {
    setMpLoading(true)
    try {
      const res = await getSubscriptions({
        page: mpPagination.current - 1,
        pageSize: mpPagination.pageSize,
        kw: mpSearchText
      }) as unknown as SubscriptionListResult

      const list = ((res as any).list || (res as any).data?.list || []).map((item: any) => ({
        id: item.id || item.mp_id,
        name: item.name || item.mp_name,
        avatar: item.avatar || item.mp_cover || '',
        mp_intro: item.mp_intro || '',
        article_count: item.article_count || 0
      }))

      if (!mpSearchText) {
        list.unshift({
          id: '',
          name: '全部',
          mp_name: '全部',
          avatar: import.meta.env ? '/logo.svg' : '/static/logo.svg',
          mp_intro: '显示所有公众号文章',
          article_count: res.total || res.data?.total || 0
        })
      }

      setMpList(list)
      setMpPagination(prev => ({ ...prev, total: res.total || res.data?.total || 0 }))
    } catch (error) {
      console.error('获取公众号列表错误:', error)
    } finally {
      setMpLoading(false)
    }
  }

  const fetchArticles = async () => {
    setLoading(true)
    try {
      const res = await getArticles({
        page: pagination.current - 1,
        pageSize: pagination.pageSize,
        search: searchText,
        mp_id: activeMpId
      }) as unknown as ArticleListResult

      const list = (res.list || res.data || []).map((item: any) => ({
        ...item,
        mp_name: item.mp_name || item.account_name || '未知公众号',
        publish_time: item.publish_time || item.create_time || '-',
        url: item.url || `https://mp.weixin.qq.com/s/${item.id}`
      }))

      setArticles(list)
      setPagination(prev => ({ ...prev, total: res.total || 0 }))
    } catch (error: any) {
      console.error('获取文章列表错误:', error)
      Message.error(error?.message || t('articles.messages.fetchFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchArticles()
  }, [pagination.current, pagination.pageSize, activeMpId, searchText])

  const handleMpClick = (mpId: string) => {
    setActiveMpId(mpId)
    setPagination(prev => ({ ...prev, current: 1 }))
    const feed = mpList.find(item => item.id === mpId)
    if (feed) {
      setActiveFeed(feed)
    }
  }

  const handleMpSearch = () => {
    setMpPagination(prev => ({ ...prev, current: 1 }))
    fetchMpList()
  }

  const handleMpPageChange = (page: number, pageSize: number) => {
    setMpPagination(prev => ({ ...prev, current: page, pageSize }))
    fetchMpList()
  }

  const handlePageChange = (page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, current: page, pageSize }))
  }

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }))
    fetchArticles()
  }

  const processedContent = (record: any) => {
    return (record.content || '')
      .replace(/<img([^>]*)width=["'][^"']*["']([^>]*)>/g, '<img$1$2>')
  }

  const viewArticle = async (record: Article, action_type: number = 0) => {
    setLoading(true)
    try {
      const article = await getArticleDetail(record.id, action_type)
      const data = (article as any).data || article
      setCurrentArticle({
        id: data.id.toString(),
        title: data.title,
        content: processedContent(data),
        time: formatDateTime(data.created_at),
        url: data.url
      })
      setArticleModalVisible(true)
      window.location.hash = '#topreader'
    } catch (error: any) {
      console.error('获取文章详情错误:', error)
      Message.error(error?.message || t('articles.messages.fetchDetailFailed'))
    } finally {
      setLoading(false)
    }
  }

  const deleteArticle = async (id: number) => {
    try {
      await deleteArticleApi(id)
      Message.success(t('articles.messages.deleteSuccess'))
      fetchArticles()
    } catch (error: any) {
      Message.error(error?.message || '删除失败')
    }
  }

  const handleBatchDelete = async () => {
    try {
      await Promise.all(selectedRowKeys.map(id => deleteArticleApi(id)))
      Message.success(t('articles.messages.batchDeleteSuccess', { count: selectedRowKeys.length }))
      setSelectedRowKeys([])
      fetchArticles()
    } catch (error) {
      Message.error(t('articles.messages.batchDeleteFailed'))
    }
  }

  const handleExportShow = () => {
    const mp_id = activeFeed?.id || ''
    // 将数字 ID 转换为字符串，因为数据库中的 ID 是字符串类型
    const ids = (selectedRowKeys || []).map(id => String(id))
    const mp_name = activeFeed?.name || activeFeed?.mp_name || '全部'
    exportModalRef.current?.show(mp_id, ids, mp_name)
  }

  const exportOPML = async () => {
    try {
      const response = await ExportOPML() as unknown as string
      const blob = new Blob([response], { type: 'application/xml' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'rss_feed.opml'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('导出OPML失败:', error)
      Message.error(error?.message || t('articles.messages.exportOpmlFailed'))
    }
  }

  const exportMPS = async () => {
    try {
      const res = await ExportMPS()
      const data = (res as any).data ?? res
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '公众号列表.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      Message.error(error?.message || t('articles.messages.exportMpFailed'))
    }
  }

  const importMPS = async () => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.csv'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        const response = await ImportMPS(formData) as unknown as { code: number; message?: string }
        Message.info(response?.message || t('articles.messages.importSuccess'))
        fetchMpList()
      }
      input.click()
    } catch (error: any) {
      Message.error(error?.message || t('articles.messages.importFailed'))
    }
  }

  const openRssFeed = () => {
    const format = ['rss', 'atom', 'json', 'md', 'txt'].includes(rssFormat) ? rssFormat : 'atom'
    let search = ''
    if (searchText) {
      search = `/search/${searchText}`
    }
    if (!activeMpId) {
      window.open(`/feed${search}/all.${format}`, '_blank')
      return
    }
    window.open(`/feed${search}/${activeMpId}.${format}`, '_blank')
  }

  const refresh = () => {
    setRefreshModalVisible(true)
  }

  const handleRefresh = async () => {
    try {
      const values = refreshForm.getValues()
      if (values.endPage < values.startPage) {
        Message.warning('结束页不能小于起始页')
        return
      }
      setFullLoading(true)
      await UpdateMps(activeMpId, {
        start_page: values.startPage,
        end_page: values.endPage
      })
      Message.success(t('articles.messages.refreshSuccess'))
      setRefreshModalVisible(false)
      fetchArticles()
    } catch (error: any) {
      console.error('刷新失败:', error)
      // 显示错误消息
      const errorMsg = error?.message || error?.response?.data?.message || '刷新失败'
      Message.error(errorMsg)
    } finally {
      setFullLoading(false)
    }
  }

  const clear_articles = async () => {
    setFullLoading(true)
    try {
      const res = await ClearArticle(0) as unknown as { code: number; message?: string }
      Message.success(res?.message || t('articles.messages.clearSuccess'))
      fetchArticles()
    } finally {
      setFullLoading(false)
    }
  }

  const clear_duplicate_article = async () => {
    setFullLoading(true)
    try {
      const res = await ClearDuplicateArticle(0) as unknown as { code: number; message?: string }
      Message.success(res?.message || t('articles.messages.clearSuccess'))
      fetchArticles()
    } finally {
      setFullLoading(false)
    }
  }

  const copyMpId = async (mpId: string) => {
    try {
      await navigator.clipboard.writeText(mpId)
      Message.success(t('articles.messages.copySuccess'))
    } catch (error) {
      const textArea = document.createElement('textarea')
      textArea.value = mpId
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      textArea.style.top = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        Message.success(t('articles.messages.copySuccess'))
      } catch (err) {
        Message.error(t('articles.messages.copyFailed'))
      }
      document.body.removeChild(textArea)
    }
  }

  const deleteMp = async (mpId: string) => {
    try {
      await deleteMpApi(mpId)
      Message.success(t('articles.messages.deleteMpSuccess'))
      fetchMpList()
    } catch (error: any) {
      Message.error(error?.message || '删除失败')
    }
  }

  const renderPagination = (current: number, pageSize: number, total: number, onChange: (page: number, pageSize: number) => void) => {
    const totalPages = Math.ceil(total / pageSize)
    const handleJump = (rawValue: string) => {
      const targetPage = parseInt(rawValue, 10)
      if (Number.isNaN(targetPage)) {
        return
      }
      onChange(Math.min(totalPages, Math.max(1, targetPage)), pageSize)
    }

    return (
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-muted-foreground">
          共 {total} 条，第 {current} / {totalPages} 页
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(1, pageSize)}
            disabled={current === 1}
          >
            首页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(Math.max(1, current - 1), pageSize)}
            disabled={current === 1}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(Math.min(totalPages, current + 1), pageSize)}
            disabled={current >= totalPages}
          >
            下一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(totalPages, pageSize)}
            disabled={current >= totalPages}
          >
            末页
          </Button>
          <Input
            key={`${current}-${totalPages}`}
            type="number"
            min={1}
            max={totalPages}
            defaultValue={current}
            className="w-20 h-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleJump((e.target as HTMLInputElement).value)
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              const input = (e.currentTarget.previousElementSibling as HTMLInputElement | null)
              if (input) {
                handleJump(input.value)
              }
            }}
          >
            跳转
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {fullLoading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在刷新...</p>
          </div>
        </div>
      )}
      <div className="flex h-[calc(100vh-64px)]">
        {/* 左侧边栏 */}
        <div className="w-[300px] border-r bg-background flex flex-col overflow-hidden">
          <Card className="border-0 rounded-none h-full flex flex-col">
            <CardHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle>公众号</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      订阅
                      <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => navigate('/add-subscription')}>
                      <Plus className="h-4 w-4 mr-2" />
                      添加公众号
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportMPS}>
                      <Download className="h-4 w-4 mr-2" />
                      导出公众号
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={importMPS}>
                      <Upload className="h-4 w-4 mr-2" />
                      导入公众号
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportOPML}>
                      <Share2 className="h-4 w-4 mr-2" />
                      导出OPML
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto flex flex-col">
              <div className="mb-3">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={mpSearchText}
                    onChange={(e) => setMpSearchText(e.target.value)}
                    placeholder="搜索公众号名称"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleMpSearch()
                      }
                    }}
                    className="pl-8 h-8"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {mpLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-0">
                    {mpList.map((item: MpItem) => (
                      <div
                        key={item.id}
                        onClick={() => handleMpClick(item.id)}
                        className={`cursor-pointer p-3 transition-all duration-200 mb-0 hover:bg-muted ${
                          activeMpId === item.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1 min-w-0">
                            <img src={Avatar(item.avatar)} width="40" className="float-left mr-4 flex-shrink-0" alt="" />
                            <span className="font-semibold truncate">
                              {item.name || item.mp_name}
                            </span>
                            {activeMpId === item.id && item.id !== '' && (
                              <div className="flex gap-1 ml-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteMp(item.id)
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyMpId(item.id)
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {renderPagination(mpPagination.current, mpPagination.pageSize, mpPagination.total, handleMpPageChange)}
            </CardContent>
          </Card>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 p-5 overflow-auto">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-bold m-0">{activeFeed ? activeFeed.name : '全部'}</h2>
                <p className="text-muted-foreground m-0">管理您的公众号订阅内容</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleExportShow}>
                  <Download className="h-4 w-4 mr-2" />
                  导出
                </Button>
                <ExportModal ref={exportModalRef} />
                {activeFeed?.id !== '' ? (
                  <Button onClick={refresh}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新
                  </Button>
                ) : (
                  <>
                    <Button onClick={clear_articles}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      清理无效文章
                    </Button>
                    <Button onClick={clear_duplicate_article}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      清理重复文章
                    </Button>
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>
                      <Wifi className="h-4 w-4 mr-2" />
                      订阅
                      <ChevronDown className="h-4 w-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => { setRssFormat('atom'); openRssFeed() }}>
                      <TextIcon text="atom" iconClass="" /> ATOM
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setRssFormat('rss'); openRssFeed() }}>
                      <TextIcon text="rss" iconClass="" /> RSS
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setRssFormat('json'); openRssFeed() }}>
                      <TextIcon text="json" iconClass="" /> JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setRssFormat('md'); openRssFeed() }}>
                      <TextIcon text="md" iconClass="" /> Markdown
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setRssFormat('txt'); openRssFeed() }}>
                      <TextIcon text="txt" iconClass="" /> Text
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="destructive"
                  onClick={() => setBatchDeleteDialogOpen(true)}
                  disabled={!selectedRowKeys.length}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  批量删除
                </Button>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-4">
              <Alert className="mb-4">
                <AlertDescription>{activeFeed?.mp_intro || '请选择一个公众号码进行管理,搜索文章后再点击订阅会有惊喜哟！！！'}</AlertDescription>
              </Alert>
              <div className="flex mb-5">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="搜索文章标题"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch()
                      }
                    }}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={articles.length > 0 && articles.every(article => selectedRowKeys.includes(article.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRowKeys(articles.map(article => article.id))
                            } else {
                              setSelectedRowKeys([])
                            }
                          }}
                        />
                      </TableHead>
                      {columns.map((column, index) => (
                        <TableHead
                          key={column.dataIndex || index}
                          style={column.width ? { width: column.width } : undefined}
                          className={column.ellipsis ? 'truncate' : ''}
                        >
                          {column.title}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                          加载中...
                        </TableCell>
                      </TableRow>
                    ) : articles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                          暂无数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      articles.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedRowKeys.includes(record.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRowKeys([...selectedRowKeys, record.id])
                                } else {
                                  setSelectedRowKeys(selectedRowKeys.filter(id => id !== record.id))
                                }
                              }}
                            />
                          </TableCell>
                          {columns.map((column, colIndex) => {
                            const value = column.dataIndex ? record[column.dataIndex as keyof Article] : undefined
                            const content = column.render
                              ? column.render(value, record)
                              : value
                            return (
                              <TableCell
                                key={column.dataIndex || colIndex}
                                className={column.ellipsis ? 'truncate' : ''}
                              >
                                {content}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {renderPagination(pagination.current, pagination.pageSize, pagination.total, handlePageChange)}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 刷新弹窗 */}
      <Dialog open={refreshModalVisible} onOpenChange={setRefreshModalVisible}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刷新设置</DialogTitle>
            <DialogDescription>
              设置要刷新的文章页面范围。第 1 页表示最新一页，默认只爬取第 1 页，如需爬取更多页可手动设置。
              系统会自动跳过已存在的文章，连续遇到3篇已存在文章时会停止处理当前公众号。
            </DialogDescription>
          </DialogHeader>
          <Form {...refreshForm}>
            <form onSubmit={refreshForm.handleSubmit(handleRefresh)} className="space-y-4">
              <FormField
                control={refreshForm.control}
                name="startPage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>起始页</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={refreshForm.control}
                name="endPage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>结束页</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 1)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRefreshModalVisible(false)}>取消</Button>
                <Button type="submit">确定</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 文章详情抽屉 */}
      <Drawer open={articleModalVisible} onOpenChange={setArticleModalVisible}>
        <DrawerContent className="h-[80vh]">
          <DrawerHeader>
            <DrawerTitle id="topreader">{currentArticle.title}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-auto flex-1">
            <div className="mb-4 text-sm text-muted-foreground">
              <a href={currentArticle.url} target="_blank" rel="noopener noreferrer" className="hover:underline">查看原文</a>
              <span className="ml-4">更新时间：{currentArticle.time}</span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  viewArticle({ id: parseInt(currentArticle.id) } as Article, -1)
                }}
                className="ml-4 hover:underline"
              >
                上一篇
              </a>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  viewArticle({ id: parseInt(currentArticle.id) } as Article, 1)
                }}
                className="ml-4 hover:underline"
              >
                下一篇
              </a>
            </div>
            <div dangerouslySetInnerHTML={{ __html: currentArticle.content }} />
            <div className="mt-5 text-sm text-muted-foreground text-right">
              {currentArticle.time}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该文章吗？删除后将无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTargetId !== null) {
                  deleteArticle(deleteTargetId)
                  setDeleteDialogOpen(false)
                  setDeleteTargetId(null)
                }
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认对话框 */}
      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的{selectedRowKeys.length}篇文章吗？删除后将无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleBatchDelete()
                setBatchDeleteDialogOpen(false)
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ArticleListDesktop
