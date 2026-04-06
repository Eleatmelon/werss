import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// 主题类型
export type Theme = 'dark' | 'light' | 'system'

// Sidebar 状态类型
export type SidebarState = 'expanded' | 'collapsed'

// 应用状态接口
interface AppState {
  // 主题相关
  theme: Theme
  setTheme: (theme: Theme) => void
  
  // Sidebar 相关
  sidebarOpen: boolean
  sidebarState: SidebarState
  setSidebarOpen: (open: boolean) => void
  setSidebarState: (state: SidebarState) => void
  toggleSidebar: () => void
  
  // 移动端 Sidebar
  sidebarOpenMobile: boolean
  setSidebarOpenMobile: (open: boolean) => void
  toggleSidebarMobile: () => void
}

// 应用主题到 DOM 的辅助函数
const applyTheme = (theme: Theme) => {
  if (typeof window === 'undefined') return
  
  const root = window.document.documentElement
  const body = window.document.body
  
  root.classList.remove('light', 'dark')
  root.removeAttribute('data-theme')
  body.classList.remove('dark-mode')
  
  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    
    root.classList.add(systemTheme)
    if (systemTheme === 'dark') {
      root.setAttribute('data-theme', 'dark')
      body.classList.add('dark-mode')
    }
  } else {
    root.classList.add(theme)
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark')
      body.classList.add('dark-mode')
    }
  }
}

// 创建 store
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 主题状态
      theme: 'system',
      setTheme: (theme: Theme) => {
        set({ theme })
        applyTheme(theme)
      },
      
      // Sidebar 状态
      sidebarOpen: true,
      sidebarState: 'expanded',
      setSidebarOpen: (open: boolean) => {
        set({ 
          sidebarOpen: open,
          sidebarState: open ? 'expanded' : 'collapsed'
        })
      },
      setSidebarState: (state: SidebarState) => {
        set({ 
          sidebarState: state,
          sidebarOpen: state === 'expanded'
        })
      },
      toggleSidebar: () => {
        const { sidebarOpen } = get()
        set({ 
          sidebarOpen: !sidebarOpen,
          sidebarState: !sidebarOpen ? 'expanded' : 'collapsed'
        })
      },
      
      // 移动端 Sidebar
      sidebarOpenMobile: false,
      setSidebarOpenMobile: (open: boolean) => {
        set({ sidebarOpenMobile: open })
      },
      toggleSidebarMobile: () => {
        const { sidebarOpenMobile } = get()
        set({ sidebarOpenMobile: !sidebarOpenMobile })
      },
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        sidebarState: state.sidebarState,
      }),
      onRehydrateStorage: () => (state) => {
        // 恢复状态后应用主题
        if (state?.theme) {
          applyTheme(state.theme)
        }
      },
    }
  )
)

// 主题相关的便捷 hooks
export const useTheme = () => {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  return { theme, setTheme }
}

// Sidebar 相关的便捷 hooks
export const useSidebarStore = () => {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const sidebarState = useAppStore((state) => state.sidebarState)
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen)
  const setSidebarState = useAppStore((state) => state.setSidebarState)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const sidebarOpenMobile = useAppStore((state) => state.sidebarOpenMobile)
  const setSidebarOpenMobile = useAppStore((state) => state.setSidebarOpenMobile)
  const toggleSidebarMobile = useAppStore((state) => state.toggleSidebarMobile)
  
  return {
    sidebarOpen,
    sidebarState,
    setSidebarOpen,
    setSidebarState,
    toggleSidebar,
    sidebarOpenMobile,
    setSidebarOpenMobile,
    toggleSidebarMobile,
  }
}
