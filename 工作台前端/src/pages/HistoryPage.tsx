import React from 'react';
import { ClockIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';
export function HistoryPage() {
  const history = [
  {
    id: 1,
    command: '帮我分析一下最近一周抖音美妆类目的爆款视频数据',
    status: 'success',
    time: '10分钟前',
    duration: '45s'
  },
  {
    id: 2,
    command: '全网抓取高转化营销素材，智能分类打标',
    status: 'success',
    time: '2小时前',
    duration: '1m 20s'
  },
  {
    id: 3,
    command: '一键分发多平台图文内容',
    status: 'failed',
    time: '昨天 14:30',
    duration: '12s'
  },
  {
    id: 4,
    command: '全方位扫描店铺健康度',
    status: 'success',
    time: '昨天 09:00',
    duration: '3m 10s'
  }];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text flex items-center gap-3">
            <ClockIcon className="w-6 h-6 text-nexus-primary" />
            执行历史
          </h1>
          <p className="text-nexus-muted mt-1">
            追溯所有会话记录与指令执行状态。
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {history.map((item) =>
        <div
          key={item.id}
          className="bg-nexus-surface border border-nexus-border rounded-xl p-5 flex items-center justify-between hover:border-nexus-primary/30 transition-colors">
          
            <div className="flex items-start gap-4">
              <div className="mt-1">
                {item.status === 'success' ?
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" /> :

              <XCircleIcon className="w-5 h-5 text-rose-400" />
              }
              </div>
              <div>
                <p className="text-nexus-text font-medium mb-1">
                  {item.command}
                </p>
                <div className="flex items-center gap-4 text-xs text-nexus-muted font-mono">
                  <span>{item.time}</span>
                  <span>耗时: {item.duration}</span>
                </div>
              </div>
            </div>
            <button className="text-sm font-medium text-nexus-primary hover:text-nexus-secondary transition-colors px-4 py-2 rounded-lg bg-nexus-bg border border-nexus-border hover:border-nexus-primary/50">
              查看详情
            </button>
          </div>
        )}
      </div>
    </div>);

}