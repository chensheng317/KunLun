import { useState, useEffect, useRef } from 'react';
import {
  Check,
  X,
  Zap,
  ArrowRight,
  Sparkles,
  Shield,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Crown,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

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
    subtitle: '适合个人卖家试用',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyOriginal: 0,
    cta: '免费开始',
    features: [
      { text: '1 个电商平台接入', included: true },
      { text: '每月 500 条指令额度', included: true },
      { text: 'AutoGLM 基础语义识别', included: true },
      { text: '社区论坛支持', included: true },
      { text: '基础数据看板', included: true },
      { text: '多平台同步', included: false },
      { text: '合规风控矩阵', included: false },
      { text: '自定义插件', included: false },
      { text: '专属客服', included: false },
    ],
  },
  {
    id: 'starter',
    name: '基础版',
    subtitle: '适合个人创业者',
    monthlyPrice: 99,
    yearlyPrice: 79,
    yearlyOriginal: 99,
    cta: '立即开通',
    badge: '热门',
    features: [
      { text: '3 个电商平台接入', included: true },
      { text: '每月 5,000 条指令额度', included: true },
      { text: 'AutoGLM 深度语义识别', included: true },
      { text: '全域自动化链路', included: true },
      { text: '多维数据看板', included: true },
      { text: '多平台同步', included: true },
      { text: '基础合规检测', included: true },
      { text: '自定义插件', included: false },
      { text: '专属客服', included: false },
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
    badge: '推荐',
    features: [
      { text: '不限平台接入数量', included: true, highlight: true },
      { text: '每月 30,000 条指令额度', included: true, highlight: true },
      { text: 'AutoGLM 深度 + 多轮对话', included: true },
      { text: '全域自动化链路', included: true },
      { text: '高可用数据中台', included: true },
      { text: '多平台云端同步', included: true },
      { text: '完整合规风控矩阵', included: true },
      { text: '自定义插件 (5 个)', included: true },
      { text: '优先工单支持', included: true },
    ],
  },
  {
    id: 'enterprise',
    name: '旗舰版',
    subtitle: '适合企业级跨境团队',
    monthlyPrice: 999,
    yearlyPrice: 799,
    yearlyOriginal: 999,
    cta: '联系销售',
    badge: '企业',
    features: [
      { text: '不限平台 + 私有化部署', included: true, highlight: true },
      { text: '无限指令额度', included: true, highlight: true },
      { text: 'AutoGLM 全功能 + 微调', included: true },
      { text: '专属自动化流程定制', included: true },
      { text: '企业级数据中台 + SLA', included: true },
      { text: '多平台实时同步', included: true },
      { text: '高级合规 + 法务支持', included: true },
      { text: '不限自定义插件', included: true },
      { text: '7×24 专属客户经理', included: true },
    ],
  },
];

/* ────────────────────────────────────────
 * 定价 FAQ 数据
 * ──────────────────────────────────────── */

const PRICING_FAQ: FaqItem[] = [
  {
    question: '如何选择适合的套餐？',
    answer:
      '建议根据您管理的电商平台数量和月均指令需求来选择。个人卖家可从体验版开始，成长型团队推荐专业版，大型企业可选旗舰版享受定制化服务。',
  },
  {
    question: '可以随时升级或降级吗？',
    answer:
      '可以。您可以随时在账户设置中升级套餐，差价将按剩余天数折算。降级将在当前计费周期结束后生效。',
  },
  {
    question: '年付方案有什么优惠？',
    answer:
      '选择年付可享受约 8 折优惠，相当于每年免费使用 2-3 个月。年付方案包含与月付相同的所有功能和服务。',
  },
  {
    question: '免费试用期结束后会自动扣费吗？',
    answer:
      '不会。体验版是永久免费的，不需要绑定支付方式。付费版提供 14 天免费试用，试用期内可随时取消，不会产生任何费用。',
  },
  {
    question: '团队成员如何管理？',
    answer:
      '专业版支持最多 10 人团队，旗舰版不限成员数。您可在管理后台邀请成员并设置不同的权限角色。',
  },
  {
    question: '支持哪些付款方式？',
    answer:
      '支持支付宝、微信支付、银行转账以及国际信用卡（Visa / Mastercard）。企业客户还可选择对公转账和开具增值税发票。',
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

  // 页面滚动到顶部
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text font-sans">
      <Navbar />

      <main className="pt-32 pb-24">
        {/* 页面标题区 */}
        <PricingHeader isYearly={isYearly} onToggle={setIsYearly} />

        {/* 套餐卡片区 */}
        <PricingCards plans={PLANS} isYearly={isYearly} />

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
          选择适合您团队规模的计划，随时升级或降级。所有方案均含 14 天免费试用。
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
  const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
  const isRecommended = plan.recommended;

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
        <div className="mb-8">
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

          {price === 0 && (
            <p className="mt-1.5 text-xs text-nexus-secondary font-medium">
              永久免费 · 无需绑卡
            </p>
          )}
        </div>

        {/* CTA 按钮 — 免费版导向工作台，其他版保持原 button */}
        {plan.id === 'free' ? (
          <Link
            to="/workbench"
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-300 mb-8 flex items-center justify-center gap-2 border border-nexus-border text-nexus-text hover:border-nexus-primary/50 hover:text-nexus-primary hover:bg-nexus-primary/5`}
          >
            {plan.cta}
            <ArrowRight size={16} />
          </Link>
        ) : (
          <button
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-300 mb-8 flex items-center justify-center gap-2 ${
              isRecommended
                ? 'bg-nexus-primary text-nexus-inverse shadow-cyber-glow hover:shadow-cyber-glow-hover hover:scale-[1.02] active:scale-[0.98]'
                : plan.id === 'enterprise'
                ? 'bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white hover:from-amber-500 hover:to-orange-500 hover:scale-[1.02] active:scale-[0.98]'
                : 'border border-nexus-border text-nexus-text hover:border-nexus-primary/50 hover:text-nexus-primary hover:bg-nexus-primary/5'
            }`}
          >
            {plan.cta}
            <ArrowRight size={16} />
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
    </div>
  );
}

/* ────────────────────────────────────────
 * 子组件：信任标识
 * ──────────────────────────────────────── */

function TrustBadges() {
  const badges = [
    { icon: <Shield size={20} />, text: 'SSL 加密 · 数据安全' },
    { icon: <Zap size={20} />, text: '14 天无理由退款' },
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
