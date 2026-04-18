import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

/**
 * 积分前置检查 Hook
 * NOTE: 在工具提交前调用 checkCredits，余额不足时弹出 toast 提示并引导充值
 *
 * @example
 * const { checkCredits } = useCreditsGuard();
 * const handleSubmit = () => {
 *   if (!checkCredits(15, '视频生成')) return;
 *   // ... 正常提交逻辑
 * };
 */
export function useCreditsGuard() {
  const { credits, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  /**
   * 检查积分是否充足
   * @param required 所需积分
   * @param toolName 工具名称（用于提示文案）
   * @returns true = 余额充足可继续，false = 余额不足已拦截
   */
  const checkCredits = useCallback(
    (required: number, toolName: string): boolean => {
      if (!isLoggedIn) {
        // NOTE: 未登录时不拦截，由路由守卫处理
        return true;
      }

      if (credits >= required) {
        return true;
      }

      // NOTE: 积分不足时弹出确认框，引导用户充值
      const goRecharge = window.confirm(
        `算力不足：当前剩余 ${credits} 算力，${toolName}需要 ${required} 算力。\n\n是否前往充值页面？`
      );
      if (goRecharge) {
        navigate('/pricing');
      }
      return false;
    },
    [credits, isLoggedIn, navigate],
  );

  return { checkCredits, credits, isLoggedIn };
}
