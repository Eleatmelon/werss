import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer'
import { useToast } from '@/hooks/use-toast'
import { Eye, Loader2, Search } from 'lucide-react'
import { Avatar } from '@/utils/constants'
import { formatDateTime } from '@/utils/date'
import { getArticles, getArticleDetail } from '@/api/article'
import { getSubscriptions } from '@/api/subscription'

interface Article {
  id: number
  title: string
  content: string
  mp_name: string
  created_at: string
  url: string
  description?: string
}

interface MpItem {
  id: string
  name: string
  mp_name: string
  avatar: string
  mp_intro: string
}

const ArticleListMobile: React.FC = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [fullLoading, setFullLoading] = useState(false)
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mpList, setMpList] = useState<MpItem[]>([])
  const [mpLoading, setMpLoading] = useState(false)
  const [activeMpId, setActiveMpId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [mpListVisible, setMpListVisible] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  })
  const [hasMore, setHasMore] = useState(true)
  const [activeFeed, setActiveFeed] = useState<MpItem>({
    id: '',
    name: '全部',
    mp_name: '全部',
    avatar: '',
    mp_intro: ''
  })
  const [articleModalVisible, setArticleModalVisible] = useState(false)
  const [currentArticle, setCurrentArticle] = useState({
    id: '',
    title: '',
    content: '',
    time: '',
    url: ''
  })

  useEffect(() => {
    fetchMpList()
    fetchArticles()
  }, [])

  const fetchMpList = async () => {
    setMpLoading(true)
    try {
      const res = await getSubscriptions({
        page: 0,
        pageSize: 100
      })

      const list = ((res as any).list || (res as any).data?.list || []).map((item: any) => ({
        id: item.id || item.mp_id,
        name: item.name || item.mp_name,
        avatar: item.avatar || item.mp_cover || '',
        mp_intro: item.mp_intro || ''
      }))

      setMpList(list)
    } catch (error) {
      console.error('获取公众号列表错误:', error)
    } finally {
      setMpLoading(false)
    }
  }

  const fetchArticles = async (isLoadMore = false) => {
    if (loading || (isLoadMore && !hasMore)) return
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const res = await getArticles({
        page: isLoadMore ? pagination.current : 0,
        pageSize: pagination.pageSize,
        search: searchText,
        mp_id: activeMpId
      })

      const list = (res.list || res.data?.list || []).map((item: any) => ({
        ...item,
        mp_name: item.mp_name || item.account_name || '未知公众号',
        url: item.url || `https://mp.weixin.qq.com/s/${item.id}`
      }))

      if (isLoadMore) {
        setArticles([...articles, ...list])
        setPagination(prev => ({ ...prev, current: prev.current + 1 }))
      } else {
        setArticles(list)
        setPagination(prev => ({ ...prev, current: 1 }))
      }

      setPagination(prev => ({ ...prev, total: (res as any).total || (res as any).data?.total || 0 }))
      setHasMore(list.length >= pagination.pageSize)
    } catch (error: any) {
      console.error('获取文章列表错误:', error)
      toast({
        variant: "destructive",
        title: "错误",
        description: error?.message || '获取文章列表失败'
      })
    } finally {
      if (isLoadMore) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
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
      // 滚动到顶部
      setTimeout(() => {
        const element = document.getElementById('topreader')
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } catch (error: any) {
      console.error('获取文章详情错误:', error)
      toast({
        variant: "destructive",
        title: "错误",
        description: error?.message || '获取文章详情失败'
      })
    } finally {
      setLoading(false)
    }
  }

  const showMpList = () => {
    setMpListVisible(true)
  }

  const handleMpSelect = () => {
    setMpListVisible(false)
    fetchArticles()
  }

  const handleMpClick = (mpId: string) => {
    setActiveMpId(mpId)
    const feed = mpList.find(item => item.id === mpId) || { id: '', name: '全部', mp_name: '全部', avatar: '', mp_intro: '' }
    setActiveFeed(feed)
  }

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const { scrollTop, scrollHeight, clientHeight } = target
    if (scrollHeight - (scrollTop + clientHeight) < 100 && !loadingMore && hasMore) {
      setLoadingMore(true)
      fetchArticles(true).finally(() => {
        setLoadingMore(false)
      })
    }
  }

  return (
    <div className="h-full relative">
      {fullLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-50">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm text-muted-foreground">正在刷新...</span>
          </div>
        </div>
      )}
      <div
        className="p-5 w-full h-full overflow-auto"
        onScroll={handleScroll}
      >
        <div className="mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="m-0">{activeFeed ? activeFeed.name : '全部'}</h2>
            </div>
            <div className="flex gap-2">
              <Button onClick={showMpList}>
                <Eye className="h-4 w-4 mr-2" />
                阅读
              </Button>
            </div>
          </div>
        </div>

        <Card className="border-0">
          <CardContent className="p-4">
            <div className="mb-5">
              <div className="relative">
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="搜索文章标题"
                  className="pr-10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch()
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={handleSearch}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {articles.map((item: Article) => (
                  <div key={item.id} className="border rounded-lg p-4 hover:bg-accent transition-colors">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                        <div>
                          <span
                            className="font-medium cursor-pointer hover:underline"
                            onClick={() => viewArticle(item)}
                          >
                            {item.mp_name || '未知公众号'}
                          </span>
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                          )}
                          <p className="text-sm text-muted-foreground font-medium mt-1">
                            {formatDateTime(item.created_at)}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => viewArticle(item)}>
                        <Eye className="h-4 w-4 mr-2" />
                        查看
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col items-center mt-4">
              {loadingMore ? (
                <div className="text-center py-4 text-muted-foreground">加载中...</div>
              ) : hasMore ? (
                <Button onClick={() => fetchArticles(true)} className="my-4">
                  加载更多
                </Button>
              ) : null}
              <div className="text-muted-foreground text-sm mb-4">共 {pagination.total} 条</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Drawer open={mpListVisible} onOpenChange={setMpListVisible}>
        <DrawerContent className="max-h-[96vh]">
          <DrawerHeader>
            <DrawerTitle>选择公众号</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto flex-1 px-4 pb-4">
            {mpLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {mpList.map((item: MpItem) => (
                  <div
                    key={item.id}
                    onClick={() => handleMpClick(item.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      activeMpId === item.id ? 'bg-primary/10 border-primary' : 'hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={Avatar(item.avatar)}
                        width="40"
                        height="40"
                        className="rounded"
                        alt=""
                      />
                      <span className="font-medium leading-10">
                        {item.name || item.mp_name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DrawerFooter>
            <div className="flex justify-between">
              <a href="/add-subscription" className="flex items-center gap-2 text-primary hover:underline">
                <Eye className="h-4 w-4" />
                <span>添加订阅</span>
              </a>
              <Button onClick={handleMpSelect}>
                开始阅读
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={articleModalVisible} onOpenChange={setArticleModalVisible}>
        <DrawerContent className="max-h-[96vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center justify-between">
              <span>WeRss</span>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    viewArticle({ id: parseInt(currentArticle.id) } as Article, -1)
                  }}
                  className="hover:underline"
                >
                  上一篇
                </a>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    viewArticle({ id: parseInt(currentArticle.id) } as Article, 1)
                  }}
                  className="hover:underline"
                >
                  下一篇
                </a>
              </div>
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-5 overflow-y-auto flex-1">
            <div>
              <h2 id="topreader" className="text-2xl font-bold mb-4">{currentArticle.title}</h2>
            </div>
            <div className="mt-5 text-muted-foreground text-left">
              <a href={currentArticle.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                查看原文
              </a>
              <span className="ml-4">更新时间：{currentArticle.time}</span>
            </div>
            <div className="mt-4" dangerouslySetInnerHTML={{ __html: currentArticle.content }} />
            <div className="mt-5 text-muted-foreground text-right">
              {currentArticle.time}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export default ArticleListMobile
