import logging
from logging import info
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, UploadFile, File
from pydantic import BaseModel

# 设置日志记录器
logger = logging.getLogger(__name__)

from fastapi.responses import FileResponse
from fastapi.background import BackgroundTasks
from core.auth import get_current_user
from core.db import DB
from core.wx import search_Biz
from driver.wx import Wx
from .base import success_response, error_response
from datetime import datetime
from core.config import cfg
from core.res import save_avatar_locally
import io
import os
from jobs.article import UpdateArticle
from driver.wxarticle import WXArticleFetcher
from sqlalchemy import func, case
from core.models.article import Article, ArticleBase, DATA_STATUS
router = APIRouter(prefix=f"/mps", tags=["公众号管理"])
# import core.db as db
# UPDB=db.Db("数据抓取")
# def UpdateArticle(art:dict):
#             return UPDB.add_article(art)


def _normalize_rss_limit(rss_limit):
    if rss_limit is None:
        return None
    try:
        value = int(rss_limit)
    except (TypeError, ValueError):
        return None
    if value < 0:
        return 0
    return value


class FeedUpdatePayload(BaseModel):
    mp_name: str | None = None
    mp_intro: str | None = None
    status: int | bool | None = None
    rss_limit: int | None = None


@router.get("/search/{kw}", summary="搜索公众号")
async def search_mp(
    kw: str = "",
    limit: int = 10,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        result = search_Biz(kw,limit=limit,offset=offset)
        data={
            'list':result.get('list') if result is not None else [],
            'page':{
                'limit':limit,
                'offset':offset
            },
            'total':result.get('total') if result is not None else 0
        }
        return success_response(data)
    except Exception as e:
        print(f"搜索公众号错误: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message=f"搜索公众号失败,请重新扫码授权！",
            )
        )

@router.get("", summary="获取公众号列表")
async def get_mps(
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    kw: str = Query(""),
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.feed import Feed
        query = session.query(Feed)
        if kw:
            query = query.filter(Feed.mp_name.ilike(f"%{kw}%"))
        total = query.count()
        mps = query.order_by(Feed.created_at.desc()).limit(limit).offset(offset).all()
        
        # 获取每个公众号的文章统计信息
        mp_ids = [mp.id for mp in mps]
        article_stats = {}
        if mp_ids:
            stats_query = session.query(
                Article.mp_id,
                func.count(case((ArticleBase.status != DATA_STATUS.DELETED, Article.id), else_=None)).label('article_count'),
                func.min(case((ArticleBase.status != DATA_STATUS.DELETED, Article.publish_time), else_=None)).label('min_publish_time'),
                func.max(case((ArticleBase.status != DATA_STATUS.DELETED, Article.publish_time), else_=None)).label('max_publish_time')
            ).filter(
                Article.mp_id.in_(mp_ids),
                ArticleBase.status != DATA_STATUS.DELETED
            ).group_by(Article.mp_id).all()
            
            for stat in stats_query:
                article_stats[stat.mp_id] = {
                    "article_count": stat.article_count or 0,
                    "min_publish_time": stat.min_publish_time,
                    "max_publish_time": stat.max_publish_time
                }
        
        return success_response({
            "list": [{
                "id": mp.id,
                "mp_id": mp.id,
                "mp_name": mp.mp_name,
                "mp_cover": mp.mp_cover,
                "mp_intro": mp.mp_intro,
                "status": mp.status,
                "rss_limit": mp.rss_limit,
                "created_at": mp.created_at.isoformat() if mp.created_at else None,
                "sync_time": mp.sync_time,
                "article_count": article_stats.get(mp.id, {}).get("article_count", 0),
                "min_publish_time": article_stats.get(mp.id, {}).get("min_publish_time"),
                "max_publish_time": article_stats.get(mp.id, {}).get("max_publish_time")
            } for mp in mps],
            "page": {
                "limit": limit,
                "offset": offset,
                "total": total
            },
            "total": total
        })
    except Exception as e:
        print(f"获取公众号列表错误: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="获取公众号列表失败"
            )
        )

@router.get("/update/{mp_id}", summary="更新公众号文章")
async def update_mps(
     mp_id: str,
     start_page: int = 0,
     end_page: int = 1,
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.feed import Feed
        mp = session.query(Feed).filter(Feed.id == mp_id).first()
        if not mp:
           return error_response(
                    code=40401,
                    message="请选择一个公众号"
                )
        import time
        sync_interval=cfg.get("sync_interval",60)
        if mp.update_time is None:
            mp.update_time=int(time.time())-sync_interval
        time_span=int(time.time())-int(mp.update_time)
        if time_span<sync_interval:
           return error_response(
                    code=40402,
                    message="请不要频繁更新操作",
                    data={"time_span":time_span}
                )
        result=[]    
        error_info = {"error": None, "message": None}  # 用于存储线程中的错误信息
        import threading
        lock = threading.Lock()  # 用于保护共享数据
        
        def UpArt(mp):
            try:
                from core.wx import WxGather
                wx=WxGather().Model()
                wx.get_Articles(mp.faker_id,Mps_id=mp.id,Mps_title=mp.mp_name,CallBack=UpdateArticle,start_page=start_page,MaxPage=end_page)
                # 使用锁保护共享数据
                with lock:
                    if wx.articles:
                        result.extend(wx.articles)
            except Exception as e:
                # 捕获线程中的异常，避免线程崩溃
                error_msg = str(e)
                with lock:
                    error_info["error"] = error_msg
                    error_info["message"] = "更新公众号文章时发生错误"
                import traceback
                print(f"更新公众号文章线程异常: {error_msg}")
                print(traceback.format_exc())
        
        thread = threading.Thread(target=UpArt, args=(mp,), name=f"UpArt-{mp_id}")
        thread.daemon = True  # 设置为守护线程
        thread.start()
        thread.join(timeout=30)  # 等待最多30秒
        
        # 检查是否有错误
        with lock:
            if error_info["error"]:
                error_msg = error_info["error"]
                # 如果是会话失效错误，返回特定错误码
                if "Invalid Session" in error_msg:
                    return error_response(
                        code=40101,
                        message="微信公众平台登录已失效，请重新登录",
                        data={"error": error_msg}
                    )
                else:
                    return error_response(
                        code=50001,
                        message=error_info["message"] or "更新公众号文章失败",
                        data={"error": error_msg}
                    )
        
        # 检查线程是否还在运行（超时）
        if thread.is_alive():
            # 线程仍在运行，返回进行中的状态
            return success_response({
                "time_span": time_span,
                "list": result,
                "total": len(result),
                "mps": mp,
                "status": "processing",
                "message": "文章更新正在进行中，请稍后查看"
            })
        
        return success_response({
            "time_span": time_span,
            "list": result,
            "total": len(result),
            "mps": mp
        })
    except Exception as e:
        print(f"更新公众号文章: {str(e)}",e)
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message=f"更新公众号文章{str(e)}"
            )
        )

@router.get("/{mp_id}", summary="获取公众号详情")
async def get_mp(
    mp_id: str,
    # current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.feed import Feed
        mp = session.query(Feed).filter(Feed.id == mp_id).first()
        if not mp:
            raise HTTPException(
                status_code=status.HTTP_201_CREATED,
                detail=error_response(
                    code=40401,
                    message="公众号不存在"
                )
            )
        return success_response(mp)
    except Exception as e:
        print(f"获取公众号详情错误: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="获取公众号详情失败"
            )
        )
@router.post("/by_article", summary="通过文章链接获取公众号详情")
async def get_mp_by_article(
    url: str=Query(..., min_length=1),
    current_user: dict = Depends(get_current_user)
):
    try:
        info =await WXArticleFetcher().async_get_article_content(url)
        
        if not info:
            raise HTTPException(
                status_code=status.HTTP_201_CREATED,
                detail=error_response(
                    code=40401,
                    message="公众号不存在"
                )
            )
        return success_response(info)
    except Exception as e:
        print(f"获取公众号详情错误: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="请输入正确的公众号文章链接"
            )
        )

@router.post("", summary="添加公众号")
async def add_mp(
    mp_name: str = Body(..., min_length=1, max_length=255),
    mp_cover: str = Body(None, max_length=255),
    mp_id: str = Body(None, max_length=255),
    avatar: str = Body(None, max_length=500),
    mp_intro: str = Body(None, max_length=255),
    rss_limit: int = Body(None),
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.feed import Feed
        import time
        now = datetime.now()
        
        import base64
        mpx_id = base64.b64decode(mp_id).decode("utf-8")
        feed_id = f"MP_WXS_{mpx_id}"
        
        # 处理头像：优先上传到MinIO，如果MinIO不可用或上传失败，则使用本地保存
        avatar_path = None
        if avatar:
            try:
                from core.storage.minio_client import MinIOClient
                minio_client = MinIOClient()
                
                # 如果MinIO可用，优先上传到MinIO
                if minio_client.is_available():
                    # 跳过已经是MinIO URL的头像
                    if 'minio' not in avatar.lower() and (not minio_client.public_url or minio_client.public_url not in avatar):
                        minio_avatar_url = minio_client.upload_avatar(avatar, feed_id)
                        if minio_avatar_url:
                            avatar_path = minio_avatar_url
                            print_info(f"公众号头像已上传到MinIO: {avatar[:80]}... -> {minio_avatar_url[:80]}...")
                        else:
                            # MinIO上传失败，回退到本地保存
                            local_avatar_path = save_avatar_locally(avatar)
                            avatar_path = local_avatar_path if local_avatar_path else avatar
                    else:
                        # 已经是MinIO URL，直接使用
                        avatar_path = avatar
                else:
                    # MinIO不可用，使用本地保存
                    local_avatar_path = save_avatar_locally(avatar)
                    avatar_path = local_avatar_path if local_avatar_path else avatar
            except Exception as e:
                # 处理失败，回退到本地保存
                logger.warning(f"处理公众号头像失败: {e}，回退到本地保存")
                local_avatar_path = save_avatar_locally(avatar)
                avatar_path = local_avatar_path if local_avatar_path else avatar
        else:
            # 没有提供头像URL，使用mp_cover（如果提供）
            avatar_path = mp_cover
        
        # 检查公众号是否已存在
        existing_feed = session.query(Feed).filter(Feed.faker_id == mp_id).first()
        normalized_rss_limit = _normalize_rss_limit(rss_limit)
        
        if existing_feed:
            # 更新现有记录
            existing_feed.mp_name = mp_name
            if avatar_path:
                existing_feed.mp_cover = avatar_path
            existing_feed.mp_intro = mp_intro
            existing_feed.rss_limit = normalized_rss_limit
            existing_feed.updated_at = now
        else:
            # 创建新的Feed记录
            new_feed = Feed(
                id=feed_id,
                mp_name=mp_name,
                mp_cover=avatar_path,
                mp_intro=mp_intro,
                status=1,  # 默认启用状态
                created_at=now,
                updated_at=now,
                faker_id=mp_id,
                update_time=0,
                sync_time=0,
                rss_limit=normalized_rss_limit,
            )
            session.add(new_feed)
           
        session.commit()
        
        feed = existing_feed if existing_feed else new_feed
         #在这里实现第一次添加获取公众号文章
        if not existing_feed:
            from core.queue import TaskQueue
            from core.wx import WxGather
            Max_page=int(cfg.get("max_page","2"))
            TaskQueue.add_task( WxGather().Model().get_Articles,faker_id=feed.faker_id,Mps_id=feed.id,CallBack=UpdateArticle,MaxPage=Max_page,Mps_title=mp_name)
            
        return success_response({
            "id": feed.id,
            "mp_name": feed.mp_name,
            "mp_cover": feed.mp_cover,
            "mp_intro": feed.mp_intro,
            "status": feed.status,
            "rss_limit": feed.rss_limit,
            "faker_id":mp_id,
            "created_at": feed.created_at.isoformat()
        })
    except Exception as e:
        session.rollback()
        print(f"添加公众号错误: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="添加公众号失败"
            )
        )


@router.put("/{mp_id}", summary="更新订阅号")
async def update_mp(
    mp_id: str,
    payload: FeedUpdatePayload,
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.feed import Feed

        mp = session.query(Feed).filter(Feed.id == mp_id).first()
        if not mp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    code=40401,
                    message="订阅号不存在"
                )
            )

        if payload.mp_name is not None:
            mp.mp_name = payload.mp_name
        if payload.mp_intro is not None:
            mp.mp_intro = payload.mp_intro
        if payload.status is not None:
            if isinstance(payload.status, bool):
                mp.status = 1 if payload.status else 0
            else:
                mp.status = int(payload.status)
        if payload.rss_limit is not None:
            mp.rss_limit = _normalize_rss_limit(payload.rss_limit)
        mp.updated_at = datetime.now()

        session.commit()
        session.refresh(mp)

        return success_response({
            "id": mp.id,
            "mp_id": mp.id,
            "mp_name": mp.mp_name,
            "mp_cover": mp.mp_cover,
            "mp_intro": mp.mp_intro,
            "status": mp.status,
            "rss_limit": mp.rss_limit,
            "sync_time": mp.sync_time,
        })
    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        print(f"更新订阅号错误: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="更新订阅号失败"
            )
        )
    finally:
        session.close()


@router.delete("/{mp_id}", summary="删除订阅号")
async def delete_mp(
    mp_id: str,
    current_user: dict = Depends(get_current_user)
):
    session = DB.get_session()
    try:
        from core.models.feed import Feed
        mp = session.query(Feed).filter(Feed.id == mp_id).first()
        if not mp:
            raise HTTPException(
                status_code=status.HTTP_201_CREATED,
                detail=error_response(
                    code=40401,
                    message="订阅号不存在"
                )
            )
        
        session.delete(mp)
        session.commit()
        return success_response({
            "message": "订阅号删除成功",
            "id": mp_id
        })
    except Exception as e:
        session.rollback()
        print(f"删除订阅号错误: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message="删除订阅号失败"
            )
        )
