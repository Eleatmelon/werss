"""标签提取模块 - 支持 TextRank（jieba）和 AI（OpenAI）两种方式"""
import jieba.analyse
from typing import List, Optional
import os
from core.config import cfg
from core.log import logger
from core.print import print_error, print_success
from core.env_loader import load_dev_env_if_needed

# 尝试导入 AI 相关模块（可选）
try:
    from openai import AsyncOpenAI
    AI_AVAILABLE = True
except ImportError:
    AI_AVAILABLE = False
    logger.warning("openai 模块未安装，AI 提取功能不可用")

# 尝试导入 KeyBERT 相关模块（可选）
try:
    from keybert import KeyBERT
    KEYBERT_AVAILABLE = True
except ImportError:
    KEYBERT_AVAILABLE = False
    logger.debug("keybert 模块未安装，KeyBERT 提取功能不可用")

# 全局单例实例，用于常驻内存
_global_extractor = None


class TagExtractor:
    """标签提取器，支持 TextRank、KeyBERT 和 AI 三种方式"""
    
    def __init__(self):
        """初始化标签提取器"""
        self.ai_client = None
        self.ai_model = None
        self.keybert_model = None
        self._custom_tags_cache = None  # 缓存用户自定义标签
        
        # 在开发环境中加载 .env 文件（如果存在）
        load_dev_env_if_needed()
        
        # 检查是否配置了 AI
        if AI_AVAILABLE:
            # 提供默认值 None，silent=True 避免输出警告（如果配置文件中没有这些项，会从环境变量读取）
            api_key_raw = cfg.get("openai.api_key", None, silent=True) or os.getenv("OPENAI_API_KEY", "")
            base_url_raw = cfg.get("openai.base_url", None, silent=True) or os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
            model_raw = cfg.get("openai.model", None, silent=True) or os.getenv("OPENAI_MODEL", "gpt-4o")
            
            # 确保类型为字符串
            api_key = str(api_key_raw) if api_key_raw else ""
            base_url = str(base_url_raw) if base_url_raw else "https://api.openai.com/v1"
            model = str(model_raw) if model_raw else "gpt-4o"
            
            if api_key:
                self.ai_client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url,
                )
                self.ai_model = model
                logger.info(f"OpenAI API 已配置，模型: {model}, Base URL: {base_url}")
            else:
                logger.warning("OpenAI API Key 未配置，AI 提取功能不可用")
                logger.debug(f"检查路径: cfg.get('openai.api_key')={cfg.get('openai.api_key')}, os.getenv('OPENAI_API_KEY')={os.getenv('OPENAI_API_KEY', '')}")
        else:
            logger.warning("openai 模块未安装，AI 提取功能不可用")
        
        # 检查是否可以使用 KeyBERT（懒加载，只在需要时初始化）
        self.keybert_available = KEYBERT_AVAILABLE
        # 默认使用 KeyBERT 官方推荐的多语言模型
        # 根据 KeyBERT 官方文档：https://github.com/MaartenGr/KeyBERT
        # 对于多语言文档，推荐使用 "paraphrase-multilingual-MiniLM-L12-v2"
        # 可选模型：
        # - paraphrase-multilingual-MiniLM-L12-v2（推荐，官方推荐的多语言模型，支持中英文等多种语言）
        # - all-MiniLM-L6-v2（英文文档，更轻量级）
        # - minishlab/potion-multilingual-128M（第三方多语言模型，CPU友好）
        # 使用 get 方法，如果配置不存在会使用默认值（这是正常情况）
        self.keybert_model_name = (
            cfg.get(
                "article_tag.keybert.model",
                "paraphrase-multilingual-MiniLM-L12-v2",
                silent=True,
            )
            or "paraphrase-multilingual-MiniLM-L12-v2"
        )
    
    def _get_custom_tags(self) -> List[str]:
        """
        从数据库获取用户自定义的标签（用于标签提取时优先识别）
        
        Returns:
            用户自定义标签名称列表
        """
        if self._custom_tags_cache is not None:
            return self._custom_tags_cache
        
        try:
            from core.db import DB
            from core.models.tags import Tags
            
            session = DB.get_session()
            try:
                # 查询所有启用的用户自定义标签
                custom_tags = session.query(Tags).filter(
                    Tags.is_custom == True,
                    Tags.status == 1
                ).all()
                
                # 提取标签名称
                tag_names = [tag.name for tag in custom_tags if tag.name]
                
                # 缓存结果
                self._custom_tags_cache = tag_names
                
                if tag_names:
                    logger.debug(f"加载了 {len(tag_names)} 个用户自定义标签: {tag_names[:5]}...")
                
                return tag_names
            finally:
                session.close()
        except Exception as e:
            logger.warning(f"获取用户自定义标签失败: {e}")
            # 如果查询失败，返回空列表，避免影响正常功能
            self._custom_tags_cache = []
            return []
    
    def refresh_custom_tags_cache(self):
        """刷新用户自定义标签缓存"""
        self._custom_tags_cache = None
    
    def _html_to_text(self, html_content: str, to_markdown: bool = False) -> str:
        """
        将 HTML 内容转换为纯文本或 Markdown，用于关键词提取
        
        Args:
            html_content: HTML 内容
            to_markdown: 是否转换为 Markdown（True）还是纯文本（False）
            
        Returns:
            转换后的文本
        """
        if not html_content:
            return html_content
        
        # 检查是否包含 HTML 标签
        if '<' not in html_content or '>' not in html_content:
            return html_content
        
        try:
            from bs4 import BeautifulSoup
            import re
            
            # 解析 HTML
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # 移除 script 和 style 标签及其内容（这些可能包含 CSS 样式和 JavaScript）
            for script in soup(["script", "style"]):
                script.decompose()
            
            # 移除所有元素的内联样式属性和 class 属性，避免提取到 CSS 样式信息
            from bs4 import Tag
            for tag in soup.find_all(True):
                # 类型检查：确保是 Tag 对象而不是 NavigableString
                if isinstance(tag, Tag):
                    if 'style' in tag.attrs:
                        del tag.attrs['style']
                    if 'class' in tag.attrs:
                        del tag.attrs['class']
            
            if to_markdown:
                # 转换为 Markdown
                try:
                    from markdownify import markdownify as md
                    # 先清理 HTML，移除不必要的标签
                    from bs4 import Tag
                    for tag in soup.find_all(['span', 'font']):
                        # 类型检查：确保是 Tag 对象而不是 NavigableString
                        if isinstance(tag, Tag):
                            tag.unwrap()
                    # 转换 HTML 到 Markdown
                    text = md(str(soup), heading_style="ATX", bullets='-*+')
                    # 清理多余的空白字符
                    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
                    text = re.sub(r'[ \t]+', ' ', text)
                    return text.strip()
                except ImportError:
                    logger.warning("markdownify 未安装，回退到纯文本提取")
                    to_markdown = False
            
            if not to_markdown:
                # 转换为纯文本
                text = soup.get_text(separator=' ', strip=True)
                # 清理多余的空白字符
                text = re.sub(r'\s+', ' ', text)
                # 过滤掉常见的字体名称（避免被提取为标签）
                font_names = ['Helvetica', 'Arial', 'Times New Roman', 'Courier New', 
                             'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman',
                             'Comic Sans MS', 'Trebuchet MS', 'Impact', 'Lucida Console',
                             'Tahoma', 'Courier', 'Monaco', 'Menlo', 'Consolas',
                             'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro']
                for font in font_names:
                    # 使用单词边界匹配，避免误删包含这些词的正常文本
                    text = re.sub(r'\b' + re.escape(font) + r'\b', '', text, flags=re.IGNORECASE)
                # 再次清理多余的空白字符
                text = re.sub(r'\s+', ' ', text).strip()
                return text
            
        except Exception as e:
            logger.warning(f"HTML 解析失败，使用原始内容: {e}")
            return html_content
    
    def _extract_phrases(self, text: str) -> List[str]:
        """
        提取短语（N-gram）：名词+名词、形容词+名词等组合
        
        Args:
            text: 要提取短语的文本
            
        Returns:
            短语列表
        """
        import jieba.posseg as pseg
        
        phrases = []
        words = list(pseg.cut(text))
        
        # 提取2-3个词的组合短语
        for i in range(len(words)):
            # 2-gram：名词+名词、形容词+名词
            if i < len(words) - 1:
                w1, pos1 = words[i]
                w2, pos2 = words[i+1]
                
                # 跳过单字词开头的短语（避免"行代码"这种不完整片段）
                if len(w1) == 1:
                    continue
                
                # n+n, a+n, nz+n, n+nz, nz+nz
                if (pos1 in ['n', 'nz', 'a', 'nt', 'nr'] and pos2 in ['n', 'nz', 'nt', 'nr']):
                    phrase = w1 + w2
                    # 确保短语长度合理（至少2个字符，避免单字+单字）
                    if len(phrase) >= 2 and len(phrase) <= 10:
                        phrases.append(phrase)
            
            # 3-gram：名词+名词+名词、形容词+名词+名词
            if i < len(words) - 2:
                w1, pos1 = words[i]
                w2, pos2 = words[i+1]
                w3, pos3 = words[i+2]
                
                # 跳过单字词开头的短语
                if len(w1) == 1:
                    continue
                
                if (pos1 in ['n', 'nz', 'a', 'nt', 'nr'] and 
                    pos2 in ['n', 'nz', 'nt', 'nr'] and 
                    pos3 in ['n', 'nz', 'nt', 'nr']):
                    phrase = w1 + w2 + w3
                    if len(phrase) >= 3 and len(phrase) <= 15:
                        phrases.append(phrase)
        
        return list(dict.fromkeys(phrases))  # 去重
    
    def extract_with_textrank(
        self, 
        text: str, 
        topK: int = 5, 
        allowPOS: tuple = ('n', 'nz')
    ) -> List[str]:
        """
        使用 jieba TextRank 提取关键词（改进版：优先提取短语和专有名词）
        
        Args:
            text: 要提取关键词的文本
            topK: 返回关键词数量
            allowPOS: 允许的词性，默认：n（名词）、nz（其他专名）
            
        Returns:
            关键词列表
        """
        try:
            import jieba
            import jieba.posseg as pseg
            
            # 停用词列表（过滤无意义的通用词）
            stopwords = {
                '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', 
                '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', 
                '自己', '这'
            }
            
            # ========== 步骤0：改进 jieba 分词，添加常见完整词到词典 ==========
            # 添加常见完整词到 jieba 词典，确保它们被正确识别
            common_words = [
                '英伟达', 'OpenAI', 'Meta', 'DeepSeek', 'Claude', 
                'GPT', 'AI芯片', '大模型', '人工智能'
            ]
            for word in common_words:
                if word in text:
                    jieba.add_word(word, freq=10000, tag='nz')  # 高频，确保优先识别
            
            # ========== 提取短语并添加到 jieba 词典 ==========
            phrases = self._extract_phrases(text)
            
            # 将短语临时添加到 jieba 词典，确保它们被当作一个整体
            for phrase in phrases:
                jieba.add_word(phrase, freq=1000, tag='nz')  # 高频，专有名词
            
            # ========== 第一步：优先提取短语和专有名词（公司名、人名） ==========
            # 先收集提取的短语
            entities = phrases.copy()  # 短语优先
            
            # 然后提取专有名词
            # 使用词性标注提取专有名词（跳过已经在短语中的词）
            words = pseg.cut(text)
            for word, flag in words:
                # nr: 人名, nt: 机构名（公司名）, nz: 其他专名
                if flag in ['nr', 'nt', 'nz']:
                    if len(word) >= 2 and len(word) <= 10:
                        if word not in stopwords and not word.isdigit():
                            entities.append(word)
            
            # 使用正则表达式提取可能的公司名和人名（英文和中文）
            import re
            
            # 提取英文专有名词（首字母大写的单词，包括单个大写字母+小写字母的组合）
            # 匹配如：OpenAI, Meta, LeCun, GPT5.2, H200, Skywork, R1V4-Lite, Gemini
            # 改进：匹配 "是OpenAI"、"Meta能" 等情况
            english_entities = re.findall(r'(?:是|能|将|已|正|在|和|与|及|或|的|，|、|：|。)?([A-Z][a-zA-Z0-9]+(?:\-[A-Z][a-zA-Z0-9]+)?)', text)
            for entity in english_entities:
                entity = entity.strip()
                # 过滤掉太短的（少于2个字符）和太长的（超过20个字符）
                if 2 <= len(entity) <= 20:
                    # 过滤掉纯数字
                    if not entity.isdigit():
                        # 过滤掉常见的无意义词
                        if entity.lower() not in ['ai', 'pr', 'it', 'id', 'url', 'api']:
                            entities.append(entity)
            
            # 提取常见的中文公司名（2-6个汉字，后面可能跟公司、科技等后缀）
            # 匹配如：昆仑万维、英伟达、阿里、腾讯等
            # 注意：避免提取"公司"、"科技"等后缀词本身
            chinese_company_patterns = [
                r'([\u4e00-\u9fa5]{2,6})(?:公司|科技|集团|股份|有限|技术|信息|网络|软件|数据|智能|人工智能|AI|发布|宣布)',
                r'(?:借力|合作|联手|和|与|及)([\u4e00-\u9fa5]{2,6})',  # "借力阿里" -> "阿里"
                r'([\u4e00-\u9fa5]{2,6})(?:能|将|已|正|在|获准|出口)',  # "英伟达H200获准" -> "英伟达"
            ]
            company_suffixes = {'公司', '科技', '集团', '股份', '有限', '技术', '信息', '网络', '软件', '数据', '智能'}
            for pattern in chinese_company_patterns:
                matches = re.findall(pattern, text)
                for match in matches:
                    if isinstance(match, tuple):
                        match = match[0] if match[0] else (match[1] if len(match) > 1 else '')
                    if isinstance(match, str) and len(match) >= 2 and len(match) <= 10:
                        # 过滤掉"公司"、"科技"等后缀词本身
                        if match not in company_suffixes and match not in stopwords:
                            entities.append(match)
            
            # 特别处理：提取 "英伟达" 这种完整的公司名（即使被分词）
            # 匹配连续的2-4个汉字，可能是公司名
            chinese_multi_char = re.findall(r'[\u4e00-\u9fa5]{2,4}', text)
            # 常见科技公司名（可以扩展这个列表）
            known_companies = ['英伟达', '昆仑万维', '阿里', '腾讯', '百度', '字节', '美团', '京东', '小米', '华为', 'OPPO', 'vivo']
            
            # 获取用户自定义的标签，并合并到 known_companies 中（用户自定义标签优先）
            custom_tags = self._get_custom_tags()
            # 合并：用户自定义标签在前，系统预设标签在后
            all_known_companies = list(dict.fromkeys(custom_tags + known_companies))
            
            # 优先匹配用户自定义标签，然后匹配系统预设标签
            for company in all_known_companies:
                if company in text and company not in entities:
                    entities.append(company)
            
            # 提取中文人名（2-4个汉字，常见模式）
            # 匹配如：贝索斯、马斯克、李彦宏等
            chinese_person_patterns = [
                r'([\u4e00-\u9fa5]{2,4})(?:说|表示|认为|称|指出|强调|透露|融资|发布|宣布)',
                r'([\u4e00-\u9fa5]{2,4})(?:：|，|、)',  # "贝索斯融资"、"马斯克："
            ]
            for pattern in chinese_person_patterns:
                matches = re.findall(pattern, text)
                for match in matches:
                    if len(match) >= 2 and len(match) <= 4:
                        if match not in stopwords:
                            entities.append(match)
            
            # 提取英文人名（首字母大写的单词，后面跟逗号、冒号等）
            # 匹配如：LeCun, OpenAI等（已经在上面提取了）
            
            # 去重并过滤
            entities = list(dict.fromkeys(entities))
            # 过滤掉"公司"、"科技"等后缀词本身，以及以这些词结尾的英文+中文组合
            company_suffixes = {'公司', '科技', '集团', '股份', '有限', '技术', '信息', '网络', '软件', '数据', '智能'}
            filtered_entities = []
            for entity in entities:
                # 过滤公司后缀词本身
                if entity in company_suffixes:
                    continue
                # 过滤以公司后缀词结尾的英文+中文组合（如"DeepSeek公司"）
                if any(entity.endswith(suffix) for suffix in company_suffixes):
                    # 如果是以英文开头的词，过滤掉（如"DeepSeek公司"）
                    if re.match(r'^[A-Za-z]', entity):
                        continue
                filtered_entities.append(entity)
            entities = filtered_entities
            
            # ========== 第二步：使用 TF-IDF 和 TextRank 提取其他关键词 ==========
            # 使用 TF-IDF 作为备选（通常质量更好）
            try:
                import jieba.analyse
                keywords_tfidf = jieba.analyse.tfidf(
                    text,
                    topK=topK * 2,  # 多提取一些，然后过滤
                    allowPOS=allowPOS
                )
            except:
                keywords_tfidf = []
            
            # 使用 TextRank
            import jieba.analyse
            keywords_textrank = jieba.analyse.textrank(
                text,
                topK=topK * 2,  # 多提取一些，然后过滤
                allowPOS=allowPOS
            )
            
            # 合并并去重
            all_keywords = list(dict.fromkeys(keywords_tfidf + keywords_textrank))
            
            # 过滤条件
            filtered_keywords = []
            # 公司后缀词，这些词不应该单独出现
            company_suffixes = {'公司', '科技', '集团', '股份', '有限', '技术', '信息', '网络', '软件', '数据', '智能'}
            for kw in all_keywords:
                # 过滤停用词
                if kw in stopwords:
                    continue
                
                # 过滤公司后缀词本身（如"公司"、"科技"）
                if kw in company_suffixes:
                    continue
                
                # 过滤以公司后缀词结尾的词（如"公司DeepSeek"、"科技公司"），除非是完整的公司名
                # 但保留"腾讯公司"、"阿里巴巴集团"这种完整的中文公司名
                if any(kw.endswith(suffix) for suffix in company_suffixes):
                    # 如果是以英文开头的词（如"DeepSeek公司"），应该被过滤
                    if re.match(r'^[A-Za-z]', kw):
                        continue
                    # 如果是纯中文且长度合理（2-6个汉字），可能是完整的公司名，保留
                    if not re.match(r'^[\u4e00-\u9fa5]{2,6}$', kw):
                        continue
                
                # 过滤太短的词（少于2个字）
                if len(kw) < 2:
                    continue
                
                # 过滤太长的词（超过10个字，可能是句子）
                if len(kw) > 10:
                    continue
                
                # 过滤纯数字
                if kw.isdigit():
                    continue
                
                # 过滤单个字符
                if len(kw.strip()) <= 1:
                    continue
                
                filtered_keywords.append(kw)
            
            # ========== 第三步：合并结果，优先使用专有名词 ==========
            # 优先使用专有名词，然后补充其他关键词
            result = []
            
            # 先添加专有名词（最多占一半）
            entity_count = min(len(entities), topK // 2 + 1)
            result.extend(entities[:entity_count])
            
            # 再添加其他关键词（避免重复）
            remaining_count = topK - len(result)
            for kw in filtered_keywords:
                if kw not in result and remaining_count > 0:
                    result.append(kw)
                    remaining_count -= 1
            
            # 返回前 topK 个
            return result[:topK] if result else []
        except Exception as e:
            logger.error(f"TextRank 提取失败: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def extract_with_keybert(
        self,
        text: str,
        topK: int = 5
    ) -> List[str]:
        """
        使用 KeyBERT 提取关键词
        
        Args:
            text: 要提取关键词的文本（可能是 HTML 格式）
            topK: 返回关键词数量
            
        Returns:
            关键词列表
        """
        if not self.keybert_available:
            logger.warning("KeyBERT 未安装，无法使用 KeyBERT 提取")
            return []
        
        # 先转换 HTML 为纯文本，避免提取到 CSS 样式等无关内容
        text = self._html_to_text(text, to_markdown=False)
        
        try:
            # 懒加载 KeyBERT 模型
            if self.keybert_model is None:
                # 检查是否启用量化（从配置读取）
                use_quantization = cfg.get("article_tag.keybert.quantization", False)
                
                try:
                    # 优先使用 sentence-transformers（KeyBERT 官方推荐方式）
                    # 根据 KeyBERT 官方文档，直接使用 SentenceTransformer 模型
                    from sentence_transformers import SentenceTransformer
                    model_name = str(self.keybert_model_name) if self.keybert_model_name else "paraphrase-multilingual-MiniLM-L12-v2"
                    model = SentenceTransformer(model_name)
                    
                    # 如果启用量化，尝试使用 float16（可以减少约50%内存）
                    if use_quantization:
                        try:
                            # 尝试将模型转换为 float16（如果支持）
                            # 注意：这需要模型支持，某些模型可能不支持
                            if hasattr(model, 'half'):
                                model = model.half()
                                logger.info("✅ 已启用模型量化（float16），内存占用减少约50%")
                            else:
                                logger.debug("模型不支持 float16 量化")
                        except Exception as e:
                            logger.debug(f"量化失败（继续使用 float32）: {e}")
                    
                    # 使用 KeyBERT 官方推荐的方式初始化
                    self.keybert_model = KeyBERT(model=model)  # type: ignore
                    logger.info(f"已加载 KeyBERT 模型（sentence-transformers）: {self.keybert_model_name}")
                except ImportError:
                    # 如果 sentence-transformers 未安装，尝试使用 Model2Vec 作为备选
                    try:
                        from model2vec import Model2Vec  # type: ignore
                        model_name = str(self.keybert_model_name) if self.keybert_model_name else "paraphrase-multilingual-MiniLM-L12-v2"
                        model = Model2Vec(model_name)
                        self.keybert_model = KeyBERT(model=model)  # type: ignore
                        logger.info(f"已加载 KeyBERT 模型（Model2Vec 备选方案）: {self.keybert_model_name}")
                        logger.warning("💡 建议安装 sentence-transformers 以获得更好的多语言支持")
                    except ImportError:
                        logger.error("KeyBERT 依赖未正确安装，请安装: pip install sentence-transformers")
                        logger.error("或安装备选方案: pip install model2vec")
                        return []
                except Exception as e:
                    logger.error(f"加载 KeyBERT 模型失败: {e}")
                    import traceback
                    traceback.print_exc()
                    return []
            
            # ========== 中文分词处理 ==========
            # KeyBERT 默认的 CountVectorizer 按空格分词，不适合中文
            # 需要自定义 CountVectorizer 并使用 jieba 分词
            import jieba
            from sklearn.feature_extraction.text import CountVectorizer
            
            # 中文停用词列表（过滤无意义的通用词）
            chinese_stopwords = [
                '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', 
                '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', 
                '自己', '这', '为', '与', '及', '或', '但', '而', '如果', '因为', '所以', '虽然',
                '但是', '然而', '同时', '此外', '另外', '而且', '并且', '以及', '还有',
                '通过', '根据', '按照', '依据', '基于', '由于', '因此', '从而', '使得', '导致',
                '可以', '能够', '应该', '必须', '需要', '将会', '已经', '正在', '进行',
                '认为', '表示', '指出', '强调', '透露', '发布', '宣布',
                # 通用词
                '权威', '双语', '中文', '英文', '中英文', '能力', '理解', '突出', 
                '模型', '公司', '今天', '官方', '数据', '多个', '领域', '方面',
                '得分', '测试', '参数', '系统', '进入', '达到', '超过', '提升'
            ]
            
            # 自定义 tokenizer：使用 jieba 分词，同时保留英文单词
            def chinese_tokenizer(text):
                """
                智能分词器：同时处理中文和英文
                - 中文使用 jieba 分词
                - 英文单词保持完整（不拆分）
                """
                import re
                # 先使用 jieba 分词
                tokens = list(jieba.cut(text))
                result = []
                for token in tokens:
                    token = token.strip()
                    if not token:
                        continue
                    # 如果 token 是纯英文单词（可能包含数字、连字符、下划线），直接保留
                    if re.match(r'^[A-Za-z0-9\-_]+$', token):
                        result.append(token.lower())  # 英文统一转为小写
                    # 如果是中文或中英文混合，保留原样
                    elif re.search(r'[\u4e00-\u9fa5]', token):
                        result.append(token)
                    # 过滤掉纯标点符号
                    elif not re.match(r'^[^\w\u4e00-\u9fa5]+$', token):
                        result.append(token)
                return result
            
            # 创建自定义的 CountVectorizer
            # ngram_range=(1, 3): 提取 1-3 个词的组合，支持更长的短语
            # tokenizer: 使用智能分词器（jieba + 英文单词保留）
            vectorizer = CountVectorizer(
                ngram_range=(1, 2),  # 1-3个词的短语，支持更长的关键词组合
                tokenizer=chinese_tokenizer,
                stop_words=chinese_stopwords,
                max_features=1000  # 限制特征数量
            )
            
            logger.debug(f"标准-使用自定义 CountVectorizer 进行中文分词")
            
            # 使用 KeyBERT 提取关键词
            keywords = self.keybert_model.extract_keywords(
                text,  # 直接传入原始文本，vectorizer 会处理分词
                vectorizer=vectorizer,  # 使用自定义的 vectorizer
                top_n=topK * 5,  # 多提取一些，然后严格过滤
                use_mmr=True,  # 使用最大边际相关性，提高多样性
                diversity=0.7  # 提高多样性参数，避免重复
            )
            
            # 提取关键词文本（KeyBERT 返回的是 (keyword, score) 元组）
            result = []
            import re
            
            logger.debug(f"KeyBERT 标准方案返回候选: {[kw for kw, _ in keywords]}")
            
            for item in keywords:
                # 处理 KeyBERT 返回的元组
                if isinstance(item, tuple) and len(item) >= 2:
                    kw, score = item[0], item[1]
                else:
                    kw, score = item, 0.0
                
                if not kw:
                    continue
                kw = str(kw).strip()
                
                # 去除空格（分词产生的）
                kw = kw.replace(' ', '')
                if not kw or len(kw) < 2:
                    logger.debug(f"标准-过滤（太短）: {kw}")
                    continue
                
                # 判断是否为英文词（主要包含英文字母）
                is_english = bool(re.match(r'^[A-Za-z0-9\-_]+$', kw))
                has_chinese = bool(re.search(r'[\u4e00-\u9fa5]', kw))
                
                # 对于长度过滤，区分中文和英文：
                # - 中文词：2-8个字符（按字符数计算）
                # - 英文词：2-20个字符（英文单词可能较长，如 "jetbrains" 是10个字符）
                # - 中英文混合：2-12个字符
                if has_chinese:
                    # 包含中文，按中文字符数限制（2-8个字符）
                    if len(kw) > 8:
                        logger.debug(f"标准-过滤（太长，中文词）: {kw}")
                        continue
                elif is_english:
                    # 纯英文词，允许更长的长度（2-20个字符）
                    if len(kw) > 20:
                        logger.debug(f"标准-过滤（太长，英文词）: {kw}")
                        continue
                    # 英文词至少2个字符
                    if len(kw) < 2:
                        logger.debug(f"标准-过滤（太短，英文词）: {kw}")
                        continue
                else:
                    # 其他情况（如纯数字、特殊字符等），使用默认限制
                    if len(kw) > 12:
                        logger.debug(f"标准-过滤（太长，其他）: {kw}")
                        continue
                
                # 过滤包含标点符号的关键词（包括中英文标点、括号等）
                # 但允许英文词中的连字符和下划线（如 "DeepSeek-V3", "GPT_4"）
                if is_english:
                    # 英文词：只过滤常见标点，但保留连字符和下划线
                    if re.search(r'[，。、；：！？,\.;:!?（）【】《》""''「」『』]', kw):
                        logger.debug(f"标准-过滤（标点，英文词）: {kw}")
                        continue
                else:
                    # 中文词或其他：过滤所有标点符号
                    if re.search(r'[，。、；：！？,\.;:!?（）【】《》""''「」『』]', kw):
                        logger.debug(f"标准-过滤（标点）: {kw}")
                        continue
                
                # 过滤纯数字
                if kw.isdigit():
                    logger.debug(f"标准-过滤（纯数字）: {kw}")
                    continue
                
                # 过滤包含数字和汉字混合的短语（如"得分92"）
                # 但允许纯英文+数字（如 GPT-4、H200）
                if re.search(r'[\u4e00-\u9fa5].*\d|\d.*[\u4e00-\u9fa5]', kw):
                    logger.debug(f"标准-过滤（中文数字混合）: {kw}")
                    continue
                
                # 过滤停用词本身和通用词
                if kw in chinese_stopwords:
                    logger.debug(f"标准-过滤（停用词）: {kw}")
                    continue
                
                # 过滤通用动词和形容词（这些通常不是好的标签）
                generic_words = {
                    '竞争', '优势', '参与者', '投资', '推出', '发布', '阳谋',
                    '时代', '领域', '方面', '方式', '特点', '优点', '缺点',
                    '提供', '建立', '形成', '推进', '加速', '降低', '硬件'
                }
                if kw in generic_words:
                    logger.debug(f"标准-过滤（通用词）: {kw}")
                    continue
                
                # 保留结果
                result.append(kw)
                logger.debug(f"标准-保留: {kw} (score: {score:.4f})")
            
            # 返回前 topK 个
            return result[:topK] if result else []
            
        except Exception as e:
            logger.error(f"KeyBERT 提取失败: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def extract_with_keybert_hybrid(
        self,
        text: str,
        topK: int = 5
    ) -> List[str]:
        """
        使用 KeyBERT 提取关键词（混合方案：结合 TextRank 实体提取）
        先使用 TextRank 提取候选实体，再用 KeyBERT 进行语义排序
        
        Args:
            text: 要提取关键词的文本（可能是 HTML 格式）
            topK: 返回关键词数量
            
        Returns:
            关键词列表
        """
        if not self.keybert_available:
            logger.warning("KeyBERT 未安装，无法使用 KeyBERT 提取")
            return []
        
        # 先转换 HTML 为纯文本，避免提取到 CSS 样式等无关内容
        text = self._html_to_text(text, to_markdown=False)
        
        try:
            # 确保模型已加载
            if self.keybert_model is None:
                # 复用现有的模型加载逻辑
                use_quantization = cfg.get("article_tag.keybert.quantization", False)
                
                try:
                    # 优先使用 sentence-transformers（KeyBERT 官方推荐方式）
                    from sentence_transformers import SentenceTransformer
                    model_name = str(self.keybert_model_name) if self.keybert_model_name else "paraphrase-multilingual-MiniLM-L12-v2"
                    model = SentenceTransformer(model_name)
                    
                    # 如果启用量化，尝试使用 float16
                    if use_quantization:
                        try:
                            if hasattr(model, 'half'):
                                model = model.half()
                                logger.info("✅ 已启用模型量化（float16）")
                        except Exception as e:
                            logger.debug(f"量化失败: {e}")
                    
                    self.keybert_model = KeyBERT(model=model)  # type: ignore
                    logger.info(f"已加载 KeyBERT 模型（sentence-transformers）: {self.keybert_model_name}")
                except ImportError:
                    # 如果 sentence-transformers 未安装，尝试使用 Model2Vec 作为备选
                    try:
                        from model2vec import Model2Vec  # type: ignore
                        model_name = str(self.keybert_model_name) if self.keybert_model_name else "paraphrase-multilingual-MiniLM-L12-v2"
                        model = Model2Vec(model_name)
                        self.keybert_model = KeyBERT(model=model)  # type: ignore
                        logger.info(f"已加载 KeyBERT 模型（Model2Vec 备选方案）: {self.keybert_model_name}")
                        logger.warning("💡 建议安装 sentence-transformers 以获得更好的多语言支持")
                    except ImportError:
                        logger.error("KeyBERT 依赖未正确安装，请安装: pip install sentence-transformers")
                        return []
                except Exception as e:
                    logger.error(f"加载 KeyBERT 模型失败: {e}")
                    import traceback
                    traceback.print_exc()
                    return []
            
            # ========== 第一步：先用 TextRank 提取候选实体 ==========
            import jieba.posseg as pseg
            import re
            
            entities = []
            
            # 提取专有名词和实体
            words = pseg.cut(text)
            for word, flag in words:
                # nr: 人名, nt: 机构名（公司名）, nz: 其他专名
                if flag in ['nr', 'nt', 'nz']:
                    if len(word) >= 2 and len(word) <= 10:
                        entities.append(word)
            
            # 提取英文专有名词
            english_entities = re.findall(r'([A-Z][a-zA-Z0-9]+(?:\-[A-Z][a-zA-Z0-9]+)?)', text)
            for entity in english_entities:
                if 2 <= len(entity) <= 20 and not entity.isdigit():
                    if entity.lower() not in ['ai', 'pr', 'it', 'id', 'url', 'api']:
                        entities.append(entity)
            
            # 提取短语（2-3个词的组合）
            phrases = self._extract_phrases(text)
            entities.extend(phrases)
            
            # 去重
            candidates = list(dict.fromkeys(entities))
            
            if not candidates:
                # 如果没有候选实体，回退到标准 KeyBERT 方法
                logger.debug("未找到候选实体，回退到标准 KeyBERT 提取")
                return self.extract_with_keybert(text, topK)
            
            # ========== 第二步：使用 KeyBERT 对候选实体进行语义排序 ==========
            import jieba
            from sklearn.feature_extraction.text import CountVectorizer
            
            logger.debug(f"混合-候选实体: {candidates[:20]}")
            
            # 自定义 tokenizer：使用 jieba 分词，同时保留英文单词
            def chinese_tokenizer(text):
                """
                智能分词器：同时处理中文和英文
                - 中文使用 jieba 分词
                - 英文单词保持完整（不拆分）
                """
                import re
                # 先使用 jieba 分词
                tokens = list(jieba.cut(text))
                result = []
                for token in tokens:
                    token = token.strip()
                    if not token:
                        continue
                    # 如果 token 是纯英文单词（可能包含数字、连字符、下划线），直接保留
                    if re.match(r'^[A-Za-z0-9\-_]+$', token):
                        result.append(token.lower())  # 英文统一转为小写
                    # 如果是中文或中英文混合，保留原样
                    elif re.search(r'[\u4e00-\u9fa5]', token):
                        result.append(token)
                    # 过滤掉纯标点符号
                    elif not re.match(r'^[^\w\u4e00-\u9fa5]+$', token):
                        result.append(token)
                return result
            
            # 创建自定义的 CountVectorizer
            vectorizer = CountVectorizer(
                ngram_range=(1, 2),
                tokenizer=chinese_tokenizer,
                max_features=1000
            )
            
            # 使用 KeyBERT 计算每个候选实体的语义重要性
            try:
                keywords_with_scores = self.keybert_model.extract_keywords(
                    text,  # 直接传入原始文本
                    candidates=candidates,  # 只从候选实体中选择
                    vectorizer=vectorizer,  # 使用自定义 vectorizer
                    top_n=topK * 2,
                    use_mmr=True,
                    diversity=0.7
                )
            except (TypeError, AttributeError):
                # 如果 KeyBERT 版本不支持 candidates 参数，使用备选方法
                logger.debug("KeyBERT 版本不支持 candidates 参数，使用备选方法")
                return self.extract_with_keybert(text, topK)
            
            # ========== 第三步：过滤 ==========
            result = []
            
            # 停用词和不合适的通用词
            chinese_stopwords = {
                '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', 
                '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', 
                '自己', '这', '为', '与', '及', '或', '但', '而', '如果', '因为', '所以', '虽然',
                '但是', '然而', '同时', '此外', '另外', '而且', '并且', '以及', '还有',
                '通过', '根据', '按照', '依据', '基于', '由于', '因此', '从而', '使得', '导致',
                '可以', '能够', '应该', '必须', '需要', '将会', '已经', '正在', '进行',
                '认为', '表示', '指出', '强调', '透露', '发布', '宣布',
                # 通用词
                '权威', '双语', '中文', '英文', '中英文', '能力', '理解', '突出', 
                '模型', '公司', '今天', '官方', '数据', '多个', '领域', '方面'
            }
            
            logger.debug(f"KeyBERT 返回候选关键词: {[kw for kw, _ in keywords_with_scores]}")
            
            for item in keywords_with_scores:
                # 处理 KeyBERT 返回的元组
                if isinstance(item, tuple) and len(item) >= 2:
                    kw, score = item[0], item[1]
                else:
                    kw, score = item, 0.0
                
                if not kw:
                    continue
                kw = str(kw).strip()
                
                # 去除空格（分词产生的）
                kw = kw.replace(' ', '')
                if not kw or len(kw) < 2:
                    logger.debug(f"混合-过滤（去空格后太短）: {kw}")
                    continue
                
                # 判断是否为英文词（主要包含英文字母）
                is_english = bool(re.match(r'^[A-Za-z0-9\-_]+$', kw))
                has_chinese = bool(re.search(r'[\u4e00-\u9fa5]', kw))
                
                # 对于长度过滤，区分中文和英文：
                # - 中文词：2-12个字符（按字符数计算）
                # - 英文词：2-25个字符（英文单词可能较长，如 "jetbrains"、"DeepSeek-V3"）
                # - 中英文混合：2-15个字符
                if has_chinese:
                    # 包含中文，按中文字符数限制（2-12个字符）
                    if len(kw) > 12:
                        logger.debug(f"混合-过滤（太长，中文词）: {kw}")
                        continue
                elif is_english:
                    # 纯英文词，允许更长的长度（2-25个字符，允许如 "DeepSeek-V3" 这样的词）
                    if len(kw) > 25:
                        logger.debug(f"混合-过滤（太长，英文词）: {kw}")
                        continue
                else:
                    # 其他情况，使用默认限制（15个字符）
                    if len(kw) > 15:
                        logger.debug(f"混合-过滤（太长，其他）: {kw}")
                        continue
                
                # 过滤包含标点符号的关键词（包括中英文标点、括号等）
                # 但允许英文词中的连字符和下划线（如 "DeepSeek-V3", "GPT_4"）
                if is_english:
                    # 英文词：只过滤常见标点，但保留连字符和下划线
                    if re.search(r'[，。、；：！？,\.;:!?（）【】《》""''「」『』]', kw):
                        logger.debug(f"混合-过滤（标点，英文词）: {kw}")
                        continue
                else:
                    # 中文词或其他：过滤所有标点符号
                    if re.search(r'[，。、；：！？,\.;:!?（）【】《》""''「」『』]', kw):
                        logger.debug(f"混合-过滤（标点）: {kw}")
                        continue
                
                # 过滤纯数字
                if kw.isdigit():
                    logger.debug(f"混合-过滤（纯数字）: {kw}")
                    continue
                
                # 过滤停用词本身和通用词
                if kw in chinese_stopwords:
                    logger.debug(f"混合-过滤（停用词）: {kw}")
                    continue
                
                # 保留结果
                result.append(kw)
                logger.debug(f"混合-保留: {kw} (score: {score:.4f})")
            
            # 返回前 topK 个
            return result[:topK] if result else []
            
        except Exception as e:
            logger.error(f"KeyBERT 混合提取失败: {e}")
            import traceback
            traceback.print_exc()
            # 失败时回退到标准方法
            return self.extract_with_keybert(text, topK)
    
    async def extract_with_ai(
        self,
        title: str,
        description: str = "",
        content: str = "",
        max_tags: int = 3
    ) -> List[str]:
        """
        使用 OpenAI API 提取标签关键词
        
        Args:
            title: 文章标题
            description: 文章描述
            content: 文章内容（可能是 HTML 格式）
            max_tags: 最大标签数量
            
        Returns:
            标签关键词列表
        """
        if not self.ai_client:
            logger.warning("OpenAI API 未配置，无法使用 AI 提取")
            return []
        
        # 处理 HTML 内容：转换为纯文本，避免提取到 CSS 样式等无关内容
        def html_to_text(html_content: str) -> str:
            """将 HTML 内容转换为纯文本"""
            if not html_content:
                return html_content
            try:
                from bs4 import BeautifulSoup
                import re
                # 检查是否包含 HTML 标签
                if '<' in html_content and '>' in html_content:
                    # 去除 HTML 标签，提取纯文本
                    soup = BeautifulSoup(html_content, 'html.parser')
                    # 移除 script 和 style 标签及其内容（这些可能包含 CSS 样式）
                    for script in soup(["script", "style"]):
                        script.decompose()
                    # 移除所有元素的内联样式属性，避免提取到 font-family 等样式信息
                    from bs4 import Tag
                    for tag in soup.find_all(True):
                        # 类型检查：确保是 Tag 对象而不是 NavigableString
                        if isinstance(tag, Tag):
                            # 移除 style 属性（可能包含 font-family: Helvetica 等）
                            if 'style' in tag.attrs:
                                del tag.attrs['style']
                            # 移除 class 属性（可能包含字体相关的类名）
                            if 'class' in tag.attrs:
                                del tag.attrs['class']
                    # 获取纯文本
                    text = soup.get_text(separator=' ', strip=True)
                    # 清理多余的空白字符
                    text = re.sub(r'\s+', ' ', text)
                    # 过滤掉常见的字体名称（避免被提取为标签）
                    font_names = ['Helvetica', 'Arial', 'Times New Roman', 'Courier New', 
                                 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman',
                                 'Comic Sans MS', 'Trebuchet MS', 'Impact', 'Lucida Console',
                                 'Tahoma', 'Courier', 'Monaco', 'Menlo', 'Consolas',
                                 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro']
                    for font in font_names:
                        # 使用单词边界匹配，避免误删包含这些词的正常文本
                        text = re.sub(r'\b' + re.escape(font) + r'\b', '', text, flags=re.IGNORECASE)
                    # 再次清理多余的空白字符
                    text = re.sub(r'\s+', ' ', text).strip()
                    return text
                return html_content
            except Exception as e:
                logger.warning(f"HTML 解析失败，使用原始内容: {e}")
                return html_content
        
        # 处理 content 和 description
        if content:
            content = html_to_text(content)
        if description:
            description = html_to_text(description)
        
        # 构建输入文本
        text = f"标题：{title}\n"
        if description:
            text += f"描述：{description}\n"
        if content:
            # 截取前2000字符避免太长
            text += f"内容：{content[:2000]}"
        
        prompt = f"""请从以下文章中提取 {max_tags} 个最核心的**具体**标签关键词。

【提取优先级（按重要性排序）】：
1. **公司名称**：文章中提到的所有公司、企业、组织名称（如：字节跳动、腾讯、阿里巴巴、OpenAI、Anthropic、英伟达、华为、小米等）
2. **产品/服务名称**：具体的产品、服务、平台名称（如：ChatGPT、Claude、豆包、微信、抖音、iOS、Android等）
3. **技术/工具名称**：具体的技术、框架、工具、协议名称（如：React、TensorFlow、Kubernetes、HTTP/3等）
4. **人物名称**：科技界、商业界的重要人物（如：马斯克、李彦宏、张一鸣等）
5. **特定事件/项目**：具体的项目、事件、活动名称（如：诺贝尔奖、登月计划等）
6. **特定领域/概念**：具体的细分领域或专业概念（如：自动驾驶、量子计算、区块链等）

【重要要求】：
1. **必须提取公司名称**：如果文章提到公司，公司名称必须包含在标签中
2. 标签词必须**具体且有区分度**，避免通用词汇
3. 避免提取：AI、大语言模型、云计算、机器学习、技术、产品等过于宽泛的词
4. 每个标签词 2-15 个字（公司名称可以更长）
5. 按重要性排序（公司名称通常最重要）
6. 只返回 JSON 数组格式，不要包含任何解释或思考过程

【好的示例】：
- 好："字节跳动"、"豆包视频"、"Seedance 1.5"、"火山引擎"、"Anthropic"、"Claude"、"诺贝尔奖"、"Crossplane"、"快手OneRec"、"李彦宏"、"DeepSeek"、"英伟达"、"NVIDIA"
- 差："AI"、"大语言模型"、"云计算"、"人工智能"、"技术"、"产品"、"公司"

文章：
{text}

返回格式：["具体标签1", "具体标签2", "具体标签3"]"""

        try:
            import json
            
            # 检查是否是 Qwen3 模型，如果是则禁用思考功能
            # DeepSeek 模型不需要处理（不会有思考过程问题）
            model_name_lower = str(self.ai_model).lower() if self.ai_model else ""
            is_qwen3 = "qwen3" in model_name_lower or (
                "qwen" in model_name_lower and "3" in model_name_lower
            )
            
            # 构建 API 调用参数
            api_params = {
                "model": self.ai_model,
                "messages": [
                    {"role": "system", "content": "你是一个专业的文章标签分析专家，用于热点主题聚类。必须优先提取公司名称、产品名称、技术名称等具体实体，避免宽泛的通用词汇。如果文章提到公司，公司名称必须包含在标签中。只返回 JSON 格式的标签数组，不要包含任何解释。"},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 300,  # 增加token限制，确保能提取更多标签
            }
            
            # 如果是 Qwen3 模型，添加禁用思考的参数
            if is_qwen3:
                api_params["extra_body"] = {
                    "chat_template_kwargs": {
                        "enable_thinking": False
                    }
                }
            
            response = await self.ai_client.chat.completions.create(**api_params)
            
            result = response.choices[0].message.content
            if result is None:
                logger.error("AI 返回内容为空")
                return []
            result = result.strip()
            
            # 处理可能包含 reasoning 标签的情况（如 o1 系列模型）
            import re
            original_result = result  # 保存原始结果用于错误日志
            
            # 移除各种 reasoning 标签及其内容（包括没有闭合标签的情况）
            reasoning_patterns = [
                r'<think>.*?</think>',
                r'<thinking>.*?</thinking>',
                r'<reasoning>.*?</reasoning>',
                r'<think>.*?</think>',
                # 处理没有闭合标签的情况（匹配到文件末尾或下一个标签）
                r'<think>.*?(?=\[|$)',
                r'<thinking>.*?(?=\[|$)',
                r'<reasoning>.*?(?=\[|$)',
                r'<think>.*?(?=\[|$)',
            ]
            for pattern in reasoning_patterns:
                result = re.sub(pattern, '', result, flags=re.DOTALL)
            result = result.strip()
            
            # 如果移除标签后结果为空，尝试从原始结果中提取 JSON
            if not result:
                result = original_result
            
            # 尝试直接解析 JSON
            try:
                tags = json.loads(result)
                if isinstance(tags, list) and len(tags) > 0:
                    return tags[:max_tags]
            except json.JSONDecodeError:
                pass
            
            # 如果直接解析失败，尝试提取所有可能的 JSON 数组
            # 使用更宽松的正则表达式匹配 JSON 数组（包括嵌套和转义字符）
            json_array_pattern = r'\[(?:[^\[\]]+|\[[^\]]*\])*\]'
            matches = list(re.finditer(json_array_pattern, result, re.DOTALL))
            if not matches:
                # 如果没找到，尝试更简单的模式
                matches = list(re.finditer(r'\[.*?\]', result, re.DOTALL))
            
            if matches:
                # 从后往前尝试（通常最后的 JSON 是最终答案）
                for match in reversed(matches):
                    try:
                        candidate = match.group()
                        tags = json.loads(candidate)
                        if isinstance(tags, list) and len(tags) > 0:
                            # 验证标签格式：应该是字符串列表
                            if all(isinstance(tag, str) and len(tag.strip()) > 0 for tag in tags):
                                return tags[:max_tags]
                    except (json.JSONDecodeError, AttributeError):
                        continue
            
            # 如果还是失败，尝试查找包含引号的数组模式（更宽松）
            # 匹配类似 ["tag1", "tag2", "tag3"] 的模式
            quoted_array_pattern = r'\[(?:"[^"]*"(?:\s*,\s*"[^"]*")*)?\]'
            matches = list(re.finditer(quoted_array_pattern, result, re.DOTALL))
            if matches:
                for match in reversed(matches):
                    try:
                        tags = json.loads(match.group())
                        if isinstance(tags, list) and len(tags) > 0:
                            return tags[:max_tags]
                    except:
                        continue
            
            logger.error(f"AI 提取 JSON 解析失败，原始响应前500字符: {original_result[:500]}")
            return []
        except Exception as e:
            logger.error(f"AI 提取失败: {e}")
            return []
    
    def extract(
        self,
        title: str,
        description: str = "",
        content: str = "",
        method: str = "textrank"
    ) -> List[str]:
        """
        统一接口，根据配置选择提取方式（同步版本）
        
        Args:
            title: 文章标题
            description: 文章描述
            content: 文章内容（可能是 HTML 格式）
            method: 提取方式，'textrank'（TextRank）、'keybert'（KeyBERT）或 'ai'（OpenAI API）
            
        Returns:
            标签关键词列表
        """
        # 处理 HTML 内容：转换为纯文本，避免提取到 CSS 样式等无关内容
        def html_to_text(html_content: str) -> str:
            """将 HTML 内容转换为纯文本"""
            if not html_content:
                return html_content
            try:
                from bs4 import BeautifulSoup
                import re
                # 检查是否包含 HTML 标签
                if '<' in html_content and '>' in html_content:
                    # 去除 HTML 标签，提取纯文本
                    soup = BeautifulSoup(html_content, 'html.parser')
                    # 移除 script 和 style 标签及其内容（这些可能包含 CSS 样式）
                    for script in soup(["script", "style"]):
                        script.decompose()
                    # 移除所有元素的内联样式属性，避免提取到 font-family 等样式信息
                    from bs4 import Tag
                    for tag in soup.find_all(True):
                        # 类型检查：确保是 Tag 对象而不是 NavigableString
                        if isinstance(tag, Tag):
                            # 移除 style 属性（可能包含 font-family: Helvetica 等）
                            if 'style' in tag.attrs:
                                del tag.attrs['style']
                            # 移除 class 属性（可能包含字体相关的类名）
                            if 'class' in tag.attrs:
                                del tag.attrs['class']
                    # 获取纯文本
                    text = soup.get_text(separator=' ', strip=True)
                    # 清理多余的空白字符
                    text = re.sub(r'\s+', ' ', text)
                    # 过滤掉常见的字体名称（避免被提取为标签）
                    font_names = ['Helvetica', 'Arial', 'Times New Roman', 'Courier New', 
                                 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman',
                                 'Comic Sans MS', 'Trebuchet MS', 'Impact', 'Lucida Console',
                                 'Tahoma', 'Courier', 'Monaco', 'Menlo', 'Consolas',
                                 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro']
                    for font in font_names:
                        # 使用单词边界匹配，避免误删包含这些词的正常文本
                        text = re.sub(r'\b' + re.escape(font) + r'\b', '', text, flags=re.IGNORECASE)
                    # 再次清理多余的空白字符
                    text = re.sub(r'\s+', ' ', text).strip()
                    return text
                return html_content
            except Exception as e:
                logger.warning(f"HTML 解析失败，使用原始内容: {e}")
                return html_content
        
        # 处理 content 和 description
        if content:
            content = html_to_text(content)
        if description:
            description = html_to_text(description)
        
        # 合并文本用于 TextRank
        # 标题权重更高：重复3次标题以提高其在TextRank中的权重
        text = f"{title} {title} {title} {description}"
        if content:
            text += f" {content[:1000]}"  # 限制长度
        
        if method == "textrank":
            # 获取配置
            topK_raw = cfg.get("article_tag.max_tags", 5)
            topK = int(topK_raw) if isinstance(topK_raw, (int, float, str)) else 5
            allow_pos_str_raw = cfg.get("article_tag.textrank.allow_pos", "n,nz")
            allow_pos_str = str(allow_pos_str_raw) if allow_pos_str_raw else "n,nz"
            allow_pos = tuple(pos.strip() for pos in allow_pos_str.split(","))
            
            return self.extract_with_textrank(text, topK=topK, allowPOS=allow_pos)
        elif method == "keybert":
            # KeyBERT 提取
            topK_raw = cfg.get("article_tag.max_tags", 5)
            topK = int(topK_raw) if isinstance(topK_raw, (int, float, str)) else 5
            # 检查是否使用混合方案（结合 TextRank 实体提取）
            use_hybrid = cfg.get("article_tag.keybert.hybrid", False)
            if use_hybrid:
                return self.extract_with_keybert_hybrid(text, topK=topK)
            else:
                return self.extract_with_keybert(text, topK=topK)
        elif method == "ai":
            # AI 提取是异步的，在同步上下文中调用
            logger.warning("AI 提取需要在异步上下文中调用，请使用 extract_with_ai 方法")
            return []
        else:
            logger.warning(f"未知的提取方式: {method}，使用 textrank")
            return self.extract_with_textrank(text)


def get_tag_extractor() -> TagExtractor:
    """
    获取全局单例的 TagExtractor 实例
    这样可以确保模型常驻内存，避免重复加载
    
    Returns:
        TagExtractor 实例（全局单例）
    """
    global _global_extractor
    if _global_extractor is None:
        _global_extractor = TagExtractor()
        
        # 与 db.py / config.example.yaml 一致：默认 ai，避免日志误报为 TextRank
        extract_method = str(
            cfg.get("article_tag.extract_method", "ai", silent=True) or "ai"
        ).strip().lower()

        if extract_method == "ai" and _global_extractor.ai_client is not None:
            logger.info("已创建全局 TagExtractor 实例，使用 AI 提取（OpenAI 兼容 API）")
        elif extract_method == "ai" and _global_extractor.ai_client is None:
            logger.info(
                "已创建全局 TagExtractor 实例，配置为 AI 但未检测到可用 API 客户端，"
                "实际提取时将回退 TextRank/KeyBERT"
            )
        elif extract_method == "keybert" and _global_extractor.keybert_available:
            logger.info("已创建全局 TagExtractor 实例，KeyBERT 模型将在首次使用时加载")
        else:
            logger.info(
                f"已创建全局 TagExtractor 实例，extract_method={extract_method!r}，使用 TextRank 提取"
            )
    else:
        # 如果实例已存在，但 AI 客户端未初始化，尝试重新初始化
        if AI_AVAILABLE and _global_extractor.ai_client is None:
            load_dev_env_if_needed()
            # 提供默认值 None，silent=True 避免输出警告（如果配置文件中没有这些项，会从环境变量读取）
            api_key_raw = cfg.get("openai.api_key", None, silent=True) or os.getenv("OPENAI_API_KEY", "")
            if api_key_raw:
                base_url_raw = cfg.get("openai.base_url", None, silent=True) or os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
                model_raw = cfg.get("openai.model", None, silent=True) or os.getenv("OPENAI_MODEL", "gpt-4o")
                # 确保类型为字符串
                api_key = str(api_key_raw) if api_key_raw else ""
                base_url = str(base_url_raw) if base_url_raw else "https://api.openai.com/v1"
                model = str(model_raw) if model_raw else "gpt-4o"
                _global_extractor.ai_client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=base_url,
                )
                _global_extractor.ai_model = model
                logger.info(f"已重新初始化 OpenAI API 客户端，模型: {model}")
    return _global_extractor

