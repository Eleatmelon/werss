import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'

// 语言代码映射：将旧的语言代码映射到新的 i18next 语言代码
const languageMap: Record<string, string> = {
  'chinese_simplified': 'zh-CN',
  'chinese_traditional': 'zh-TW',
  'english': 'en',
  '': 'zh-CN' // 默认使用简体中文
}

// 从 localStorage 获取保存的语言，并映射到新的语言代码
const getSavedLanguage = (): string => {
  const saved = localStorage.getItem('language')
  if (!saved) return 'zh-CN'
  return languageMap[saved] || 'zh-CN'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': {
        translation: zhCN
      },
      'zh-TW': {
        translation: zhTW
      },
      'en': {
        translation: en
      }
    },
    lng: getSavedLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false
    }
  })

// 导出语言映射函数，用于在组件中转换语言代码
export const mapLanguageCode = (oldCode: string): string => {
  return languageMap[oldCode] || 'zh-CN'
}

// 导出反向映射函数，用于保存语言代码
export const reverseMapLanguageCode = (newCode: string): string => {
  const entries = Object.entries(languageMap)
  const found = entries.find(([_, value]) => value === newCode)
  return found ? found[0] : 'chinese_simplified'
}

export default i18n

