import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Github, Linkedin, Twitter, Lock, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../contexts/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { assetUrl } from '../utils/asset-url';

/**
 * 角色等级映射
 * NOTE: 数值越高权限越大，用于比较用户角色是否满足功能的最低要求
 */
const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 100, admin: 90, ultra: 60, pro: 40, normal: 20, guest: 0,
};

/**
 * 每个受限功能对应的最低解锁角色
 * NOTE: 工单支持 → 专业版即可使用；专属客服/定制服务/API 文档 → 旗舰版专属
 */
const FEATURE_MIN_ROLE: Record<string, UserRole> = {
  '工单支持': 'pro',
  '专属客服': 'ultra',
  '6 大定制服务': 'ultra',
  'API 文档': 'ultra',
};

/** 角色名称的中文展示映射 */
const ROLE_DISPLAY: Record<UserRole, string> = {
  super_admin: '超级管理员', admin: '管理员', ultra: '旗舰版',
  pro: '专业版', normal: '体验版', guest: '游客',
};

/**
 * 关于区域 + 页脚版权组件（合并为单个 section）
 * NOTE: 作为 main 内最后一个 section 参与 PPT 翻页
 * 上半部分：品牌介绍 + CTA
 * 下半部分：导航链接 + 版权
 */
export default function Footer() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const userRole = (user?.role as UserRole) || 'guest';

  // NOTE: 预计算当前用户的角色等级，避免重复查表
  const userLevel = ROLE_LEVEL[userRole];
  const isPro = userLevel >= ROLE_LEVEL['pro'];
  const isUltra = userLevel >= ROLE_LEVEL['ultra'];

  // 受限功能弹窗
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState('');

  /**
   * 判断指定功能是否已对当前用户解锁
   * NOTE: 根据 FEATURE_MIN_ROLE 映射表判断，未注册的功能默认需要旗舰版
   */
  const isFeatureUnlocked = useCallback((feature: string): boolean => {
    const minRole = FEATURE_MIN_ROLE[feature] || 'ultra';
    return userLevel >= ROLE_LEVEL[minRole];
  }, [userLevel]);

  /**
   * 获取指定功能需要的最低角色中文名
   * NOTE: 弹窗中显示"需要升级至 XX 版"的提示文案
   */
  const getUpgradeTarget = useCallback((feature: string): string => {
    const minRole = FEATURE_MIN_ROLE[feature] || 'ultra';
    return ROLE_DISPLAY[minRole];
  }, []);

  /** 点击受限功能：已解锁弹示确认跳转，未解锁弹示升级 */
  const handleRestrictedClick = (feature: string) => {
    setUpgradeFeature(feature);
    setShowUpgradeModal(true);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // NOTE: 当前弹窗中选中功能的解锁状态与升级目标
  const featureUnlocked = isFeatureUnlocked(upgradeFeature);
  const upgradeTarget = getUpgradeTarget(upgradeFeature);

  return (
    <>
      <section
        id="about"
        ref={sectionRef}
        className="relative h-screen px-6 border-t border-nexus-border/30 overflow-hidden flex flex-col"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-nexus-surface/20 to-transparent" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-nexus-primary/[0.03] blur-[150px] rounded-full pointer-events-none" />

        {/* 关于区域 */}
        <div className={`flex-1 flex items-center relative z-10 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="max-w-4xl mx-auto w-full text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-nexus-secondary" />
              ABOUT US
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              关于 <span className="text-nexus-primary">昆仑工坊</span>
            </h2>
            <p className="text-nexus-muted text-sm leading-relaxed max-w-xl mx-auto mb-6">
              昆仑工坊是由227studio团队专为电商行业设计的全域数字中枢。致力于通过从单点工具到全域方案的一站式AI自动化工作台，打造集成化、全自动化、零门槛的电商运营平台。
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/workbench" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-nexus-primary text-nexus-inverse font-bold text-sm shadow-cyber-glow hover:shadow-cyber-glow-hover hover:scale-105 active:scale-95 transition-all duration-300">
                开始免费试用
                <ArrowRight size={14} />
              </Link>
              <Link to="/" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-nexus-border text-nexus-text text-sm font-medium hover:border-nexus-primary/50 hover:text-nexus-primary transition-all duration-300">
                联系我们
              </Link>
            </div>
          </div>
        </div>

        {/* 版权区 */}
        <div className="relative z-10 pb-6">
          <div className="max-w-6xl mx-auto">
            <div className="border-t border-nexus-border/30 pt-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                {/* 品牌 */}
                <div className="col-span-1 md:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg overflow-hidden">
                      <img src={assetUrl('/logo.png')} alt="KunLun" className="w-full h-full object-cover" />
                    </div>
                    <span className="font-bold text-sm tracking-wider text-nexus-text">KUNLUN</span>
                  </div>
                  <p className="text-nexus-muted text-xs max-w-xs leading-relaxed mb-3">
                    一人成军，指挥你的AI手机团队
                  </p>
                  <div className="flex gap-2">
                    {[
                      { icon: <Github size={14} />, label: 'GitHub' },
                      { icon: <Twitter size={14} />, label: 'Twitter' },
                      { icon: <Linkedin size={14} />, label: 'LinkedIn' },
                    ].map((social) => (
                      <a
                        key={social.label}
                        href="#"
                        title={social.label}
                        className="w-7 h-7 rounded-md bg-nexus-surface/50 border border-nexus-border/30 flex items-center justify-center text-nexus-muted hover:text-nexus-primary hover:border-nexus-primary/40 transition-all duration-300"
                      >
                        {social.icon}
                      </a>
                    ))}
                  </div>
                </div>

                {/* 产品链接 */}
                <div>
                  <h4 className="font-bold mb-2 text-nexus-text text-xs">产品</h4>
                  <ul className="space-y-1.5 text-xs text-nexus-muted">
                    <li><a href="#features" className="hover:text-nexus-primary transition-colors">核心功能</a></li>
                    <li><Link to="/pricing" className="hover:text-nexus-primary transition-colors">定价策略</Link></li>
                    <li>
                      <button onClick={() => handleRestrictedClick('工单支持')} className="hover:text-nexus-primary transition-colors text-left">
                        工单支持 {!isPro && <Lock size={10} className="inline ml-0.5 opacity-40" />}
                      </button>
                    </li>
                    <li>
                      <button onClick={() => handleRestrictedClick('专属客服')} className="hover:text-nexus-primary transition-colors text-left">
                        专属客服 {!isUltra && <Lock size={10} className="inline ml-0.5 opacity-40" />}
                      </button>
                    </li>
                    <li>
                      <button onClick={() => handleRestrictedClick('6 大定制服务')} className="hover:text-nexus-primary transition-colors text-left">
                        定制服务 {!isUltra && <Lock size={10} className="inline ml-0.5 opacity-40" />}
                      </button>
                    </li>
                  </ul>
                </div>

                {/* 开发者链接 */}
                <div>
                  <h4 className="font-bold mb-2 text-nexus-text text-xs">开发者</h4>
                  <ul className="space-y-1.5 text-xs text-nexus-muted">
                    <li>
                      <button onClick={() => handleRestrictedClick('API 文档')} className="hover:text-nexus-primary transition-colors text-left">
                        API 文档 {!isUltra && <Lock size={10} className="inline ml-0.5 opacity-40" />}
                      </button>
                    </li>
                    <li><a href="#" className="hover:text-nexus-primary transition-colors">GitHub 仓库</a></li>
                    <li><Link to="/" className="hover:text-nexus-primary transition-colors">关于我们</Link></li>
                  </ul>
                </div>
              </div>

              {/* 版权行 */}
              <div className="pt-3 border-t border-nexus-border/20 text-xs text-nexus-muted flex flex-col md:flex-row justify-between items-center gap-2">
                <p>© 2026 KunLun Tech. All rights reserved.</p>
                <div className="flex gap-4">
                  <a href="#" className="hover:text-nexus-text transition-colors">隐私政策</a>
                  <a href="#" className="hover:text-nexus-text transition-colors">服务条款</a>
                  <a href="#" className="hover:text-nexus-text transition-colors">Cookie 设置</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 受限功能弹窗 */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowUpgradeModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 max-w-sm w-full shadow-2xl shadow-black/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-nexus-primary/15 flex items-center justify-center">
                  {featureUnlocked ? <Zap size={20} className="text-nexus-primary" /> : <Lock size={20} className="text-amber-400" />}
                </div>
                <h3 className="text-sm font-bold text-nexus-text">
                  {featureUnlocked ? upgradeFeature : `${upgradeFeature}需要升级`}
                </h3>
              </div>
              <p className="text-sm text-nexus-muted mb-6 leading-relaxed">
                {featureUnlocked
                  ? `是否跳转到「${upgradeFeature}」服务页面？`
                  : `「${upgradeFeature}」为${upgradeTarget}专属功能，请升级您的方案以解锁。`
                }
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-nexus-border text-sm font-medium text-nexus-muted hover:text-nexus-text hover:border-nexus-text/30 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false);
                    if (featureUnlocked) {
                      // NOTE: 已解锁功能跳转到对应服务页面（暂跳首页，后续可按功能细化路由）
                      navigate('/');
                    } else {
                      navigate('/pricing');
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-nexus-primary text-nexus-inverse text-sm font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover transition-all"
                >
                  {featureUnlocked ? '确定' : '升级方案'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
