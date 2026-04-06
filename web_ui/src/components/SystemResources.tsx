import React, { useState, useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import CustomPieChart from './CustomPieChart'
import { getSysResources } from '@/api/sysInfo'

interface SystemResourcesProps {}

interface Resources {
  cpu?: {
    percent: number
    cores: number
    threads: number
  }
  memory?: {
    percent: number
    total: number
    used: number
    free: number
  }
  disk?: {
    percent: number
    total: number
    used: number
    free: number
  }
}

const SystemResources: React.FC<SystemResourcesProps> = () => {
  const [resources, setResources] = useState<Resources>({
    cpu: { percent: 0, cores: 0, threads: 0 },
    memory: { percent: 0, total: 0, used: 0, free: 0 },
    disk: { percent: 0, total: 0, used: 0, free: 0 }
  })

  const fetchResources = async () => {
    try {
      const data = await getSysResources()
      setResources(data)
    } catch (error) {
      console.error('获取系统资源失败:', error)
    }
  }

  useEffect(() => {
    fetchResources()
    const intervalId = setInterval(() => {
      fetchResources()
    }, 2000)

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [])

  return (
    <div className="flex justify-around items-center flex-wrap gap-5">
      <TooltipProvider>
        {/* CPU 使用率 */}
        <div className="flex flex-col items-center cursor-pointer">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <CustomPieChart
                  percent={resources.cpu?.percent || 0}
                  title="CPU"
                  info={` ${resources.cpu?.cores || 0} 核 / ${resources.cpu?.threads || 0} 线程`}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>CPU 核心数: {resources.cpu?.cores || 0} 核 / {resources.cpu?.threads || 0} 线程</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 内存使用率 */}
        <div className="flex flex-col items-center cursor-pointer">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <CustomPieChart
                  percent={resources.memory?.percent || 0}
                  title="内存"
                  info={` ${resources.memory?.used || 0}GB/${resources.memory?.total || 0}GB`}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>内存总量: {resources.memory?.total || 0} GB (已用: {resources.memory?.used || 0} GB, 空闲: {resources.memory?.free || 0} GB)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* 磁盘使用率 */}
        <div className="flex flex-col items-center cursor-pointer">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <CustomPieChart
                  percent={resources.disk?.percent || 0}
                  title="磁盘"
                  info={` ${resources.disk?.used || 0}GB/${resources.disk?.total || 0} GB `}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>磁盘总量: {resources.disk?.total || 0} GB (已用: {resources.disk?.used || 0} GB, 空闲: {resources.disk?.free || 0} GB)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  )
}

export default SystemResources
