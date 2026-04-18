import { useNavigate } from 'react-router-dom';
import { Wrench, ArrowLeft, Shield } from 'lucide-react';

/**
 * 维护中页面
 * NOTE: 当管理员在系统配置中开启维护模式时，非管理员用户访问任何页面都会被重定向到此页面
 * 管理员仍可正常访问所有页面
 */
export default function MaintenancePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-nexus-bg flex items-center justify-center px-4">
      <div className="text-center max-w-lg space-y-8">
        {/* 动效图标 */}
        <div className="relative mx-auto w-28 h-28">
          {/* 外圈脉冲 */}
          <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" />
          {/* 内圈 */}
          <div className="relative w-full h-full rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
            <Wrench
              size={48}
              className="text-amber-400 animate-[spin_4s_ease-in-out_infinite]"
            />
          </div>
        </div>

        {/* 标题与描述 */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-nexus-text tracking-tight">
            系统维护中
          </h1>
          <p className="text-nexus-muted text-base leading-relaxed">
            昆仑工坊正在进行系统升级与维护，预计很快恢复。
            <br />
            给您带来的不便，敬请谅解。
          </p>
        </div>

        {/* 状态指示 */}
        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-500/10 border border-amber-500/20">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-amber-400 font-medium">维护进行中</span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                       text-nexus-muted border border-nexus-border hover:text-nexus-text
                       hover:border-amber-500/30 transition-all"
          >
            <Shield size={15} />
            管理员登录
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                       bg-amber-500 text-white hover:bg-amber-600
                       shadow-[0_0_15px_rgba(245,158,11,0.3)]
                       hover:shadow-[0_0_25px_rgba(245,158,11,0.5)] transition-all"
          >
            <ArrowLeft size={15} />
            刷新重试
          </button>
        </div>

        {/* 底部品牌 */}
        <p className="text-[11px] text-nexus-muted/50 pt-4">
          © 昆仑工坊 KunLun · AI 驱动的跨境电商智能工具平台
        </p>
      </div>
    </div>
  );
}
