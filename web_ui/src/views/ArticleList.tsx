import React, { useState, useEffect } from 'react'
import ArticleListDesktop from './article/ArticleListDesktop'
import ArticleListMobile from './article/ArticleListMobile'

const ArticleList: React.FC = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile ? <ArticleListMobile /> : <ArticleListDesktop />
}

export default ArticleList
