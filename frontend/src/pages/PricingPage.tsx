import { useState, useEffect, useRef } from 'react';
import {
  Check,
  X,
  ArrowRight,
  Sparkles,
  Shield,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Crown,
  Gift,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth, ROLE_INITIAL_CREDITS, FIRST_SUBSCRIBE_BONUS } from '../contexts/AuthContext';
import type { UserRole } from '../contexts/AuthContext';

/* ────────────────────────────────────────
 * 类型定义
 * ──────────────────────────────────────── */

interface PlanFeature {
  text: string;
  included: boolean;
  /** 仅在该套餐特别突出时使用 */
  highlight?: boolean;
}

interface PricingPlan {
  id: string;
  name: string;
  subtitle: string;
  /** 月付价格（人民币） */
  monthlyPrice: number;
  /** 年付价格（每月折算，人民币） */
  yearlyPrice: number;
  /** 年付原价（用于划线） */
  yearlyOriginal: number;
  features: PlanFeature[];
  cta: string;
  /** 是否为推荐套餐 */
  recommended?: boolean;
  /** 标签文字（如"限时折扣"） */
  badge?: string;
  /** 对应的角色标识 — 用于购买后升级 */
  roleKey?: UserRole;
}

interface FaqItem {
  question: string;
  answer: string;
}

/* ────────────────────────────────────────
 * 套餐数据
 * ──────────────────────────────────────── */

const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: '体验版',
    subtitle: '适合个人卖家免费试用',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyOriginal: 0,
    cta: '免费开始',
    features: [
      { text: '数字员工 5 台手机配额', included: true },
      { text: '资产库权限', included: true },
      { text: '注册即赠 50 积分', included: true },
      { text: '数字工厂（Pro）功能', included: false },
      { text: '实验室（Beta）功能', included: false },
      { text: '工单支持', included: false },
      { text: 'API 通道', included: false },
      { text: '专属客服', included: false },
      { text: '6 大定制服务', included: false },
    ],
  },
  {
    id: 'starter',
    name: '基础版',
    subtitle: '适合个人创业者起步',
    monthlyPrice: 99,
    yearlyPrice: 79,
    yearlyOriginal: 99,
    cta: '立即开通',
    badge: 'Normal',
    roleKey: 'normal',
    features: [
      { text: '数字员工 10 台手机配额', included: true, highlight: true },
      { text: '数字工厂（Pro）功能', included: true, highlight: true },
      { text: '首次开通加赠 500 积分', included: true },
      { text: '实验室（Beta）功能', included: false },
      { text: '工单支持', included: false },
      { text: 'API 通道', included: false },
      { text: '专属客服', included: false },
      { text: '6 大定制服务', included: false },
    ],
  },
  {
    id: 'pro',
    name: '专业版',
    subtitle: '适合成长型电商团队',
    monthlyPrice: 299,
    yearlyPrice: 249,
    yearlyOriginal: 299,
    cta: '立即开通',
    recommended: true,
    badge: 'Pro',
    roleKey: 'pro',
    features: [
      { text: '基础版全部功能', included: true },
      { text: '数字员工 20 台手机配额', included: true, highlight: true },
      { text: '实验室（Beta）功能', included: true, highlight: true },
      { text: '工单支持', included: true, highlight: true },
      { text: '首次开通加赠 1,500 积分', included: true },
      { text: 'API 通道', included: false },
      { text: '专属客服', included: false },
      { text: '6 大定制服务', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: '旗舰版',
    subtitle: '适合企业级全能团队',
    monthlyPrice: 999,
    yearlyPrice: 799,
    yearlyOriginal: 999,
    cta: '立即开通',
    badge: 'Ultra',
    roleKey: 'ultra',
    features: [
      { text: '专业版全部功能', included: true },
      { text: '数字员工手机配额扩展', included: true, highlight: true },
      { text: 'API 通道', included: true, highlight: true },
      { text: '全部功能无限制', included: true, highlight: true },
      { text: '专属客服', included: true, highlight: true },
      { text: '6 大定制服务', included: true, highlight: true },
      { text: '首次开通加赠 5,000 积分', included: true },
    ],
  },
];

/* ────────────────────────────────────────
 * 定价 FAQ 数据
 * ──────────────────────────────────────── */

const PRICING_FAQ: FaqItem[] = [
  {
    question: '各套餐之间有什么核心区别？',
    answer:
      '体验版仅开放数字员工基础配额（5 台）和资产库，注册赠 50 积分；基础版解锁数字工厂全部 9 项 AI 工具，手机配额提升至 10 台；专业版在此基础上新增实验室（Beta）功能和工单支持，手机配额 20 台；旗舰版开放所有能力，包含 API 通道、专属客服和 6 大定制服务。',
  },
  {
    question: '积分是什么？如何消耗？',
    answer:
      '积分是昆仑平台的通用算力货币，使用数字工厂中的各项 AI 工具时按次扣除。不同工具消耗不同：如 JSON 提示词 1 积分/次、图片生成 1 积分/张、视频生成 5 积分/次、数字人视频 8 积分/次等。每个工具页面顶部均标注了单次消耗量。',
  },
  {
    question: '积分不够用了怎么办？',
    answer:
      '基础版及以上用户可随时通过工作台顶栏的「积分充值」入口购买额外积分，6 元起充（60 积分），充值即时到账。您也可以升级到更高套餐，升级时会一次性获得对应套餐的初始积分，且首次升级还有额外加赠。',
  },
  {
    question: '首次开通有什么额外奖励？',
    answer:
      '首次开通付费套餐可获得一次性加赠积分：基础版加赠 500 积分、专业版加赠 1,500 积分、旗舰版加赠 5,000 积分。该奖励每个账户仅享一次，续费时不再重复发放。',
  },
  {
    question: '可以随时升级或续费吗？',
    answer:
      '可以。您可以随时从低级套餐升级到更高级套餐，升级即刻生效并获得新套餐的积分奖励。同级套餐也支持续费，续费后会员时长将自动叠加，同时发放当月基础积分。目前暂不支持降级，建议根据需求选择合适套餐。',
  },
  {
    question: '年付方案是怎么计算的？',
    answer:
      '选择年付可享受约 8 折优惠（按月单价计算），一次性支付 12 个月费用。例如专业版月付 ¥299/月，年付仅需 ¥249/月，全年节省 ¥600。年付方案与月付功能完全一致，积分按月发放，首月即到账。',
  },
];

/* ────────────────────────────────────────
 * 主组件
 * ──────────────────────────────────────── */

/**
 * 定价页面
 * NOTE: 独立路由页面，包含月/年付切换、4 档套餐卡和定价 FAQ
 * 严格遵循 配色.md 赛博工业风规范
 */
export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  /**
   * NOTE: Phase 2.8 — 从后端 API 异步加载管理员定价配置
   *       GET /api/config/site/pricing_config
   *       移除对 localStorage('kunlun_pricing_config') 的直接依赖
   */
  const [livePlans, setLivePlans] = useState(PLANS);

  // 页面滚动到顶部 + 加载定价配置
  useEffect(() => {
    window.scrollTo(0, 0);

    // NOTE: 定价接口为公开接口，无需 JWT；但通过 apiClient 统一走 baseURL
    const fetchPricing = async () => {
      try {
        const { apiClient } = await import('../utils/api-client');
        const resp = await apiClient.get<{
          id: number;
          configKey: string;
          configValue: { id: string; monthlyPrice: number; yearlyPrice: number; initialCredits: number; firstBonus: number }[];
          updatedAt: string;
        }>('/api/config/site/pricing_config');
        const adminPricing = resp.configValue;
        if (!Array.isArray(adminPricing)) return;
        setLivePlans(
          PLANS.map((plan) => {
            const override = adminPricing.find((p) => p.id === plan.id);
            if (!override) return plan;
            return {
              ...plan,
              monthlyPrice: override.monthlyPrice,
              yearlyPrice: override.yearlyPrice,
              yearlyOriginal: plan.yearlyOriginal > 0 ? override.monthlyPrice : 0,
            };
          }),
        );
      } catch {
        // NOTE: API 不可用时保持默认 PLANS，保证页面正常渲染
      }
    };
    fetchPricing();
  }, []);

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text font-sans">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* 页面标题区 */}
        <PricingHeader isYearly={isYearly} onToggle={setIsYearly} />

        {/* 套餐卡片区 */}
        <PricingCards plans={livePlans} isYearly={isYearly} />

        {/* 功能对比提示 */}
        <TrustBadges />

        {/* 定价 FAQ */}
        <PricingFaq items={PRICING_FAQ} />
      </main>

      <Footer />
    </div>
  );
}

/* ────────────────────────────────────────
 * 子组件：标题区 + 切换开关
 * ──────────────────────────────────────── */

function PricingHeader({
  isYearly,
  onToggle,
}: {
  isYearly: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="px-6 mb-16">
      <div
        className={`max-w-4xl mx-auto text-center transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-nexus-primary" />
          PRICING
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
          简单透明的{' '}
          <span className="text-gradient-primary">定价方案</span>
        </h1>

        <p className="text-nexus-muted text-lg md:text-xl mb-12 max-w-2xl mx-auto leading-relaxed">
          选择适合您团队规模的计划，随时升级或降级。
        </p>

        {/* 月付/年付切换 */}
        <div className="inline-flex items-center gap-4 p-1.5 rounded-full bg-nexus-surface/60 border border-nexus-border/50 backdrop-blur-sm">
          <button
            onClick={() => onToggle(false)}
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ${
              !isYearly
                ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                : 'text-nexus-muted hover:text-nexus-text'
            }`}
          >
            按月付费
          </button>
          <button
            onClick={() => onToggle(true)}
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2 ${
              isYearly
                ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                : 'text-nexus-muted hover:text-nexus-text'
            }`}
          >
            按年付费
            <span className="px-2 py-0.5 rounded-full bg-nexus-primary/20 text-nexus-primary text-[11px] font-bold">
              省 20%
            </span>
          </button>
        </div>

        {/* 货币提示 */}
        <p className="mt-4 text-xs text-nexus-muted/60">
          价格单位：人民币（CNY）· 含增值税
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────
 * 子组件：套餐卡片网格
 * ──────────────────────────────────────── */

function PricingCards({
  plans,
  isYearly,
}: {
  plans: PricingPlan[];
  isYearly: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="px-6 mb-20">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan, idx) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isYearly={isYearly}
            isVisible={isVisible}
            delay={idx * 100}
          />
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────
 * 子组件：单张套餐卡
 * ──────────────────────────────────────── */

function PlanCard({
  plan,
  isYearly,
  isVisible,
  delay,
}: {
  plan: PricingPlan;
  isYearly: boolean;
  isVisible: boolean;
  delay: number;
}) {
  const { user, isLoggedIn, upgradeRole } = useAuth();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [modalMsg, setModalMsg] = useState('');
  const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
  const isRecommended = plan.recommended;

  /** 角色等级权重（用于判断升/降级） */
  const roleWeight: Record<string, number> = {
    guest: 0, normal: 1, pro: 2, ultra: 3, admin: 10, super_admin: 11,
  };
  const currentWeight = roleWeight[user?.role || 'guest'] ?? 0;
  const targetWeight = plan.roleKey ? (roleWeight[plan.roleKey] ?? 0) : -1;

  /** 动态 CTA 文案 */
  const getCtaText = () => {
    if (!isLoggedIn) return plan.cta;
    if (!plan.roleKey) return plan.cta; // 免费版
    // NOTE: 同级用户可以续费（含旗舰版）
    if (targetWeight === currentWeight && targetWeight > 0) return '立即续费';
    if (targetWeight < currentWeight) return '当前套餐';
    return plan.cta;
  };

  const handleCtaClick = () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }

    // NOTE: 不允许降级（只允许升级或同级续费，含旗舰版）
    if (!plan.roleKey || targetWeight < currentWeight) return;

    const isRenew = targetWeight === currentWeight && targetWeight > 0;
    const totalPrice = isYearly ? plan.yearlyPrice * 12 : plan.monthlyPrice;
    const baseCredits = ROLE_INITIAL_CREDITS[plan.roleKey];

    if (isRenew) {
      // 续费场景：只给基础积分，时长按计费周期叠加
      const durationLabel = isYearly ? '12 个月' : '1 个月';
      const creditsLabel = isYearly
        ? `🎁 首月赠送 ${baseCredits.toLocaleString()} 积分，后续 11 个月每月自动发放 ${baseCredits.toLocaleString()} 积分`
        : `🎁 赠送 ${baseCredits.toLocaleString()} 积分`;
      setModalMsg(
        `续费「${plan.name}」，${
          isYearly ? `年付 ¥${totalPrice}` : `月付 ¥${totalPrice}`
        }。\n${creditsLabel}，会员时长 +${durationLabel}\n确认续费吗？`
      );
    } else {
      // 升级场景：基础积分 + 可能的首次加赠
      const firstBonus = FIRST_SUBSCRIBE_BONUS[plan.roleKey] ?? 0;
      const totalCredits = baseCredits + firstBonus;
      const durationLabel = isYearly ? '12 个月' : '1 个月';
      let bonusLine: string;
      if (isYearly) {
        bonusLine = firstBonus > 0
          ? `\n🎁 首月赠送 ${baseCredits.toLocaleString()} + 首次加赠 ${firstBonus.toLocaleString()} = 共 ${totalCredits.toLocaleString()} 积分\n后续 11 个月每月自动发放 ${baseCredits.toLocaleString()} 积分`
          : `\n首月赠送 ${baseCredits.toLocaleString()} 积分，后续 11 个月每月自动发放 ${baseCredits.toLocaleString()} 积分`;
      } else {
        bonusLine = firstBonus > 0
          ? `\n🎁 基础赠送 ${baseCredits.toLocaleString()} 积分 + 首次加赠 ${firstBonus.toLocaleString()} 积分 = 共 ${totalCredits.toLocaleString()} 积分`
          : `\n获得 ${baseCredits.toLocaleString()} 积分奖励`;
      }
      setModalMsg(
        `即将升级为「${plan.name}」，${
          isYearly ? `年付 ¥${totalPrice}` : `月付 ¥${totalPrice}`
        }。${bonusLine}\n会员时长 +${durationLabel}\n确认购买吗？`
      );
    }
    setShowModal(true);
  };

  const confirmPurchase = () => {
    if (plan.roleKey) {
      // NOTE: 传递计费周期和实际支付金额，确保订单记录金额准确
      const totalPrice = isYearly ? plan.yearlyPrice * 12 : plan.monthlyPrice;
      upgradeRole(plan.roleKey, isYearly ? 'yearly' : 'monthly', totalPrice);
    }
    setShowModal(false);
    const isRenew = targetWeight === currentWeight && targetWeight > 0;
    setModalMsg(isRenew ? '✅ 续费成功！积分已到账，会员时长已延长。' : '✅ 升级成功！新积分已到账。');
    // 显示成功提示 2s
    setTimeout(() => setShowModal(true), 100);
    setTimeout(() => setShowModal(false), 2500);
  };

  /** NOTE: 取消购买，直接关闭弹窗（模拟支付无需追踪取消记录） */
  const cancelPurchase = () => {
    setShowModal(false);
  };

  const ctaText = getCtaText();
  // NOTE: 同级用户显示"立即续费"按钮而不是禁用状态
  const isCurrentPlan = false;
  const canUpgrade = targetWeight >= currentWeight && targetWeight > 0;

  return (
    <div
      className={`relative group rounded-2xl transition-all duration-700 ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-12'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* 推荐卡片外层辉光 */}
      {isRecommended && (
        <div className="absolute -inset-[2px] rounded-2xl bg-gradient-to-b from-nexus-primary via-nexus-secondary to-nexus-primary opacity-60 blur-[1px]" />
      )}

      <div
        className={`relative h-full flex flex-col rounded-2xl border p-7 transition-all duration-300 ${
          isRecommended
            ? 'bg-nexus-surface border-nexus-primary/40 shadow-cyber-glow-intense'
            : 'bg-nexus-surface/60 border-nexus-border/50 hover:border-nexus-border'
        }`}
      >
        {/* 标签 */}
        {plan.badge && (
          <div
            className={`absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold ${
              isRecommended
                ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow'
                : plan.id === 'enterprise'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                : 'bg-nexus-surface-alt text-nexus-primary border border-nexus-primary/30'
            }`}
          >
            {plan.id === 'enterprise' && <Crown size={12} className="inline mr-1 -mt-0.5" />}
            {isRecommended && <Sparkles size={12} className="inline mr-1 -mt-0.5" />}
            {plan.badge}
          </div>
        )}

        {/* 套餐名 */}
        <h3 className="text-lg font-bold mb-1 mt-2">{plan.name}</h3>
        <p className="text-nexus-muted text-xs mb-6">{plan.subtitle}</p>

        {/* 价格区 */}
        <div className="mb-6">
          <div className="flex items-baseline gap-1">
            <span className="text-nexus-muted text-lg">¥</span>
            <span
              className={`font-mono font-extrabold tracking-tight ${
                isRecommended ? 'text-nexus-primary text-5xl' : 'text-nexus-text text-5xl'
              }`}
            >
              {price}
            </span>
            {price > 0 && (
              <span className="text-nexus-muted text-sm ml-1">/月</span>
            )}
          </div>

          {/* 年付划线价 */}
          {isYearly && plan.yearlyOriginal > 0 && (
            <p className="mt-1.5 text-xs text-nexus-muted/60">
              <span className="line-through">¥{plan.yearlyOriginal}/月</span>
              <span className="ml-2 text-nexus-primary font-semibold">
                年省 ¥{(plan.yearlyOriginal - plan.yearlyPrice) * 12}
              </span>
            </p>
          )}

          {isYearly && price === 0 && (
            <p className="mt-1.5 text-xs text-nexus-primary font-semibold">
              永久免费 · 无需绑卡
            </p>
          )}
        </div>

        {/* 积分奖励提示 */}
        <div className="flex items-center gap-2 mb-6 text-xs bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          <Gift size={14} className="text-amber-400 shrink-0" />
          <span className="text-amber-400/90">
            {plan.roleKey
              ? `开通即赠 ${ROLE_INITIAL_CREDITS[plan.roleKey].toLocaleString()} 积分`
              : `注册即赠 ${ROLE_INITIAL_CREDITS.guest.toLocaleString()} 积分`}
          </span>
        </div>

        {/* CTA 按钮 */}
        {plan.id === 'free' ? (
          <Link
            to="/workbench"
            className="w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-300 mb-8 flex items-center justify-center gap-2 border border-nexus-border text-nexus-text hover:border-nexus-primary/50 hover:text-nexus-primary hover:bg-nexus-primary/5"
          >
            {plan.cta}
            <ArrowRight size={16} />
          </Link>
        ) : (
          <button
            onClick={handleCtaClick}
            disabled={isCurrentPlan}
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-300 mb-8 flex items-center justify-center gap-2 ${
              isCurrentPlan
                ? 'border border-nexus-border/50 text-nexus-muted/50 cursor-not-allowed'
                : isRecommended
                ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow hover:shadow-cyber-glow-hover hover:scale-[1.02] active:scale-[0.98]'
                : plan.id === 'enterprise'
                ? 'bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white hover:from-amber-500 hover:to-orange-500 hover:scale-[1.02] active:scale-[0.98]'
                : canUpgrade
                ? 'border border-nexus-primary text-nexus-primary hover:bg-nexus-primary/10 hover:scale-[1.02] active:scale-[0.98]'
                : 'border border-nexus-border text-nexus-text hover:border-nexus-primary/50 hover:text-nexus-primary hover:bg-nexus-primary/5'
            }`}
          >
            {ctaText}
            {canUpgrade && <ArrowRight size={16} />}
          </button>
        )}

        {/* 分割线 */}
        <div className="border-t border-nexus-border/30 mb-6" />

        {/* 功能列表 */}
        <p className="text-xs text-nexus-muted/70 font-semibold uppercase tracking-wider mb-4">
          包含功能
        </p>
        <ul className="flex-1 space-y-3">
          {plan.features.map((feat) => (
            <li
              key={feat.text}
              className={`flex items-start gap-2.5 text-sm ${
                feat.included ? 'text-nexus-text' : 'text-nexus-muted/40'
              }`}
            >
              {feat.included ? (
                <Check
                  size={16}
                  className={`mt-0.5 shrink-0 ${
                    feat.highlight ? 'text-nexus-primary' : 'text-nexus-secondary'
                  }`}
                />
              ) : (
                <X size={16} className="mt-0.5 shrink-0 text-nexus-muted/30" />
              )}
              <span className={feat.highlight ? 'font-semibold text-nexus-primary' : ''}>
                {feat.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 模拟购买弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <p className="text-sm text-nexus-text whitespace-pre-line mb-6 leading-relaxed">
              {modalMsg}
            </p>
            <div className="flex gap-3">
              {/* NOTE: 续费弹窗包含'确认续费'，升级弹窗包含'确认购买'，都需要显示确认支付按钮 */}
              {(modalMsg.includes('确认购买') || modalMsg.includes('确认续费')) ? (
                <>
                  <button
                    onClick={cancelPurchase}
                    className="flex-1 py-2.5 rounded-lg text-sm border border-nexus-border text-nexus-muted hover:text-nexus-text transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmPurchase}
                    className="flex-1 py-2.5 rounded-lg text-sm bg-nexus-primary text-nexus-inverse font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover transition-all"
                  >
                    确认支付
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-2.5 rounded-lg text-sm bg-nexus-primary text-nexus-inverse font-bold transition-all"
                >
                  知道了
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────
 * 子组件：信任标识
 * ──────────────────────────────────────── */

function TrustBadges() {
  const badges = [
    { icon: <Shield size={20} />, text: 'SSL 加密 · 数据安全' },
    { icon: <HelpCircle size={20} />, text: '7×24 技术支持' },
  ];

  return (
    <section className="px-6 mb-24">
      <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-8">
        {badges.map((b) => (
          <div
            key={b.text}
            className="flex items-center gap-3 text-nexus-muted text-sm"
          >
            <div className="text-nexus-secondary">{b.icon}</div>
            {b.text}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────
 * 子组件：定价 FAQ 手风琴
 * ──────────────────────────────────────── */

function PricingFaq({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="px-6 py-20">
      <div
        className={`max-w-3xl mx-auto transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-nexus-border/50 text-nexus-muted text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-nexus-secondary" />
            FAQ
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            定价<span className="text-gradient-primary">常见问题</span>
          </h2>
          <p className="text-nexus-muted">
            关于套餐和计费的常见疑问，如需更多帮助请联系客服。
          </p>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => {
            const isOpen = openId === idx;
            return (
              <div
                key={idx}
                className={`rounded-xl border transition-all duration-300 ${
                  isOpen
                    ? 'border-nexus-primary/40 bg-nexus-surface/80 shadow-cyber-glow'
                    : 'border-nexus-border/40 bg-nexus-surface/30 hover:border-nexus-border/70'
                }`}
              >
                <button
                  onClick={() => setOpenId(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left"
                >
                  <span
                    className={`text-sm font-semibold transition-colors duration-300 ${
                      isOpen ? 'text-nexus-primary' : 'text-nexus-text'
                    }`}
                  >
                    {item.question}
                  </span>
                  {isOpen ? (
                    <ChevronUp size={18} className="text-nexus-primary shrink-0 ml-4" />
                  ) : (
                    <ChevronDown size={18} className="text-nexus-muted shrink-0 ml-4" />
                  )}
                </button>

                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{
                    maxHeight: isOpen ? '200px' : '0px',
                    opacity: isOpen ? 1 : 0,
                  }}
                >
                  <p className="px-6 pb-5 text-sm text-nexus-muted leading-relaxed">
                    {item.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
