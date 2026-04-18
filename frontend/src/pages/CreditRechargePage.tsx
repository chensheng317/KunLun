import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, CreditCard, Sparkles, ArrowLeft, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * 积分充值页面
 * NOTE: 提供多档位预设充值 + 自定义金额充值
 * 汇率：1元 = 10积分
 * 模拟支付流程，充值成功后通过 AuthContext.rechargeCredits 更新余额
 */

const EXCHANGE_RATE = 10; // 1元 = 10积分

/** 充值档位配置 */
interface RechargeOption {
  id: string;
  amount: number; // 人民币
  credits: number; // 积分
  /** 热门/推荐 标签 */
  tag?: string;
}

const RECHARGE_OPTIONS: RechargeOption[] = [
  { id: 'r6', amount: 6, credits: 60 },
  { id: 'r12', amount: 12, credits: 120 },
  { id: 'r30', amount: 30, credits: 300, tag: '热门' },
  { id: 'r50', amount: 50, credits: 500 },
  { id: 'r98', amount: 98, credits: 980, tag: '超值' },
  { id: 'r198', amount: 198, credits: 1980 },
  { id: 'r648', amount: 648, credits: 6480, tag: '尊享' },
];

const MIN_CUSTOM_AMOUNT = 6;

export default function CreditRechargePage() {
  const navigate = useNavigate();
  const { user, credits, rechargeCredits } = useAuth();

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);
  const [pendingCredits, setPendingCredits] = useState(0);

  /** 获取当前选中的充值积分数 */
  const getSelectedCredits = useCallback((): number => {
    if (isCustom) {
      const amt = parseInt(customAmount, 10);
      return isNaN(amt) || amt < MIN_CUSTOM_AMOUNT ? 0 : amt * EXCHANGE_RATE;
    }
    const opt = RECHARGE_OPTIONS.find((o) => o.id === selectedOption);
    return opt?.credits ?? 0;
  }, [isCustom, customAmount, selectedOption]);

  /** 获取当前选中的金额 */
  const getSelectedAmount = useCallback((): number => {
    if (isCustom) {
      const amt = parseInt(customAmount, 10);
      return isNaN(amt) || amt < MIN_CUSTOM_AMOUNT ? 0 : amt;
    }
    const opt = RECHARGE_OPTIONS.find((o) => o.id === selectedOption);
    return opt?.amount ?? 0;
  }, [isCustom, customAmount, selectedOption]);

  /** 发起充值 */
  const handleRecharge = () => {
    const creditsToAdd = getSelectedCredits();
    if (creditsToAdd <= 0) return;
    setPendingCredits(creditsToAdd);
    setShowPayDialog(true);
    setPaySuccess(false);
  };

  /** 模拟支付成功 */
  const handleConfirmPay = () => {
    rechargeCredits(pendingCredits);
    setPaySuccess(true);
  };

  /** 关闭支付弹窗 */
  const handleCloseDialog = () => {
    // NOTE: 模拟支付系统，取消操作无需追踪订单记录
    setShowPayDialog(false);
    if (paySuccess) {
      setSelectedOption(null);
      setCustomAmount('');
      setIsCustom(false);
    }
  };

  return (
    <div className="min-h-screen bg-nexus-bg flex flex-col">
      {/* 顶部导航 */}
      <div className="border-b border-nexus-border bg-nexus-surface/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-nexus-muted hover:text-nexus-primary transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            返回
          </button>
          <div className="flex items-center gap-2 text-sm text-nexus-muted">
            <Zap size={14} className="text-nexus-primary" />
            当前余额：
            <span className="font-mono font-bold text-nexus-primary">
              {credits.toLocaleString()}
            </span>
            积分
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex items-start justify-center pt-12 pb-20 px-6">
        <div className="w-full max-w-3xl">
          {/* 标题 */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-4">
              <Sparkles size={12} />
              1 元 = 10 积分
            </div>
            <h1 className="text-3xl font-bold text-nexus-text mb-2">积分充值</h1>
            <p className="text-nexus-muted text-sm">选择充值档位或自定义金额，即时到账</p>
          </div>

          {/* 充值档位网格 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {RECHARGE_OPTIONS.map((opt) => (
              <motion.button
                key={opt.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setSelectedOption(opt.id);
                  setIsCustom(false);
                }}
                className={`relative flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all duration-200 ${
                  selectedOption === opt.id && !isCustom
                    ? 'border-nexus-primary bg-nexus-primary/10 shadow-cyber-glow'
                    : 'border-nexus-border bg-nexus-surface hover:border-nexus-primary/50'
                }`}
              >
                {opt.tag && (
                  <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-amber-500 text-[10px] font-bold text-nexus-bg">
                    {opt.tag}
                  </span>
                )}
                <span className="text-2xl font-bold text-nexus-text">
                  ¥{opt.amount}
                </span>
                <span className="text-xs text-nexus-muted flex items-center gap-1">
                  <Zap size={10} className="text-nexus-primary" />
                  {opt.credits.toLocaleString()} 积分
                </span>
                {selectedOption === opt.id && !isCustom && (
                  <motion.div
                    layoutId="recharge-check"
                    className="absolute top-2 left-2 w-5 h-5 rounded-full bg-nexus-primary flex items-center justify-center"
                  >
                    <Check size={12} className="text-nexus-bg" />
                  </motion.div>
                )}
              </motion.button>
            ))}

            {/* 自定义充值 */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setIsCustom(true);
                setSelectedOption(null);
              }}
              className={`relative flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all duration-200 ${
                isCustom
                  ? 'border-nexus-primary bg-nexus-primary/10 shadow-cyber-glow'
                  : 'border-nexus-border bg-nexus-surface hover:border-nexus-primary/50'
              }`}
            >
              <CreditCard size={24} className="text-nexus-muted" />
              <span className="text-xs text-nexus-muted">自定义金额</span>
              {isCustom && (
                <motion.div
                  layoutId="recharge-check"
                  className="absolute top-2 left-2 w-5 h-5 rounded-full bg-nexus-primary flex items-center justify-center"
                >
                  <Check size={12} className="text-nexus-bg" />
                </motion.div>
              )}
            </motion.button>
          </div>

          {/* 自定义金额输入 */}
          <AnimatePresence>
            {isCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 overflow-hidden"
              >
                <div className="flex items-center gap-4 p-4 rounded-xl bg-nexus-surface border border-nexus-border">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-nexus-muted text-sm">¥</span>
                    <input
                      type="number"
                      min={MIN_CUSTOM_AMOUNT}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder={`最低 ${MIN_CUSTOM_AMOUNT} 元`}
                      className="flex-1 bg-transparent border-none outline-none text-nexus-text text-lg font-mono placeholder:text-nexus-muted/50"
                    />
                  </div>
                  {customAmount && parseInt(customAmount, 10) >= MIN_CUSTOM_AMOUNT && (
                    <div className="flex items-center gap-1 text-sm text-nexus-primary">
                      <Zap size={12} />
                      <span className="font-mono font-bold">
                        {(parseInt(customAmount, 10) * EXCHANGE_RATE).toLocaleString()}
                      </span>
                      积分
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 充值按钮 */}
          <button
            onClick={handleRecharge}
            disabled={getSelectedCredits() <= 0}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-nexus-primary to-cyan-400 text-nexus-bg font-bold text-base shadow-cyber-glow hover:shadow-cyber-glow-hover hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:scale-100"
          >
            {getSelectedCredits() > 0
              ? `立即充值 ¥${getSelectedAmount()} → ${getSelectedCredits().toLocaleString()} 积分`
              : '请选择充值档位'}
          </button>

          {/* 充值说明 */}
          <div className="mt-8 p-4 rounded-xl bg-nexus-surface/50 border border-nexus-border">
            <h3 className="text-sm font-medium text-nexus-text mb-3">充值说明</h3>
            <ul className="space-y-1.5 text-xs text-nexus-muted">
              <li>• 充值比例：1 元人民币 = 10 积分，充值即时到账</li>
              <li>• 积分用于平台数字工厂全部 AI 工具的调用消耗</li>
              <li>• 充值的积分长期有效，账号注销前不会过期</li>
              <li>• 如有充值问题，请联系客服处理</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 支付弹窗 */}
      <AnimatePresence>
        {showPayDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && handleCloseDialog()}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm mx-4 rounded-2xl bg-nexus-surface border border-nexus-border shadow-2xl overflow-hidden"
            >
              {/* 关闭按钮 */}
              <button
                onClick={handleCloseDialog}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-nexus-muted hover:text-nexus-text hover:bg-nexus-surface-alt transition-colors z-10"
              >
                <X size={16} />
              </button>

              {!paySuccess ? (
                // 支付确认
                <div className="p-6 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <CreditCard size={28} className="text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold text-nexus-text mb-1">确认支付</h3>
                  <p className="text-nexus-muted text-sm mb-6">
                    您将支付 <span className="text-nexus-text font-bold">¥{getSelectedAmount()}</span> 获得{' '}
                    <span className="text-nexus-primary font-bold">{pendingCredits.toLocaleString()}</span> 积分
                  </p>

                  {/* NOTE: 模拟支付，仅前端演示 */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleCloseDialog}
                      className="flex-1 py-3 rounded-xl border border-nexus-border text-nexus-muted text-sm font-medium hover:border-nexus-primary/50 hover:text-nexus-text transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleConfirmPay}
                      className="flex-1 py-3 rounded-xl bg-gradient-to-r from-nexus-primary to-cyan-400 text-nexus-bg text-sm font-bold shadow-cyber-glow hover:shadow-cyber-glow-hover transition-all"
                    >
                      确认支付
                    </button>
                  </div>
                </div>
              ) : (
                // 支付成功
                <div className="p-6 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                    className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center"
                  >
                    <Check size={28} className="text-green-400" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-nexus-text mb-1">充值成功！</h3>
                  <p className="text-nexus-muted text-sm mb-2">
                    已到账 <span className="text-nexus-primary font-bold">{pendingCredits.toLocaleString()}</span> 积分
                  </p>
                  <p className="text-xs text-nexus-muted mb-6">
                    当前余额：<span className="font-mono text-nexus-text">{credits.toLocaleString()}</span> 积分
                  </p>
                  <button
                    onClick={handleCloseDialog}
                    className="w-full py-3 rounded-xl bg-nexus-surface-alt border border-nexus-border text-nexus-text text-sm font-medium hover:border-nexus-primary/50 transition-colors"
                  >
                    完成
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
