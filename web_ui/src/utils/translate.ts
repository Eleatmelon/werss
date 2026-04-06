import i18n, { mapLanguageCode, reverseMapLanguageCode } from '@/i18n/config'

// 语言代码映射：将旧的语言代码映射到新的 i18next 语言代码
const languageMap: Record<string, string> = {
  'chinese_simplified': 'zh-CN',
  'chinese_traditional': 'zh-TW',
  'english': 'en',
  '': 'zh-CN' // 默认使用简体中文
}

/**
 * 翻译页面（已废弃，现在使用 react-i18next 自动处理）
 * 保留此函数以保持向后兼容
 */
export const translatePage = () => {
  const savedLanguage = localStorage.getItem("language");
  if (savedLanguage) {
    const newLanguage = mapLanguageCode(savedLanguage);
    i18n.changeLanguage(newLanguage);
  }
};

/**
 * 设置当前语言
 * @param language 语言代码（旧格式：chinese_simplified, chinese_traditional, english 或空字符串）
 */
export const setCurrentLanguage = (language: string) => {
  // 将旧的语言代码转换为新的 i18next 语言代码
  const newLanguage = mapLanguageCode(language);
  i18n.changeLanguage(newLanguage);
  // 保存原始语言代码到 localStorage（保持向后兼容）
  localStorage.setItem("language", language);
};

/**
 * 获取当前语言（返回旧格式的语言代码）
 */
export const getCurrentLanguage = (): string => {
  const currentLang = i18n.language;
  // 反向映射到旧的语言代码
  const entries = Object.entries(languageMap);
  const found = entries.find(([_, value]) => value === currentLang);
  return found ? found[0] : 'chinese_simplified';
};
