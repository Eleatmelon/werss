import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { getArticles, deleteArticle as deleteArticleApi, ArticleListResult, Article, fetchArticleContent, getArticleDetail, updateArticle, UpdateArticleParams } from '@/api/article'
import { getSubscriptions, SubscriptionListResult } from '@/api/subscription'
import { formatDateTime, formatTimestamp } from '@/utils/date'
import dayjs from 'dayjs'
import ExportModal from '@/components/ExportModal'
import { Trash2, Download, Wifi, ChevronDown, Loader2, Edit } from 'lucide-react'

const ArticleListPage: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  })
  const [searchText, setSearchText] = useState('')
  const [mpId, setMpId] = useState<string>('')
  const [mpList, setMpList] = useState<Array<{ mp_id: string; mp_name: string }>>([])
  const [articleModalVisible, setArticleModalVisible] = useState(false)
  const [currentArticle, setCurrentArticle] = useState<Article | null>(null)
  const [fetchingContent, setFetchingContent] = useState(false)
  const [refreshingArticleId, setRefreshingArticleId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | number | null>(null)
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingArticle, setEditingArticle] = useState<Article | null>(null)
  const [editFormData, setEditFormData] = useState<UpdateArticleParams>({
    title: '',
    description: '',
    url: '',
    pic_url: ''
  })
  const exportModalRef = React.useRef<any>(null)
  const { toast } = useToast()

  const processArticleContent = (content?: string) => {
    return (content || '')
      .replace(/<img([^>]*?)\sdata-src=(['"])([^'"]+)\2([^>]*?)>/gi, (_match, before, _quote, dataSrc, after) => {
        if (/src=(['"])[^'"]*\1/i.test(`${before}${after}`)) {
          return `<img${before}${after}>`
        }
        return `<img${before} src="${dataSrc}"${after}>`
      })
      .replace(/<img([^>]*)width=["'][^"']*["']([^>]*)>/gi, '<img$1$2>')
  }

  const normalizeArticle = (article: Article) => ({
    ...article,
    content: processArticleContent(article.content)
  })

  // 加载订阅列表（用于筛选）
  const loadMpList = async () => {
    try {
      const res = await getSubscriptions({
        page: 0,
        pageSize: 100
      }) as unknown as SubscriptionListResult

      const list = res.list || res.data?.list || []
      setMpList(list.map(item => ({
        mp_id: item.mp_id,
        mp_name: item.mp_name || item.mp_id
      })))
    } catch (error) {
      console.error('获取订阅列表失败:', error)
    }
  }

  // 加载文章列表
  const loadArticles = async () => {
    setLoading(true)
    try {
      const res = await getArticles({
        page: pagination.current - 1,
        pageSize: pagination.pageSize,
        search: searchText,
        mp_id: mpId || undefined
      }) as unknown as ArticleListResult

      let list: Article[] = []
      let total = 0
      
      if (Array.isArray(res)) {
        list = res
        total = res.length
      } else if (res && typeof res === 'object') {
        list = (res as any)?.list || (res as any)?.data?.list || []
        total = (res as any)?.total || (res as any)?.data?.total || 0
      }
      
      setArticles(list)
      setPagination(prev => ({ ...prev, total }))
    } catch (error: any) {
      console.error('获取文章列表失败:', error)
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('articles.messages.fetchFailed')
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMpList()
  }, [])

  useEffect(() => {
    loadArticles()
  }, [pagination.current, pagination.pageSize, searchText, mpId])

  // 查看文章
  const viewArticle = async (article: Article) => {
    setCurrentArticle(normalizeArticle(article))
    setArticleModalVisible(true)
    
    try {
      const res = await getArticleDetail(article.id, 0)
      const articleData = (res as any)?.data || res
      if (articleData) {
        setCurrentArticle(normalizeArticle({
          ...article,
          ...articleData,
          mp_name: articleData.mp_name || article.mp_name
        }))
      }
    } catch (error) {
      console.error('获取文章详情失败:', error)
    }
  }

  const refreshArticleContent = async (article: Article, refreshDetail: boolean = false) => {
    const articleId = String(article.id)
    setRefreshingArticleId(articleId)
    if (refreshDetail) {
      setFetchingContent(true)
    }

    try {
      const result = await fetchArticleContent(article.id)
      const responseData = (result as any)?.data || result
      toast({
        title: "成功",
        description: responseData?.tag_backfilled ? "内容和关键词已更新" : "内容抓取完成"
      })

      loadArticles()

      if (refreshDetail) {
        const res = await getArticleDetail(article.id, 0)
        if ((res as any).data?.data) {
          setCurrentArticle(normalizeArticle((res as any).data.data))
        } else if ((res as any).data) {
          setCurrentArticle(normalizeArticle((res as any).data))
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "错误",
        description: error?.response?.data?.detail?.message || error?.message || '获取内容失败'
      })
    } finally {
      setRefreshingArticleId(null)
      if (refreshDetail) {
        setFetchingContent(false)
      }
    }
  }

  // 编辑文章
  const handleEdit = (article: Article) => {
    setEditingArticle(article)
    setEditFormData({
      title: article.title || '',
      description: (article as any).description || '',
      url: article.link || (article as any).url || '',
      pic_url: (article as any).pic_url || ''
    })
    setEditDialogOpen(true)
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingArticle) return
    
    try {
      await updateArticle(editingArticle.id, editFormData)
      toast({
        title: t('common.success'),
        description: t('articles.messages.updateSuccess')
      })
      setEditDialogOpen(false)
      setEditingArticle(null)
      loadArticles()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('articles.messages.updateFailed')
      })
    }
  }

  // 删除文章
  const handleDelete = async (id: string | number) => {
    setDeleteTargetId(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    try {
      await deleteArticleApi(deleteTargetId as any)
      toast({
        title: "成功",
        description: "删除成功"
      })
      setDeleteDialogOpen(false)
      setDeleteTargetId(null)
      loadArticles()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "错误",
        description: error.message || '删除失败'
      })
    }
  }

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      toast({
        variant: "destructive",
        title: t('common.warning'),
        description: t('articles.messages.selectFirst')
      })
      return
    }
    setBatchDeleteDialogOpen(true)
  }

  const confirmBatchDelete = async () => {
    try {
      await Promise.all(selectedRowKeys.map(id => deleteArticleApi(id as any)))
      toast({
        title: "成功",
        description: "删除成功"
      })
      setSelectedRowKeys([])
      setBatchDeleteDialogOpen(false)
      loadArticles()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "错误",
        description: error.message || '删除失败'
      })
    }
  }

  // 打开RSS订阅
  const openRssFeed = (format: string) => {
    const baseUrl = window.location.origin
    const feedUrl = mpId
      ? `${baseUrl}/feed/mp/${mpId}.${format}`
      : `${baseUrl}/feed/all.${format}`
    window.open(feedUrl, '_blank')
  }

  const toggleRowSelection = (id: string | number) => {
    const idStr = String(id) // 转换为字符串，确保格式一致
    setSelectedRowKeys(prev => 
      prev.includes(idStr) 
        ? prev.filter(key => key !== idStr)
        : [...prev, idStr]
    )
  }

  const toggleAllSelection = () => {
    if (selectedRowKeys.length === articles.length) {
      setSelectedRowKeys([])
    } else {
      setSelectedRowKeys(articles.map(a => String(a.id))) // 确保转换为字符串
    }
  }

  const totalPages = Math.ceil(pagination.total / pagination.pageSize)
  const handleJumpPage = (rawValue: string) => {
    const targetPage = parseInt(rawValue, 10)
    if (Number.isNaN(targetPage)) {
      return
    }
    setPagination(prev => ({
      ...prev,
      current: Math.min(totalPages, Math.max(1, targetPage))
    }))
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-foreground">
          文章列表
        </h1>
        <p className="text-muted-foreground text-sm">
          浏览和管理您的所有文章
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>文章管理</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                // selectedRowKeys 已经是字符串数组，直接使用
                const selectedIds = (selectedRowKeys || []).slice() // 创建副本
                
                // 调试日志：检查选中的文章
                console.log('导出按钮点击:', {
                  selectedRowKeys: selectedRowKeys,
                  selectedIds: selectedIds,
                  selectedIdsLength: selectedIds.length,
                  selectedIdsValues: selectedIds, // 显示实际值
                  articlesCount: articles.length
                })
                
                // 确定 mp_id：如果有选中的文章，从选中的文章中获取 mp_id
                let currentMpId = mpId || ''
                let mpName = '全部'
                
                if (selectedIds.length > 0) {
                  // 从选中的文章中获取 mp_id（使用字符串 ID 匹配）
                  const selectedArticles = articles.filter(art => selectedRowKeys.includes(String(art.id)))
                  console.log('选中的文章:', {
                    selectedArticlesCount: selectedArticles.length,
                    selectedArticles: selectedArticles.map(art => ({
                      id: art.id,
                      idType: typeof art.id,
                      idString: String(art.id), // 转换为字符串后的值
                      title: art.title,
                      mp_id: (art as any).mp_id
                    }))
                  })
                  
                  if (selectedArticles.length > 0) {
                    // 获取所有选中文章的 mp_id（从实际数据中获取）
                    const mpIds = selectedArticles.map(art => (art as any).mp_id).filter(Boolean)
                    if (mpIds.length > 0) {
                      // 如果所有文章来自同一个公众号，使用该公众号的 mp_id
                      const uniqueMpIds = [...new Set(mpIds)]
                      if (uniqueMpIds.length === 1) {
                        currentMpId = uniqueMpIds[0]
                        const currentMp = mpList.find(mp => mp.mp_id === currentMpId)
                        mpName = currentMp?.mp_name || selectedArticles[0].mp_name || '全部'
                      } else {
                        // 如果来自不同公众号，使用 "all"
                        currentMpId = 'all'
                        mpName = '全部'
                      }
                    } else {
                      // 如果文章数据中没有 mp_id，使用当前筛选条件或 "all"
                      currentMpId = currentMpId || 'all'
                      const currentMp = mpList.find(mp => mp.mp_id === currentMpId)
                      mpName = currentMp?.mp_name || '全部'
                    }
                  }
                } else {
                  // 没有选中文章，使用当前筛选条件
                  if (!currentMpId) {
                    currentMpId = 'all'
                  }
                  const currentMp = mpList.find(mp => mp.mp_id === currentMpId)
                  mpName = currentMp?.mp_name || '全部'
                }
                
                console.log('调用 exportModal.show:', {
                  currentMpId,
                  selectedIds,
                  selectedIdsLength: selectedIds.length,
                  mpName
                })
                
                exportModalRef.current?.show(currentMpId, selectedIds, mpName)
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              导出
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Wifi className="h-4 w-4 mr-2" />
                  订阅
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => openRssFeed('atom')}>ATOM</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openRssFeed('rss')}>RSS</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openRssFeed('json')}>JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              批量删除
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Input
                  placeholder="搜索文章标题"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pr-10"
                />
              </div>
              <Select 
                value={mpId || "__all__"} 
                onValueChange={(value) => setMpId(value === "__all__" ? "" : value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="选择订阅源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部</SelectItem>
                  {mpList.map(mp => (
                    <SelectItem key={mp.mp_id} value={mp.mp_id}>
                      {mp.mp_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedRowKeys.length === articles.length && articles.length > 0 && articles.length > 0}
                        onCheckedChange={toggleAllSelection}
                      />
                    </TableHead>
                    <TableHead className="w-[300px]">标题</TableHead>
                    <TableHead className="w-[150px]">来源</TableHead>
                    <TableHead className="w-[200px]">关键词</TableHead>
                    <TableHead className="w-[180px]">发布时间</TableHead>
                    <TableHead className="w-[100px]">状态</TableHead>
                    <TableHead className="w-[120px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : articles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    articles.map((article) => {
                      const tags = (article as any).tag_names || (article as any).topic_names || ((article as any).tags ? (article as any).tags.map((t: any) => t.name || t) : []) || []
                      const time = (article as any).publish_time
                      let timeDisplay = '-'
                      if (time || time === 0) {
                        if (typeof time === 'number') {
                          const timestamp = time
                          const timestampLength = timestamp.toString().length
                          const adjustedTimestamp = timestampLength <= 10 ? timestamp * 1000 : timestamp
                          const date = dayjs(adjustedTimestamp)
                          if (date.isValid() && date.year() >= 1970 && date.year() < 2100) {
                            timeDisplay = formatTimestamp(timestamp)
                          }
                        } else {
                          timeDisplay = formatDateTime(time as string)
                        }
                      }
                      
                      return (
                        <TableRow key={article.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRowKeys.includes(String(article.id))}
                              onCheckedChange={() => toggleRowSelection(article.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault()
                                viewArticle(article)
                              }}
                              className="text-purple-600 hover:underline break-words cursor-pointer"
                              title={article.title}
                            >
                              {article.title}
                            </a>
                          </TableCell>
                          <TableCell>{article.mp_name}</TableCell>
                          <TableCell>
                            {tags.length === 0 ? (
                              <span className="text-muted-foreground text-xs">无</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {tags.slice(0, 3).map((tag: string, index: number) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {tags.length > 3 && (
                                  <span className="text-muted-foreground text-xs">+{tags.length - 3}</span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{timeDisplay}</TableCell>
                          <TableCell>
                            {article.status === 1 ? (
                              <Badge className="bg-green-500">正常</Badge>
                            ) : article.status === 2 ? (
                              <Badge variant="destructive">已删除</Badge>
                            ) : (
                              <Badge variant="outline">未知</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refreshArticleContent(article)}
                                title="手动抓取更新"
                                disabled={refreshingArticleId === String(article.id)}
                              >
                                {refreshingArticleId === String(article.id) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Wifi className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(article)}
                                title="编辑"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(article.id)}
                                title="删除"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  共 {pagination.total} 条，第 {pagination.current} / {totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: 1 }))}
                    disabled={pagination.current === 1}
                  >
                    首页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: Math.max(1, prev.current - 1) }))}
                    disabled={pagination.current === 1}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: Math.min(totalPages, prev.current + 1) }))}
                    disabled={pagination.current === totalPages}
                  >
                    下一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(prev => ({ ...prev, current: totalPages }))}
                    disabled={pagination.current === totalPages}
                  >
                    末页
                  </Button>
                  <Input
                    key={`${pagination.current}-${totalPages}`}
                    type="number"
                    min={1}
                    max={totalPages}
                    defaultValue={pagination.current}
                    className="w-20 h-9"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleJumpPage((e.target as HTMLInputElement).value)
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement | null
                      if (input) {
                        handleJumpPage(input.value)
                      }
                    }}
                  >
                    跳转
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除这篇文章吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认对话框 */}
      <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除选中的 {selectedRowKeys.length} 篇文章吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmBatchDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 文章详情抽屉 */}
      <Drawer open={articleModalVisible} onOpenChange={setArticleModalVisible}>
        <DrawerContent className="max-h-[96vh]">
          <DrawerHeader>
            <DrawerTitle>{currentArticle?.title}</DrawerTitle>
            <DrawerDescription>
              {currentArticle && (
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                  <span>来源：{currentArticle.mp_name}</span>
                  <span>发布时间：{(() => {
                    const time = (currentArticle as any).publish_time
                    if (!time && time !== 0) return '-'
                    if (typeof time === 'number') {
                      const timestamp = time
                      const timestampLength = timestamp.toString().length
                      const adjustedTimestamp = timestampLength <= 10 ? timestamp * 1000 : timestamp
                      const date = dayjs(adjustedTimestamp)
                      if (date.isValid() && date.year() >= 1970 && date.year() < 2100) {
                        return formatTimestamp(timestamp)
                      }
                      return '-'
                    }
                    return formatDateTime(time as string)
                  })()}</span>
                  {currentArticle.link && (
                    <a href={currentArticle.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      查看原文
                    </a>
                  )}
                </div>
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto flex-1">
            {currentArticle && (
              <>
                <div className="mb-4">
                  <Button
                    onClick={() => refreshArticleContent(currentArticle, true)}
                    disabled={fetchingContent}
                  >
                    {fetchingContent && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    手动抓取更新
                  </Button>
                </div>
                <div
                  dangerouslySetInnerHTML={{ __html: currentArticle.content || '暂无内容 没有成功读到内容' }}
                  className="prose prose-sm max-w-none leading-relaxed"
                />
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* 编辑文章对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑文章</DialogTitle>
            <DialogDescription>修改文章的基本信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <Input
                value={editFormData.title}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                placeholder="请输入文章标题"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                placeholder="请输入文章描述"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">链接</label>
              <Input
                value={editFormData.url}
                onChange={(e) => setEditFormData({ ...editFormData, url: e.target.value })}
                placeholder="请输入文章链接"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">封面图链接</label>
              <Input
                value={editFormData.pic_url}
                onChange={(e) => setEditFormData({ ...editFormData, pic_url: e.target.value })}
                placeholder="请输入封面图链接"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportModal ref={exportModalRef} />
    </div>
  )
}

export default ArticleListPage
