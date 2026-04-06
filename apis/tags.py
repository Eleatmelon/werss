from fastapi import APIRouter, Depends, HTTPException,status, Body, Query
from typing import List, Optional
from datetime import datetime, timedelta
from core.models.tags import Tags as TagsModel
from core.models.article_tags import ArticleTag
from core.models.article import Article
from core.models.base import DATA_STATUS
from core.database import get_db
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case
from schemas.tags import Tags, TagsCreate
from pydantic import BaseModel
from .base import success_response, error_response
from core.auth import get_current_user, requires_permission

# 标签管理API路由
# 提供标签的增删改查功能
# 需要管理员权限执行写操作
router = APIRouter(prefix="/tags", tags=["标签管理"])


class ExtractTestRequest(BaseModel):
    """关键词提取测试请求模型"""
    title: str
    description: Optional[str] = ""
    content: Optional[str] = ""
    method: Optional[str] = "textrank"  # textrank、keybert、keybert-hybrid 或 ai
    topK: Optional[int] = 5


@router.post("/test/extract",
    summary="测试关键词提取",
    description="测试 TextRank 或 AI 关键词提取功能"
)
async def test_extract_keywords(
    request: ExtractTestRequest,
    cur_user: dict = Depends(get_current_user)
):
    """
    测试关键词提取功能
    
    参数:
    - title: 文章标题（必填）
    - description: 文章描述（可选）
    - content: 文章内容（可选）
    - method: 提取方式，textrank（默认）、keybert、keybert-hybrid 或 ai
    - topK: 返回关键词数量，默认5个
    
    返回:
    - 提取的关键词列表
    """
    try:
        from core.tag_extractor import get_tag_extractor
        
        # 使用全局单例提取器（模型常驻内存）
        extractor = get_tag_extractor()
        
        if request.method == "keybert-hybrid":
            # KeyBERT 混合方案（结合 TextRank 实体提取）
            # 先处理 HTML 内容，转换为纯文本，避免提取到 CSS 样式等无关内容
            description = extractor._html_to_text(request.description or '', to_markdown=False) if request.description else ''
            content = extractor._html_to_text(request.content or '', to_markdown=False) if request.content else ''
            
            # 合并文本用于 KeyBERT
            text = f"{request.title} {request.title} {request.title} {description}"
            if content:
                text += f" {content[:1000]}"
            keywords = extractor.extract_with_keybert_hybrid(
                text,
                topK=request.topK or 5
            )
        elif request.method == "keybert":
            # KeyBERT 标准方案（根据配置决定是否使用混合方案）
            keywords = extractor.extract(
                request.title,
                request.description or "",
                request.content or "",
                method="keybert"
            )
            keywords = keywords[:request.topK or 5]
        elif request.method == "ai":
            # AI 提取是异步的
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # 如果事件循环正在运行，使用线程池
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as executor:
                        future = executor.submit(
                            asyncio.run,
                            extractor.extract_with_ai(
                                request.title,
                                request.description or "",
                                request.content or "",
                                request.topK or 5
                            )
                        )
                        keywords = future.result()
                else:
                    keywords = asyncio.run(extractor.extract_with_ai(
                        request.title,
                        request.description or "",
                        request.content or "",
                        request.topK or 5
                    ))
            except RuntimeError:
                keywords = asyncio.run(extractor.extract_with_ai(
                    request.title,
                    request.description or "",
                    request.content or "",
                    request.topK or 5
                ))
        else:
            # TextRank 提取（同步，默认）
            keywords = extractor.extract(
                request.title,
                request.description or "",
                request.content or "",
                method="textrank"
            )
            # 限制返回数量
            keywords = keywords[:request.topK or 5]
        
        # 添加调试信息
        debug_info = {}
        if request.method == "keybert" or request.method == "keybert-hybrid":
            from core.tag_extractor import KEYBERT_AVAILABLE
            debug_info["keybert_available"] = KEYBERT_AVAILABLE
            if hasattr(extractor, 'keybert_model'):
                debug_info["keybert_model_loaded"] = extractor.keybert_model is not None
        elif request.method == "ai":
            debug_info["ai_client_available"] = extractor.ai_client is not None
            debug_info["ai_model"] = extractor.ai_model
        
        return success_response(data={
            "keywords": keywords,
            "count": len(keywords),
            "method": request.method,
            "input": {
                "title": request.title,
                "description": request.description,
                "content_length": len(request.content or "")
            },
            "debug": debug_info if not keywords else None  # 只在没有关键词时返回调试信息
        })
    except Exception as e:
        from core.print import print_error
        print_error(f"关键词提取测试失败: {e}")
        import traceback
        traceback.print_exc()
        return error_response(code=500, message=f"关键词提取失败: {str(e)}")

@router.get("", 
    summary="获取标签列表",
    description="分页获取所有标签信息")
async def get_tags(offset: int = 0, limit: int = 100, db: Session = Depends(get_db),cur_user: dict = Depends(get_current_user)):
    """
    获取标签列表
    
    参数:
    - offset: 跳过记录数，用于分页
    - limit: 每页记录数，默认100
    
    返回:
    - 包含标签列表和分页信息的成功响应
    """
    # 计算三天前的时间（用于统计近三天的文章数量）
    three_days_ago = datetime.now() - timedelta(days=3)
    
    # 查询标签并统计每个标签关联的近三天文章数量
    # 使用条件计数：只统计近三天创建的文章
    query = db.query(
        TagsModel,
        func.count(
            case(
                (and_(
                    Article.id.isnot(None),
                    Article.status != DATA_STATUS.DELETED,
                    Article.created_at >= three_days_ago
                ), ArticleTag.id),
                else_=None
            )
        ).label('article_count')
    ).outerjoin(
        ArticleTag, TagsModel.id == ArticleTag.tag_id
    ).outerjoin(
        Article, Article.id == ArticleTag.article_id
    ).group_by(TagsModel.id)
    
    total = db.query(TagsModel).count()
    results = query.offset(offset).limit(limit).all()
    
    # 将结果转换为字典格式，添加 article_count 字段
    tags = []
    for tag, article_count in results:
        tag_dict = {
            'id': tag.id,
            'name': tag.name,
            'cover': tag.cover,
            'intro': tag.intro,
            'status': tag.status,
            'mps_id': tag.mps_id,
            'is_custom': tag.is_custom,
            'sync_time': tag.sync_time,
            'update_time': tag.update_time,
            'created_at': tag.created_at.isoformat() if tag.created_at else None,
            'updated_at': tag.updated_at.isoformat() if tag.updated_at else None,
            'article_count': article_count or 0
        }
        tags.append(tag_dict)
    
    return success_response(data={
        "list": tags,
        "page": {
            "limit": limit,
            "offset": offset,
            "total": total
        },
        "total": total
    })

@router.post("",
    summary="创建新标签",
    description="创建一个新的标签"
   )
async def create_tag(tag: TagsCreate, db: Session = Depends(get_db),cur_user: dict = Depends(get_current_user)):
    """
    创建新标签
    
    参数:
    - tag: TagsCreate模型，包含标签信息
    
    请求体示例:
    {
        "name": "新标签",
        "cover": "http://example.com/cover.jpg",
        "intro": "新标签的描述",
        "status": 1
    }
    
    返回:
    - 成功: 包含新建标签信息的响应
    - 失败: 错误响应
    """
    import uuid
    try:
        db_tag = TagsModel(
            id=str(uuid.uuid4()),
            name=tag.name or '',
            cover=tag.cover or '',
            intro=tag.intro or '',
            mps_id =tag.mps_id,
            status=tag.status,
            is_custom=tag.is_custom if hasattr(tag, 'is_custom') else False,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db.add(db_tag)
        db.commit()
        db.refresh(db_tag)
        
        # 如果创建的是用户自定义标签，刷新标签提取器的缓存
        if db_tag.is_custom:
            try:
                from core.tag_extractor import TagExtractor
                # 刷新缓存（通过创建新实例的方式，或者如果有单例模式）
                # 注意：这里只是触发缓存刷新，实际使用时 TagExtractor 会重新加载
                from core.print import print_info
                print_info("用户自定义标签已创建，标签提取器缓存将在下次使用时刷新")
            except Exception as e:
                from core.print import print_warning
                print_warning(f"刷新标签提取器缓存失败: {e}")
        
        return success_response(data=db_tag)
    except Exception as e:
         from core.print  import print_error
         print_error(e)
         raise HTTPException(
            status_code=status.HTTP_201_CREATED,
            detail=error_response(
                code=50001,
                message=f"暂无数据",
            )
        )

@router.get("/{tag_id}", summary="获取单个标签详情",  description="根据标签ID获取标签详细信息")
async def get_tag(tag_id: str, db: Session = Depends(get_db),cur_user: dict = Depends(get_current_user)):
    """
    获取单个标签详情
    
    参数:
    - tag_id: 标签ID
    
    返回:
    - 成功: 包含标签详情的响应
    - 失败: 201错误响应(标签不存在)
    """
    tag = db.query(TagsModel).filter(TagsModel.id == tag_id).first()
    if not tag:
        return error_response(code=status.HTTP_201_CREATED, message="Tag not found")
    return success_response(data=tag)

@router.put("/{tag_id}",
    summary="更新标签信息",
    description="根据标签ID更新标签信息",
 )
async def update_tag(tag_id: str, tag_data: TagsCreate, db: Session = Depends(get_db),cur_user: dict = Depends(get_current_user)):
    """
    更新标签信息
    
    参数:
    - tag_id: 要更新的标签ID
    - tag_data: TagsCreate模型，包含要更新的标签信息
    
    请求体示例:
    {
        "name": "更新后的标签",
        "cover": "http://example.com/new_cover.jpg",
        "intro": "更新后的描述",
        "status": 1
    }
    
    返回:
    - 成功: 包含更新后标签信息的响应
    - 失败: 404错误响应(标签不存在)或500错误响应(服务器错误)
    """
    try:
        tag = db.query(TagsModel).filter(TagsModel.id == tag_id).first()
        if not tag:
            return error_response(code=404, message="Tag not found")
        
        tag.name = tag_data.name
        tag.cover = tag_data.cover
        tag.intro = tag_data.intro
        tag.status = tag_data.status
        tag.mps_id = tag_data.mps_id
        old_is_custom = tag.is_custom
        tag.is_custom = tag_data.is_custom if hasattr(tag_data, 'is_custom') else False
        tag.updated_at = datetime.now()
        
        db.commit()
        db.refresh(tag)
        
        # 如果 is_custom 状态发生变化，刷新标签提取器的缓存
        if old_is_custom != tag.is_custom:
            try:
                from core.tag_extractor import TagExtractor
                from core.print import print_info
                print_info("用户自定义标签状态已更新，标签提取器缓存将在下次使用时刷新")
            except Exception as e:
                from core.print import print_warning
                print_warning(f"刷新标签提取器缓存失败: {e}")
        
        return success_response(data=tag)
    except Exception as e:
        return error_response(code=500, message=str(e))

@router.delete("",
    summary="批量删除标签",
    description="根据标签ID列表批量删除标签（支持单个或多个）",
   )
async def batch_delete_tags(
    tag_ids: List[str] = Query(..., description="要删除的标签ID列表，可以传递多个"),
    db: Session = Depends(get_db), 
    cur_user: dict = Depends(get_current_user)
):
    """
    批量删除标签
    
    参数:
    - tag_ids: 要删除的标签ID列表（查询参数，可传递多个）
    
    请求示例:
    DELETE /api/v1/wx/tags?tag_ids=id1&tag_ids=id2&tag_ids=id3
    
    返回:
    - 成功: 删除成功的响应，包含删除的数量
    - 失败: 500错误响应(服务器错误)
    """
    try:
        if not tag_ids:
            return error_response(code=400, message="标签ID列表不能为空")
        
        # 查询要删除的标签
        tags = db.query(TagsModel).filter(TagsModel.id.in_(tag_ids)).all()
        
        if not tags:
            return error_response(code=404, message="未找到要删除的标签")
        
        # 批量删除
        deleted_count = 0
        for tag in tags:
            db.delete(tag)
            deleted_count += 1
        
        db.commit()
        return success_response(data={"deleted_count": deleted_count}, message=f"成功删除 {deleted_count} 个标签")
    except Exception as e:
        db.rollback()
        from core.print import print_error
        print_error(f"批量删除标签失败: {e}")
        return error_response(code=500, message=str(e))

@router.delete("/{tag_id}",
    summary="删除单个标签",
    description="根据标签ID删除单个标签",
   )
async def delete_tag(tag_id: str, db: Session = Depends(get_db),cur_user: dict = Depends(get_current_user)):
    """
    删除单个标签
    
    参数:
    - tag_id: 要删除的标签ID
    
    返回:
    - 成功: 删除成功的响应
    - 失败: 404错误响应(标签不存在)或500错误响应(服务器错误)
    """
    try:
        tag = db.query(TagsModel).filter(TagsModel.id == tag_id).first()
        if not tag:
            return error_response(code=status.HTTP_201_CREATED, message="Tag not found")
        db.delete(tag)
        db.commit()
        return success_response(message="Tag deleted successfully")
    except Exception as e:
        return error_response(code=status.HTTP_201_CREATED, message=str(e))