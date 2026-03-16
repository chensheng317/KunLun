import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Eye, EyeOff, AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * 注册页面
 * NOTE: 与登录页视觉风格统一，注册成功后自动登录并跳转工作台
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /** 密码强度指示器 */
  const passwordStrength = (() => {
    if (!password) return { level: 0, label: '', color: '' };
    if (password.length < 4) return { level: 1, label: '弱', color: 'bg-rose-400' };
    if (password.length < 8) return { level: 2, label: '中', color: 'bg-amber-400' };
    return { level: 3, label: '强', color: 'bg-emerald-400' };
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const err = register(username, password);
      if (err) {
        setError(err);
        setIsLoading(false);
      } else {
        navigate('/workbench');
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-nexus-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-nexus-primary/[0.06] rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 -left-32 w-96 h-96 bg-nexus-secondary/[0.06] rounded-full blur-3xl" />

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

        {/* 注册卡片 */}
        <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-8 shadow-2xl shadow-black/30 relative overflow-hidden">
          {/* 顶部辉光装饰 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-nexus-secondary to-transparent" />

          {/* Logo + 标题 */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl mx-auto mb-4 overflow-hidden shadow-cyber-glow">
              <img
                src="/logo.png"
                alt="KunLun Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-bold text-nexus-text">
              注册昆仑工坊
            </h1>
            <p className="text-sm text-nexus-muted mt-1.5">
              创建账号，开启数字化之旅
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
                placeholder="2 个字符以上"
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
                  placeholder="4 个字符以上"
                  className="w-full bg-nexus-bg border border-nexus-border rounded-xl px-4 py-3 pr-11 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none focus:border-nexus-primary/50 focus:shadow-[0_0_0_3px_rgba(62,237,231,0.1)] transition-all"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-primary transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* 密码强度指示器 */}
              {password && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          level <= passwordStrength.level
                            ? passwordStrength.color
                            : 'bg-nexus-border'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-nexus-muted font-medium">
                    {passwordStrength.label}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-nexus-muted uppercase tracking-wider mb-2">
                确认密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                  className={`w-full bg-nexus-bg border rounded-xl px-4 py-3 pr-11 text-sm text-nexus-text placeholder-nexus-muted/50 focus:outline-none transition-all ${
                    confirmPassword && confirmPassword === password
                      ? 'border-emerald-500/50 focus:shadow-[0_0_0_3px_rgba(16,185,129,0.1)]'
                      : confirmPassword && confirmPassword !== password
                        ? 'border-rose-500/50 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.1)]'
                        : 'border-nexus-border focus:border-nexus-primary/50 focus:shadow-[0_0_0_3px_rgba(62,237,231,0.1)]'
                  }`}
                  autoComplete="new-password"
                />
                {confirmPassword && confirmPassword === password && (
                  <Check
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400"
                  />
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={
                isLoading ||
                !username.trim() ||
                !password ||
                !confirmPassword
              }
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-nexus-primary text-nexus-inverse font-bold text-sm shadow-cyber-glow hover:shadow-cyber-glow-hover hover:bg-nexus-primary/90 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-nexus-inverse border-t-transparent rounded-full animate-spin" />
                  创建中...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  注册
                </>
              )}
            </button>
          </form>

          {/* 底部链接 */}
          <p className="text-center text-sm text-nexus-muted mt-6">
            已有账号？{' '}
            <Link
              to="/login"
              className="text-nexus-primary font-medium hover:underline"
            >
              立即登录
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
