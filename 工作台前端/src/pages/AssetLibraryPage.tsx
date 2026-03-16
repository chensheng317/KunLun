import React from 'react';
import {
  DatabaseIcon,
  FileTextIcon,
  DownloadIcon,
  FileJsonIcon,
  FileCodeIcon } from
'lucide-react';
export function AssetLibraryPage() {
  const assets = [
  {
    id: 1,
    name: '竞品分析报告_20260312.md',
    type: 'markdown',
    size: '24 KB',
    date: '2026-03-12 14:30',
    icon: FileTextIcon
  },
  {
    id: 2,
    name: '营销素材抓取结果.json',
    type: 'json',
    size: '1.2 MB',
    date: '2026-03-11 09:15',
    icon: FileJsonIcon
  },
  {
    id: 3,
    name: '执行脚本_task_8892.py',
    type: 'script',
    size: '4 KB',
    date: '2026-03-11 09:14',
    icon: FileCodeIcon
  },
  {
    id: 4,
    name: '店铺健康度体检报告.md',
    type: 'markdown',
    size: '18 KB',
    date: '2026-03-10 16:45',
    icon: FileTextIcon
  }];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nexus-text flex items-center gap-3">
            <DatabaseIcon className="w-6 h-6 text-nexus-primary" />
            资产库
          </h1>
          <p className="text-nexus-muted mt-1">
            存放数字员工任务日志、报告及数字工厂产物。
          </p>
        </div>
      </div>

      <div className="bg-nexus-surface border border-nexus-border rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-nexus-surface-alt/50 border-b border-nexus-border">
              <th className="p-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider">
                文件名称
              </th>
              <th className="p-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider">
                大小
              </th>
              <th className="p-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider">
                生成时间
              </th>
              <th className="p-4 text-xs font-semibold text-nexus-muted uppercase tracking-wider text-right">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexus-border">
            {assets.map((asset) => {
              const Icon = asset.icon;
              return (
                <tr
                  key={asset.id}
                  className="hover:bg-nexus-bg/50 transition-colors group">
                  
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-nexus-secondary" />
                      <span className="font-medium text-nexus-text group-hover:text-nexus-primary transition-colors">
                        {asset.name}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-nexus-muted font-mono">
                    {asset.size}
                  </td>
                  <td className="p-4 text-sm text-nexus-muted font-mono">
                    {asset.date}
                  </td>
                  <td className="p-4 text-right">
                    <button className="p-2 rounded-lg text-nexus-muted hover:text-nexus-primary hover:bg-nexus-surface-alt transition-colors">
                      <DownloadIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>);

            })}
          </tbody>
        </table>
      </div>
    </div>);

}