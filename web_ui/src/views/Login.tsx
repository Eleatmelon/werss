import React, { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { login } from '@/api/auth'
import { useForm } from 'react-hook-form'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { User, Lock, CheckCircle } from 'lucide-react'

interface LoginFormData {
  username: string
  password: string
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const form = useForm<LoginFormData>({
    defaultValues: {
      username: '',
      password: ''
    }
  })

  const appTitle = useMemo(
    () => import.meta.env.VITE_APP_TITLE || 'WeRSS 公众号订阅平台',
    []
  )

  const handleSubmit = async (values: LoginFormData) => {
    setLoading(true)
    try {
      const res = await login({
        username: values.username,
        password: values.password
      }) as any

      if (res?.access_token) {
        // 存储token和过期时间
        localStorage.setItem('token', res.access_token)
        const expiresIn = res.expires_in || 3600 // 默认1小时
        localStorage.setItem('token_expire', Date.now() + (expiresIn * 1000).toString())

        console.log('Token stored:', localStorage.getItem('token'))

        // 处理重定向
        const redirect = searchParams.get('redirect')
        navigate(redirect || '/')
        toast({
          title: "登录成功",
          description: "欢迎回来！"
        })
      } else {
        throw new Error('无效的响应格式')
      }
    } catch (error: any) {
      console.error('登录错误:', error)
      const errorMsg = error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        '登录失败，请检查用户名和密码'
      toast({
        variant: "destructive",
        title: "登录失败",
        description: errorMsg
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen p-0 m-0 bg-gray-50">
      <div className="flex flex-col lg:flex-row h-full transition-all duration-300">
        {/* 左侧紫色渐变介绍区域 */}
        <div className="hidden lg:flex flex-[0_0_55%] p-20 text-white flex-col justify-center bg-gradient-to-br from-purple-600 via-purple-500 to-violet-600 relative overflow-hidden">
          {/* 渐变装饰 */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-700/50 via-transparent to-violet-700/50"></div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-400/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10 max-w-[600px] mb-15">
            <h1 className="text-5xl mb-6 font-semibold drop-shadow-md animate-[fadeInUp_0.8s_ease-out_both]">{appTitle}</h1>
            <p className="text-lg leading-relaxed mb-8 opacity-90 drop-shadow-sm animate-[fadeInUp_0.8s_ease-out_0.2s_both]">
              让微信公众号内容以RSS形式订阅，轻松管理你关注的所有公众号
            </p>
            <div className="flex flex-col gap-4">
              <div className="opacity-0 flex items-center gap-3 text-base drop-shadow-sm animate-[fadeInUp_0.6s_ease-out_forwards] [animation-delay:0.4s]">
                <CheckCircle className="h-5 w-5" />
                <span>智能内容采集与解析</span>
              </div>
              <div className="opacity-0 flex items-center gap-3 text-base drop-shadow-sm animate-[fadeInUp_0.6s_ease-out_forwards] [animation-delay:0.5s]">
                <CheckCircle className="h-5 w-5" />
                <span>一键生成RSS订阅源</span>
              </div>
              <div className="opacity-0 flex items-center gap-3 text-base drop-shadow-sm animate-[fadeInUp_0.6s_ease-out_forwards] [animation-delay:0.6s]">
                <CheckCircle className="h-5 w-5" />
                <span>实时同步最新文章</span>
              </div>
              <div className="opacity-0 flex items-center gap-3 text-base drop-shadow-sm animate-[fadeInUp_0.6s_ease-out_forwards] [animation-delay:0.7s]">
                <CheckCircle className="h-5 w-5" />
                <span>智能监测与消息推送</span>
              </div>
            </div>
          </div>
        </div>

        {/* 移动端顶部紫色渐变条 */}
        <div className="lg:hidden h-32 bg-gradient-to-r from-purple-600 via-purple-500 to-violet-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-700/50 via-transparent to-violet-700/50"></div>
          <div className="relative z-10 flex items-center justify-center h-full px-6">
            <h1 className="text-2xl font-semibold text-white drop-shadow-md">{appTitle}</h1>
          </div>
        </div>

        {/* 右侧登录区域 */}
        <div className="flex-1 lg:flex-[0_0_45%] flex justify-center items-center p-6 lg:p-15 bg-white">
          <Card className="w-full max-w-[400px] p-8 lg:p-10 bg-white rounded-xl shadow-xl border border-gray-100 transition-all duration-300 hover:shadow-2xl">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>帐号</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="请输入帐号"
                            className="pl-9"
                            autoComplete="username"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密码</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="password"
                            placeholder="请输入密码"
                            className="pl-9"
                            autoComplete="current-password"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? '登录中...' : '登录'}
                </Button>
              </form>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default Login
