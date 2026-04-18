import { useState } from 'react';
import { assetUrl } from '../utils/asset-url';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * 登录页面
 * NOTE: 采用居中卡片布局 + 赛博工业风视觉
 * 登录成功后跳转至工作台
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 登录提交 — Phase 2.7 改为 async 以适配异步 API 调用
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const err = await login(username, password);
      if (err) {
        setError(err);
        setIsLoading(false);
      } else {
        navigate('/workbench');
      }
    } catch {
      setError('登录失败，请检查网络连接');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-nexus-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-nexus-primary/[0.06] rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-nexus-secondary/[0.06] rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* 返回首页 */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-nexus-muted hover:text-nexus-primary transition-colors mb-8 group"
        >
          <ArrowLeft
            size={16}
            className="group-hover:-translate-x-1 transition-transform"
          />
          返回首页
        </Link>

        {/* 登录卡片 */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-8 shadow-2xl shadow-black/30 relative overflow-hidden">
          {/* 顶部辉光装饰 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-nexus-primary to-transparent" />

          {/* Logo + 标题 */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 overflow-hidden shadow-cyber-glow">
              <img
                src={assetUrl('/logo.png')}
                alt="KunLun Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-bold text-nexus-text">
              登录昆仑工坊
            </h1>
            <p className="text-sm text-nexus-muted mt-1.5">
              输入账号凭证接入系统
            </p>
          </div>

          {/* 错误消息 */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm"
            >
              <AlertCircle size={16} className="shrink-0" />
              {error}
            </motion.div>
          )}

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-nexus-muted uppercase tracking-wider mb-2">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-nexus-primary/50 focus:shadow-[0_0_0_3px_rgba(62,237,231,0.1)] transition-all"
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-nexus-muted uppercase tracking-wider mb-2">
                密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 pr-11 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-nexus-primary/50 focus:shadow-[0_0_0_3px_rgba(62,237,231,0.1)] transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-primary transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-nexus-primary text-nexus-inverse font-bold text-sm shadow-cyber-glow hover:shadow-cyber-glow-hover hover:bg-nexus-primary/90 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-nexus-inverse border-t-transparent rounded-full animate-spin" />
                  验证中...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  登录
                </>
              )}
            </button>
          </form>

          {/* 底部链接 */}
          <p className="text-center text-sm text-nexus-muted mt-6">
            还没有账号？{' '}
            <Link
              to="/register"
              className="text-nexus-primary font-medium hover:underline"
            >
              立即注册
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
