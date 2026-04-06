from fastapi import APIRouter, Depends, Query, HTTPException, Request,Response
from fastapi import status
from fastapi.responses import Response
from core.db import DB
from core.rss import RSS
from core.models.feed import Feed
import json
from datetime import datetime
from .base import success_response, error_response
from core.auth import get_current_user
from core.config import cfg
from apis.base import format_search_kw
from core.print import print_error,print_success


def _normalize_rss_limit(limit_value):
    if limit_value is None:
        return None
    try:
        value = int(limit_value)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return value


def _get_default_rss_limit():
    default_limit = _normalize_rss_limit(cfg.get("rss.page_size", 50))
    return default_limit or 50


def _get_feed_rss_limit(feed, explicit_limit=None):
    normalized_explicit = _normalize_rss_limit(explicit_limit)
    if normalized_explicit is not None:
        return normalized_explicit
    if explicit_limit == 0:
        return None

    configured_limit = _normalize_rss_limit(getattr(feed, "rss_limit", None))
    if configured_limit is not None:
        return configured_limit

    raw_configured_limit = getattr(feed, "rss_limit", None)
    if raw_configured_limit == 0:
        return None

    return _get_default_rss_limit()


def _serialize_article_to_rss_item(article, feed, rss_domain, cst):
    publish_time = article.publish_time
    publish_timestamp = int(publish_time) if publish_time is not None else 0
    if publish_timestamp and publish_timestamp < 10000000000:
        publish_timestamp *= 1000
    updated = datetime.fromtimestamp(publish_timestamp / 1000, tz=cst) if publish_timestamp else datetime.now(tz=cst)
    return {
        "id": str(article.id),
        "title": article.title or "",
        "link":  f"{rss_domain}rss/feed/{article.id}" if cfg.get("rss.local",False) else article.url,
        "description": article.description if article.description != "" else article.title or "",
        "content": article.content or "",
        "image": article.pic_url or "",
        "mp_name": feed.mp_name or "",
        "updated": updated,
        "feed": {
                "id":feed.id,
                "name":feed.mp_name,
                "cover":feed.mp_cover,
                "intro":feed.mp_intro
        }
    }


def _cache_article_contents(rss, feed_article_pairs):
    for feed, article in feed_article_pairs:
        content_data = {
            "id": article.id,
            "title": article.title,
            "content": article.content,
            "publish_time": article.publish_time,
            "mp_id": article.mp_id,
            "pic_url": article.pic_url,
            "mp_name": feed.mp_name
        }
        rss.cache_content(article.id, content_data)


def verify_rss_access(current_user: dict = Depends(get_current_user)):
    """
    RSS访问认证方法
    :param current_user: 当前用户信息
    :return: 认证通过返回用户信息，否则抛出HTTP异常
    """
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_response(
                code=40101,
                message="未授权的RSS访问"
            )
        )
    return current_user

router = APIRouter(prefix="/rss",tags=["Rss"])
feed_router = APIRouter(prefix="/feed",tags=["Feed"])

@router.get("/{feed_id}/api", summary="获取特定RSS源详情")
async def get_rss_source(
    feed_id: str,
    request: Request,
    limit: int = Query(0, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    # current_user: dict = Depends(verify_rss_access)
):
    return await get_mp_articles_source(request=request,feed_id=feed_id, limit=limit,offset=offset, is_update=True)





@router.get("/fresh", summary="更新并获取RSS订阅列表")
async def update_rss_feeds( 
    request: Request,
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    # current_user: dict = Depends(get_current_user)
):
    return await get_rss_feeds(request=request, limit=limit,offset=offset, is_update=True)

@router.get("", summary="获取RSS订阅列表")
async def get_rss_feeds(
    request: Request,
    limit: int = Query(10, ge=1, le=30),
    offset: int = Query(0, ge=0),
    is_update:bool=False,
    # current_user: dict = Depends(get_current_user)
):
    rss=RSS(name=f'all_{limit}_{offset}')
    rss_xml=rss.get_cache()
    if rss_xml is not None  and is_update==False:
         return Response(
            content=rss_xml,
            media_type="application/xml"
        )
    session = DB.get_session()
    try:
        total = session.query(Feed).count()
        feeds = session.query(Feed).order_by(Feed.created_at.desc()).limit(limit).offset(offset).all()
        rss_domain=cfg.get("rss.base_url",request.base_url)
        # 转换为RSS格式数据
        from datetime import datetime, timezone, timedelta
        # assume CST (UTC+8) for naive timestamps
        cst = timezone(timedelta(hours=8))
        rss_list = [{
            "id": str(feed.id),
            "title": feed.mp_name,
            "link":  f"{rss_domain}rss/{feed.id}",
            "description": feed.mp_intro,
            "image": feed.mp_cover,
            "updated": (feed.created_at if getattr(feed.created_at, 'tzinfo', None) is not None else feed.created_at.replace(tzinfo=cst)).isoformat()
        } for feed in feeds]
        
        # 生成RSS XML
        rss_xml = rss.generate_rss(rss_list, title="WeRSS订阅",link=rss_domain)
        
        return Response(
            content=rss_xml,
            media_type="application/xml"
        )
    except Exception as e:
        print(f"获取RSS订阅列表错误: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_406_NOT_ACCEPTABLE,
            detail=error_response(
                code=50001,
                message="获取RSS订阅列表失败"
            )
        )

@router.get("/content/{content_id}", summary="获取缓存的文章内容")
async def get_rss_feed(content_id: str):
    rss = RSS()
    content = rss.get_cached_content(content_id)
      
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                code=40402,
                message="文章内容未找到"
            )
        )
    title=content['title']
    html='''
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="ie=edge">
        <title>{title}</title>
        </head>
    <body>
    <center>
    <h1 style="text-align:center;">{title}</h1>
    <div class="author">来源:{source}</div>
    <div class="author">发布时间:{publish_time}</div>
    <div class="copyright">
        <p>
        本文章仅用于学习和交流目的，不代表本网站观点和立场，如涉及版权问题，请及时联系我们删除。
        </p>
    </div>
    <div id=content>{text}</div>
    </center>
    </body>
    </html>
    '''
    text=rss.add_logo_prefix_to_urls(content['content'])
    html=html.format(title=title,text=text,source=content['mp_name'],publish_time=content['publish_time'])
    return Response(
            content=html,
            media_type="text/html"
        )
def UpdateArticle(art:dict):
            return DB.add_article(art)


@router.api_route("/{feed_id}/fresh", summary="更新并获取公众号文章RSS")
async def update_rss_feeds( 
    request: Request,
    feed_id: str,
    limit: int = Query(0, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    # current_user: dict = Depends(get_current_user)
):
        #如果需要放开授权，请只允许内网访问，防止 被利用攻击 放开授权办法，注释上面current_user: dict = Depends(get_current_user)

        # from core.models.feed import Feed
        # mp = DB.session.query(Feed).filter(Feed.id == feed_id).first()
        # from core.wx import WxGather
        # wx=WxGather().Model()
        # wx.get_Articles(mp.faker_id,Mps_id=mp.id,CallBack=UpdateArticle)
        # result=wx.articles

        return await get_mp_articles_source(request=request,feed_id=feed_id, limit=limit,offset=offset, is_update=True)



@router.get("/{feed_id}", summary="获取公众号文章")
async def get_mp_articles_source(
    request: Request,
    feed_id: str=None,
    tag_id:str=None,
    ext:str="xml",
    limit: int = Query(10, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    kw:str="",
    is_update:bool=True,
    content_type:str=Query(None,alias="ctype"),
    template:str=None
    # current_user: dict = Depends(get_current_user)
):
    rss=RSS(name=f'{tag_id}_{feed_id}_{limit}_{offset}',ext=ext)
    rss.set_content_type(content_type)
    rss_xml = rss.get_cache()
    if rss_xml is not None and is_update==False:
         return Response(
            content=rss_xml,
            media_type=rss.get_type()
        )
    session = DB.get_session()
    try:
        from core.models.article import Article
        from core.models.tags import Tags
        from datetime import datetime, timezone, timedelta
        # 查询公众号信息
        feed = session.query(Feed)
        query=session.query(Feed, Article).join(Article, Feed.id == Article.mp_id)
        rss_domain=cfg.get("rss.base_url",str(request.base_url))
        explicit_limit = limit if "limit" in request.query_params else None
        if feed_id not in ["all",None]:
            feed=feed.filter(Feed.id == feed_id).first()
            query=query.filter(Article.mp_id==feed_id)
        else:
            feed=Feed()
            feed.mp_name=cfg.get("rss.title","WeRss") or "WeRss"
            feed.mp_intro=cfg.get("rss.description") or "WeRss高效订阅我的公众号"
            feed.mp_cover=cfg.get("rss.cover") or f"{rss_domain}static/logo.svg"
            #如果传入了tag_id就加载tag对应的订阅信息
            if tag_id is not None:
                tags=session.query(Tags).filter(Tags.id == tag_id).first()
                if tags:
                    mps_ids = [str(mp['id']) for mp in json.loads(tags.mps_id)] if tags.mps_id else []
                    query=query.filter(Feed.id.in_(mps_ids))
                    feed.mp_name = tags.name
                    feed.mp_intro = tags.intro
                    feed.mp_cover = f'{rss_domain}{tags.cover}'

        
        if not feed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    code=40401,
                    message="公众号不存在"
                )
            )
      
        # 查询文章列表
        total = query.count()
        if kw!="":
            query=query.filter(format_search_kw(kw))
        cst = timezone(timedelta(hours=8))
        feed_article_pairs = []

        # 单个公众号：默认使用该公众号自己的 rss_limit；传 limit 时覆盖
        if feed_id not in ["all", None]:
            effective_limit = _get_feed_rss_limit(feed, explicit_limit)
            feed_query = query.order_by(Article.publish_time.desc())
            if offset:
                feed_query = feed_query.offset(offset)
            if effective_limit is not None:
                feed_query = feed_query.limit(effective_limit)
            feed_article_pairs = feed_query.all()
        # 聚合 RSS：未显式传 limit 且 offset=0 时，按公众号各自 rss_limit 取数再汇总
        elif explicit_limit is None and offset == 0:
            feed_query = session.query(Feed)
            if tag_id is not None:
                tags=session.query(Tags).filter(Tags.id == tag_id).first()
                if tags:
                    mps_ids = [str(mp['id']) for mp in json.loads(tags.mps_id)] if tags.mps_id else []
                    feed_query = feed_query.filter(Feed.id.in_(mps_ids))
            feeds_for_rss = feed_query.order_by(Feed.created_at.desc()).all()
            for current_feed in feeds_for_rss:
                per_feed_query = session.query(Article).filter(Article.mp_id == current_feed.id)
                if kw != "":
                    per_feed_query = per_feed_query.filter(format_search_kw(kw))
                per_feed_limit = _get_feed_rss_limit(current_feed, None)
                per_feed_query = per_feed_query.order_by(Article.publish_time.desc())
                if per_feed_limit is not None:
                    per_feed_query = per_feed_query.limit(per_feed_limit)
                for article in per_feed_query.all():
                    feed_article_pairs.append((current_feed, article))
            feed_article_pairs.sort(
                key=lambda pair: int(pair[1].publish_time or 0),
                reverse=True,
            )
        else:
            global_query = query.order_by(Article.publish_time.desc()).offset(offset)
            normalized_limit = _normalize_rss_limit(limit)
            if normalized_limit is not None:
                global_query = global_query.limit(normalized_limit)
            feed_article_pairs = global_query.all()

        rss_list = [
            _serialize_article_to_rss_item(article, _feed, rss_domain, cst)
            for _feed, article in feed_article_pairs
        ]
        _cache_article_contents(rss, feed_article_pairs)
        # 生成RSS XML
        rss_xml = rss.generate(rss_list,ext=ext, title=f"{feed.mp_name}",link=rss_domain,description=feed.mp_intro,image_url=feed.mp_cover,template=template)
        
        return Response(
            content=rss_xml,
            media_type=rss.get_type()
        )
    except Exception as e:
        print_error(f"获取RSS错误:{e}")
        # raise
        return Response(
             content=rss_xml,
             media_type=rss.get_type()
        )
    


@feed_router.get("/{feed_id}.{ext}", summary="获取公众号文章源")
async def rss(
    request: Request,
    feed_id: str,
    ext: str,
    limit: int = Query(0, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    kw:str="",
    content_type:str=Query(None,alias="ctype"),
    is_update:bool=True
):
    return await get_mp_articles_source(request=request,feed_id=feed_id, limit=limit,offset=offset, is_update=is_update,ext=ext,kw=kw,content_type=content_type)


@feed_router.get("/search/{kw}/{feed_id}.{ext}", summary="获取公众号文章源")
async def rss(
    request: Request,
    feed_id: str,
    ext: str,
    limit: int = Query(0, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    kw:str="",
    content_type:str=Query(None,alias="ctype"),
    is_update:bool=True
):
    return await get_mp_articles_source(request=request,feed_id=feed_id, limit=limit,offset=offset, is_update=is_update,ext=ext,kw=kw,content_type=content_type)
@feed_router.get("/tag/{tag_id}.{ext}", summary="获取公众号文章源")
async def rss(
    request: Request,
    tag_id:str="",
    feed_id: str=None,
    ext: str="jmd",
    limit: int = Query(0, ge=0, le=5000),
    offset: int = Query(0, ge=0),
    kw:str="",
    content_type:str=Query(None,alias="ctype"),
    is_update:bool=True
):
    return await get_mp_articles_source(request=request,feed_id=feed_id, tag_id=tag_id,limit=limit,offset=offset, is_update=is_update,ext=ext,kw=kw,content_type=content_type)


