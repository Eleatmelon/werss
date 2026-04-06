import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
} from '@/components/ui/sidebar'
import { FileText, Rss, Tag, Bell, Settings, Info, LayoutDashboard, GalleryVerticalEnd, Key } from 'lucide-react'
import { NavMain } from '@/components/nav-main'

const Navbar: React.FC = () => {
  const { t } = useTranslation()
  // 开发环境使用 public 目录下的文件，生产环境使用后端静态文件服务
  const logo = import.meta.env.DEV ? '/logo.svg' : '/static/logo.svg'
  const appTitle = import.meta.env.VITE_APP_TITLE || '微信公众号热度分析系统'

  const menuItems = [
    {
      title: t('layout.dashboard'),
      url: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: t('layout.articles'),
      url: '/articles',
      icon: FileText,
    },
    {
      title: t('layout.subscriptions'),
      url: '/subscriptions',
      icon: Rss,
    },
    {
      title: t('layout.exportRecords'),
      url: '/export/records',
      icon: FileText,
    },
    {
      title: t('layout.tags'),
      url: '/tags',
      icon: Tag,
    },
    {
      title: t('layout.messageTasks'),
      url: '/message-tasks',
      icon: Bell,
    },
    {
      title: t('layout.configs'),
      url: '/configs',
      icon: Settings,
    },
    {
      title: t('layout.sysInfo'),
      url: '/sys-info',
      icon: Info,
    },
    {
      title: t('layout.apiKeys'),
      url: '/api-keys',
      icon: Key,
    }
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" className="flex items-center gap-3">
                {logo ? (
                  <img 
                    src={logo} 
                    alt={appTitle} 
                    className="h-8 w-8 rounded-md object-contain flex-shrink-0" 
                  />
                ) : (
                  <div className="h-8 w-8 rounded-md bg-sidebar-primary flex items-center justify-center flex-shrink-0">
                    <GalleryVerticalEnd className="h-4 w-4 text-sidebar-primary-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-0.5 leading-none min-w-0">
                  <span className="font-semibold truncate">{appTitle}</span>
                  <span className="text-xs text-muted-foreground">v1.0.0</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={menuItems} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

export default Navbar
