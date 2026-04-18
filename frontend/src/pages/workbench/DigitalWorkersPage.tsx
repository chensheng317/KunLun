import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MousePointerClick,
  Video,
  MessageCircle,
  Store,
  Share2,
  Terminal,
  Send,
  Cpu,
  Smartphone,
  ChevronDown,
  FileText,
  Download,
  Bot,
  User,
  Package,
  ChevronUp,
  AlertTriangle,
  XCircle,
  Hand,
  Play,
  Wifi,
  WifiOff,
  Plus,
  Clock,
  Loader,
  X,
  Check,
} from 'lucide-react';
import {
  addWorkerHistoryRecord,
  updateWorkerHistoryRecord,
  addAssetRecord,
  saveWorkerSession,
  loadWorkerSession,
  clearWorkerSession,
  saveActiveTaskId,
  loadActiveTaskId,
  clearActiveTaskId,
} from '../../utils/factory-records';

/**
 * 数字员工页 — 自然语言指令驱动的手机自动化（基于 Open-AutoGLM）
 *
 * NOTE: 通过 WebSocket 与后端实时通信，接收 thinking/action 推送。
 *       设备列表从后端动态获取真实 ADB 设备 ID 和型号。
 *       支持人工接管弹窗和任务取消。
 */

// ================================================================
//  预设口令配置（Phase 2: 含专属 skill_id 和弹窗交互配置）
// ================================================================

/**
 * 弹窗类型：
 * - input: 单输入框弹窗（模拟人类活动 / 店铺经营体检）
 * - input_with_platforms: 输入框 + 平台多选弹窗（爆款竞品分析）
 * - platforms: 平台多选弹窗（短视频数据复盘）
 * - confirm: 确认弹窗（私域微信回复）
 * - publish: 多字段表单弹窗（平台内容发布）
 */
type SkillDialogType = 'input' | 'input_with_platforms' | 'platforms' | 'confirm' | 'publish';

interface SkillConfig {
  id: number;
  skillId: string;
  title: string;
  icon: typeof Search;
  desc: string;
  dialogType: SkillDialogType;
  dialogConfig: {
    title: string;
    placeholder?: string;
    /** 平台多选选项（仅 platforms 类型使用） */
    platformOptions?: string[];
    /** 确认弹窗描述文案（仅 confirm 类型使用） */
    confirmMessage?: string;
  };
}

const PRESET_SKILLS: SkillConfig[] = [
  {
    id: 1,
    skillId: 'competitive_analysis',
    title: '爆款竞品分析',
    icon: Search,
    desc: '跨平台搜索指定商品，爬取各大电商平台商品数据并汇总报告。',
    dialogType: 'input_with_platforms',
    dialogConfig: {
      title: '爆款竞品分析',
      placeholder: '例如：筋膜枪、无线耳机、抛光机...',
      platformOptions: ['淘宝', '京东', '拼多多', '天猫', '抖音商城', '闲鱼', '亚马逊购物'],
    },
  },
  {
    id: 2,
    skillId: 'human_simulation',
    title: '模拟人类活动',
    icon: MousePointerClick,
    desc: '按指定次数模拟真人刷短视频，覆盖五大平台，每次 1 小时。',
    dialogType: 'input',
    dialogConfig: {
      title: '请输入模拟次数',
      placeholder: '例如：3',
    },
  },
  {
    id: 3,
    skillId: 'video_review',
    title: '短视频数据复盘',
    icon: Video,
    desc: '前往各平台创作者后台采集自己的短视频数据，汇总成报告。',
    dialogType: 'platforms',
    dialogConfig: {
      title: '请选择需要前往的平台',
      platformOptions: ['抖音', '快手', '微信视频号', 'B站', '小红书'],
    },
  },
  {
    id: 4,
    skillId: 'wechat_reply',
    title: '私域微信回复',
    icon: MessageCircle,
    desc: '自动化微信私域运营：加好友、欢迎语、关键词回复、群管理、朋友圈。',
    dialogType: 'confirm',
    dialogConfig: {
      title: '是否开启私域扫荡？',
      confirmMessage: '注意：请确认您使用的手机是否为工作手机。\n\n开启后，数字员工将自动执行：同意好友、发欢迎语、关键词回复、群管理、打标签、发朋友圈等操作。\n\n所有操作仅针对客户，会自动识别并避开日常好友。',
    },
  },
  {
    id: 5,
    skillId: 'shop_diagnosis',
    title: '店铺经营体检',
    icon: Store,
    desc: '前往各大电商 APP 普通版查看店铺健康指标，输出体检报告。',
    dialogType: 'input',
    dialogConfig: {
      title: '请输入您想要体检的店铺',
      placeholder: '例如：XX旗舰店、XX官方店...',
    },
  },
  {
    id: 6,
    skillId: 'content_publish',
    title: '平台内容发布',
    icon: Share2,
    desc: '按用户提供的素材信息，逐一前往各大平台完成图文/视频发布。',
    dialogType: 'publish',
    dialogConfig: {
      title: '平台内容发布',
      platformOptions: ['抖音', '小红书', '微信视频号', '快手', 'B站'],
    },
  },
];

// 输入框 Placeholder 轮播文案 — 与 HeroSection 保持一致
const PLACEHOLDER_EXAMPLES = [
  '输入指令，例如：打开微信，帮我回复一下微信的客户们...',
  '输入指令，例如：打开抖音开发者平台，帮我统计一下最新发布的短视频数据...',
  '输入指令，例如：打开平台，复制我给你的链接，拆解一下爆款逻辑，给我分析报告...',
  '输入指令，例如：像人类一样刷会短视频...',
  '输入指令，例如：帮我把相册里最新保存的这个视频发布到各大平台...',
  '输入指令，例如：检测店铺健康风险，收集店铺以及商品最新的评论给我汇报...',
];

// ================================================================
//  类型定义
// ================================================================

/** 后端返回的真实设备信息 */
interface DeviceInfo {
  id: string;
  model: string;
  brand: string;
  status: 'online' | 'busy' | 'offline';
}

/**
 * 对话消息类型
 * - user: 用户发送的指令
 * - thinking: Agent 每步的思考过程
 * - action: Agent 每步的执行动作
 * - file: 产物文件气泡
 * - error: 执行异常
 * - info: 系统信息（如任务取消）
 * - takeover: 人工接管提示
 */
interface ChatMessage {
  id: string;
  role: 'user' | 'thinking' | 'action' | 'file' | 'error' | 'info' | 'takeover';
  content: string;
  deviceLabel?: string;
  files?: Array<{ name: string; size: string; type: string }>;
  errorCode?: string;
  /** 动作步骤编号 */
  step?: number;
  /** 动作类型标签（如 Tap/Swipe/Launch） */
  actionType?: string;
}

/** WebSocket 消息结构 */
interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
}

// ================================================================
//  WebSocket 后端地址
// ================================================================

const WS_URL = 'ws://localhost:8000/ws/digital-worker';
const API_BASE = 'http://localhost:8000';

// ================================================================
//  主组件
// ================================================================

export default function DigitalWorkersPage() {
  const [command, setCommand] = useState('');
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // NOTE: 从 localStorage 恢复最近一次会话
    const saved = loadWorkerSession() as ChatMessage[];
    return saved.length > 0 ? saved : [];
  });
  /**
   * NOTE: isExecuting 和 currentTaskId 从 localStorage 恢复，
   *       确保用户导航离开再返回时仍能显示「取消任务」按钮。
   *       参见 workflow: async-task-persist-on-navigate
   */
  const [isExecuting, setIsExecuting] = useState(() => {
    return loadActiveTaskId() !== null;
  });
  const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(() => {
    return loadActiveTaskId();
  });
  /** 人工接管弹窗可见性 */
  const [takeoverVisible, setTakeoverVisible] = useState(false);
  const [takeoverReason, setTakeoverReason] = useState('');
  /** 下发指令后等待后端第一条 thinking 的加载态 */
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  /** 当前激活的内置指令 ID（点击技能卡片后设置，随指令发送） */
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  /** 技能弹窗状态 */
  const [skillDialogVisible, setSkillDialogVisible] = useState(false);
  const [skillDialogConfig, setSkillDialogConfig] = useState<SkillConfig | null>(null);
  /** 当前任务提交时间戳，用于计算耗时 */
  const taskStartTimeRef = useRef<number>(0);
  /**
   * 暂存最近一次提交的指令文本
   * NOTE: handleWsMessage 使用 useCallback([]) 空依赖，
   *       闭包中 command 永远是初始值 ''。
   *       handleExecute 在发送前将 command 写入此 ref，
   *       task_created handler 从 ref 读取，确保历史记录中保留真实指令。
   */
  const pendingCommandRef = useRef<string>('');
  /** 输入框 placeholder 轮播索引 */
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const placeholderExamples = PLACEHOLDER_EXAMPLES;

  const chatEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const deviceBtnRef = useRef<HTMLButtonElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 会话消息持久化 — 每次 messages 变化时保存到 localStorage
  useEffect(() => {
    if (messages.length > 0) {
      saveWorkerSession(messages);
    }
  }, [messages]);

  // 输入框 placeholder 轮播 — 每 3 秒切换一条示例指令
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholderExamples.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [placeholderExamples.length]);

  // ================================================================
  //  WebSocket 连接管理
  // ================================================================

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // 连接建立后立即请求设备列表
        ws.send(JSON.stringify({ type: 'list_devices', payload: {} }));
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        // 断线重连（5 秒间隔）
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          handleWsMessage(msg);
        } catch {
          // 忽略非 JSON 消息
        }
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同时通过 REST API 获取设备列表作为备用（WebSocket 连接前）
  useEffect(() => {
    fetch(`${API_BASE}/api/digital-worker/devices`)
      .then((res) => res.json())
      .then((data) => {
        if (data.devices?.length) {
          setDevices(data.devices);
          if (!selectedDevice) {
            setSelectedDevice(data.devices[0]);
          }
        }
      })
      .catch(() => {
        // REST 备用获取失败，等待 WebSocket 推送
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 监听首页跳转过来的设备自动选中事件
   * NOTE: 从 WorkbenchHome 点击某台手机跳转至此页后，
   *       自动在左下角设备选择器中选中该 deviceId 对应的设备
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.deviceId) {
        const targetId = detail.deviceId as string;
        setDevices((prev) => {
          const found = prev.find((d) => d.id === targetId);
          if (found) {
            setSelectedDevice(found);
          }
          return prev;
        });
        // 同时通过 REST 确保最新设备列表
        fetch(`${API_BASE}/api/digital-worker/devices`)
          .then((res) => res.json())
          .then((data) => {
            if (data.devices?.length) {
              setDevices(data.devices);
              const target = data.devices.find(
                (d: DeviceInfo) => d.id === targetId
              );
              if (target) setSelectedDevice(target);
            }
          })
          .catch(() => { /* 降级：用已有列表 */ });
      }
    };
    window.addEventListener('select-worker-device', handler);
    return () => window.removeEventListener('select-worker-device', handler);
  }, []);

  /**
   * 监听首页"执行"按钮跳转携带的指令预填事件
   * NOTE: 首页 HeroSection → WorkbenchPage(URL params) → prefill-command 事件
   *       将用户在首页输入框中的指令同步到数字员工的 command 输入框
   */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.command) {
        setCommand(detail.command as string);
      }
    };
    window.addEventListener('prefill-command', handler);
    return () => window.removeEventListener('prefill-command', handler);
  }, []);

  // ================================================================
  //  WebSocket 消息处理
  // ================================================================

  /**
   * 根据后端推送的消息类型更新 UI 状态
   *
   * NOTE: handleWsMessage 依赖 setMessages 的 updater 形式，
   *       不需要将 messages 放入依赖数组。
   */
  const handleWsMessage = useCallback((msg: WsMessage) => {
    const { type, payload } = msg;

    switch (type) {
      case 'device_list': {
        const devs = (payload.devices as DeviceInfo[]) || [];
        setDevices(devs);
        setSelectedDevice((prev) => {
          if (prev && devs.find((d) => d.id === prev.id)) return prev;
          return devs[0] || null;
        });
        break;
      }

      case 'task_created': {
        const taskId = payload.task_id as string;
        setCurrentTaskId(taskId);
        setIsExecuting(true);
        // NOTE: 立即持久化 taskId，确保导航离开后能恢复执行状态
        saveActiveTaskId(taskId);
        // 写入历史记录（状态 running）
        taskStartTimeRef.current = Date.now();
        addWorkerHistoryRecord({
          id: taskId,
          command: pendingCommandRef.current || '(未知指令)',
          status: 'running',
          time: new Date().toISOString(),
          duration: '进行中...',
          deviceLabel: selectedDevice
            ? `${selectedDevice.brand} ${selectedDevice.model}`
            : undefined,
        });
        break;
      }

      case 'thinking': {
        const thinkContent = payload.content as string;
        const thinkStep = payload.step as number;
        const thinkId = `thinking-${payload.task_id}-${thinkStep}`;
        // 收到第一条 thinking 意味着 Agent 开始工作，关闭加载态
        setIsWaitingForResponse(false);
        setMessages((prev) => [
          ...prev,
          {
            id: thinkId,
            role: 'thinking',
            content: thinkContent,
            step: thinkStep,
          },
        ]);
        break;
      }

      case 'action': {
        const actStep = payload.step as number;
        const actType = payload.action_type as string;
        const actDesc = payload.description as string;
        const actId = `action-${payload.task_id}-${actStep}`;
        setMessages((prev) => [
          ...prev,
          {
            id: actId,
            role: 'action',
            content: actDesc,
            step: actStep,
            actionType: actType,
          },
        ]);
        break;
      }

      case 'takeover_request': {
        const reason = payload.reason as string;
        setTakeoverReason(reason);
        setTakeoverVisible(true);
        setMessages((prev) => [
          ...prev,
          {
            id: `takeover-${Date.now()}`,
            role: 'takeover',
            content: reason,
          },
        ]);
        break;
      }

      case 'task_completed': {
        const summary = payload.summary as string;
        const totalSteps = payload.total_steps as number;
        const logFile = payload.log_file as string;
        const logFileName = logFile.split('/').pop() || logFile;
        const completedTaskId = payload.task_id as string;
        // NOTE: 附加产物文件（如信息汇总 .txt），后端可选返回
        const extraFiles = (payload.extra_files as string[] | undefined) || [];

        // 根据扩展名推断文件类型
        const inferFileType = (name: string) =>
          name.endsWith('.txt') ? 'text' : 'markdown';

        const allFiles = [
          { name: logFileName, size: '-', type: inferFileType(logFileName) },
          ...extraFiles.map((f: string) => {
            const fname = f.split('/').pop() || f;
            return { name: fname, size: '-', type: inferFileType(fname) };
          }),
        ];

        setMessages((prev) => [
          ...prev,
          {
            id: `complete-${Date.now()}`,
            role: 'file',
            content: `任务执行完毕（共 ${totalSteps} 步），以下是生成的产物文件：`,
            files: allFiles,
          },
        ]);
        setIsExecuting(false);
        setIsWaitingForResponse(false);
        setCurrentTaskId(null);
        clearActiveTaskId();

        // 计算耗时
        const elapsed = Date.now() - taskStartTimeRef.current;
        const durationStr = elapsed > 60000
          ? `${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s`
          : `${Math.floor(elapsed / 1000)}s`;

        // 更新历史记录状态 → success
        updateWorkerHistoryRecord(completedTaskId, {
          status: 'success',
          duration: durationStr,
          result: `${summary}\n日志文件：${logFileName}`,
          logFile: logFileName,
        });

        // 同步到资产库
        addAssetRecord({
          id: `worker-${completedTaskId}`,
          name: logFileName,
          source: '数字员工',
          type: 'markdown',
          size: '-',
          date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          downloadUrl: `${API_BASE}/api/digital-worker/logs/${logFileName}`,
        });

        // 刷新设备列表（释放忙碌状态）
        wsRef.current?.send(JSON.stringify({ type: 'list_devices', payload: {} }));
        break;
      }

      case 'task_failed': {
        const errCode = payload.error_code as string;
        const errMsg = payload.error_message as string;
        const failedTaskId = payload.task_id as string;
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'error',
            content: errMsg,
            errorCode: errCode,
          },
        ]);
        setIsExecuting(false);
        setIsWaitingForResponse(false);
        setCurrentTaskId(null);
        clearActiveTaskId();
        // 更新历史记录状态 → failed
        if (failedTaskId) {
          const elapsed = Date.now() - taskStartTimeRef.current;
          const durationStr = elapsed > 60000
            ? `${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s`
            : `${Math.floor(elapsed / 1000)}s`;
          updateWorkerHistoryRecord(failedTaskId, {
            status: 'failed',
            duration: durationStr,
            result: `执行失败：${errMsg}（${errCode}）`,
          });
        }
        break;
      }

      case 'task_cancelled': {
        const stepsCompleted = payload.steps_completed as number;
        const cancelledTaskId = payload.task_id as string;
        setMessages((prev) => [
          ...prev,
          {
            id: `cancel-${Date.now()}`,
            role: 'info',
            content: `任务已取消（已执行 ${stepsCompleted} 步）`,
          },
        ]);
        setIsExecuting(false);
        setIsWaitingForResponse(false);
        setCurrentTaskId(null);
        clearActiveTaskId();
        // 更新历史记录状态 → failed
        if (cancelledTaskId) {
          const elapsed = Date.now() - taskStartTimeRef.current;
          const durationStr = elapsed > 60000
            ? `${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s`
            : `${Math.floor(elapsed / 1000)}s`;
          updateWorkerHistoryRecord(cancelledTaskId, {
            status: 'failed',
            duration: durationStr,
            result: `用户取消（已执行 ${stepsCompleted} 步）`,
          });
        }
        // 刷新设备列表
        wsRef.current?.send(JSON.stringify({ type: 'list_devices', payload: {} }));
        break;
      }

      default:
        break;
    }
  }, []);

  // ================================================================
  //  指令执行 & 取消
  // ================================================================

  /** 点击外部关闭设备下拉 */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDeviceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /**
   * 向后端下发执行指令
   *
   * NOTE: 通过 WebSocket 发送 start_task 消息，
   *       后续全部进度由 onmessage 事件驱动。
   */
  const handleExecute = useCallback(() => {
    if (!command.trim() || isExecuting || !selectedDevice || !wsRef.current) return;

    const currentCommand = command;
    const deviceLabel = `${selectedDevice.brand} ${selectedDevice.model}`;

    // 添加用户消息气泡
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: currentCommand,
        deviceLabel,
      },
    ]);

    // 开启加载态 — 等待后端 Agent 的第一条 thinking
    setIsWaitingForResponse(true);

    // NOTE: 将指令暂存到 ref，供 task_created handler 读取
    pendingCommandRef.current = currentCommand;

    // 通过 WebSocket 发送任务（携带 skill_id）
    wsRef.current.send(
      JSON.stringify({
        type: 'start_task',
        payload: {
          command: currentCommand,
          device_id: selectedDevice.id,
          max_steps: 100,
          // NOTE: 内置指令携带 skill_id，后端根据此字段加载领域专属 prompt
          ...(activeSkillId && { skill_id: activeSkillId }),
        },
      })
    );

    setCommand('');
    // 发送后清除活跃的内置指令 ID，避免影响下次自定义指令
    setActiveSkillId(null);
  }, [command, isExecuting, selectedDevice, activeSkillId]);

  /**
   * 新建会话 — 清空当前消息、重置状态、清除持久化
   */
  const handleNewSession = useCallback(() => {
    setMessages([]);
    setIsExecuting(false);
    setIsWaitingForResponse(false);
    setCurrentTaskId(null);
    setTakeoverVisible(false);
    setTakeoverReason('');
    setActiveSkillId(null);
    setSkillDialogVisible(false);
    setSkillDialogConfig(null);
    clearWorkerSession();
    clearActiveTaskId();
  }, []);

  /**
   * 技能卡片点击 — 打开对应类型的弹窗收集用户输入
   */
  const handleSkillCardClick = useCallback((skill: SkillConfig) => {
    setSkillDialogConfig(skill);
    setSkillDialogVisible(true);
  }, []);

  /**
   * 技能弹窗提交 — 组装指令文本并触发执行
   *
   * NOTE: 根据不同口令类型，将用户在弹窗中填写的内容组装成自然语言指令，
   *       填入输入框并触发 handleExecute。
   */
  const handleSkillDialogSubmit = useCallback((assembledCommand: string, skillId: string) => {
    setActiveSkillId(skillId);
    setCommand(assembledCommand);
    setSkillDialogVisible(false);
    setSkillDialogConfig(null);
    // NOTE: 使用 setTimeout(0) 确保 state 更新后再触发 execute
    setTimeout(() => {
      // 直接发送（绕过 handleExecute 的 command.trim() 检查，因为 state 可能还没更新）
      if (!wsRef.current || !selectedDevice) return;
      const deviceLabel = `${selectedDevice.brand} ${selectedDevice.model}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content: assembledCommand,
          deviceLabel,
        },
      ]);
      setIsWaitingForResponse(true);
      pendingCommandRef.current = assembledCommand;
      wsRef.current.send(
        JSON.stringify({
          type: 'start_task',
          payload: {
            command: assembledCommand,
            device_id: selectedDevice.id,
            max_steps: 100,
            skill_id: skillId,
          },
        })
      );
      setCommand('');
      setActiveSkillId(null);
    }, 0);
  }, [selectedDevice]);

  /**
   * 查看历史 — 跳转到历史页面的数字员工会话 tab
   */
  const handleViewHistory = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('navigate-to-tab', {
        detail: { tab: 'history', subTab: 'workers' },
      })
    );
  }, []);

  /**
   * 下载日志文件 — 通过后端 API 下载
   */
  const handleDownloadLog = useCallback((filename: string) => {
    const url = `${API_BASE}/api/digital-worker/logs/${filename}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  /** 取消正在执行的任务 */
  const handleCancel = useCallback(() => {
    if (!currentTaskId || !wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'cancel_task',
        payload: { task_id: currentTaskId },
      })
    );
  }, [currentTaskId]);

  /** 人工接管完成 — 用户完成手机操作后点击"继续执行" */
  const handleTakeoverDone = useCallback(() => {
    if (!currentTaskId || !wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: 'takeover_done',
        payload: { task_id: currentTaskId },
      })
    );
    setTakeoverVisible(false);
    setTakeoverReason('');
  }, [currentTaskId]);

  // ================================================================
  //  渲染
  // ================================================================

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ====== 固定区域：标题 ====== */}
      <div className="shrink-0 px-8 pt-6 pb-3">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold text-nexus-text flex items-center gap-3">
            <Cpu size={22} className="text-nexus-primary" />
            数字员工{' '}
            <span className="text-[10px] px-2 py-0.5 rounded bg-nexus-secondary/20 text-nexus-secondary border border-nexus-secondary/30 font-bold">
              FREE
            </span>

            {/* 新建会话 + 查看历史 */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleNewSession}
                className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-nexus-muted border border-nexus-border hover:text-nexus-primary hover:border-nexus-primary/50 transition-all"
              >
                <Plus size={13} />
                新建会话
              </button>
              <button
                onClick={handleViewHistory}
                className="cursor-target flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-nexus-muted border border-nexus-border hover:text-nexus-primary hover:border-nexus-primary/50 transition-all"
              >
                <Clock size={13} />
                查看历史
              </button>
              {/* 连接 + 设备综合状态指示器 */}
              {(() => {
                // NOTE: 三态判断 — WS 断开 > 无设备 > 就绪
                if (!wsConnected) {
                  return (
                    <span className="flex items-center gap-1.5 text-[10px] font-mono text-red-400">
                      <WifiOff size={12} />
                      DISCONNECTED
                    </span>
                  );
                }
                if (!selectedDevice) {
                  return (
                    <span className="flex items-center gap-1.5 text-[10px] font-mono text-yellow-400">
                      <Wifi size={12} />
                      NO DEVICE
                    </span>
                  );
                }
                return (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-green-400">
                    <Wifi size={12} />
                    READY
                  </span>
                );
              })()}
            </div>
          </h1>
          <p className="text-sm text-nexus-muted mt-1.5">
            AutoGLM 核心驱动，您的全天候智能业务助理。
          </p>
        </div>
      </div>

      {/* ====== 固定区域：可折叠技能卡包 ====== */}
      <div className="shrink-0 px-8">
        <div className="max-w-4xl mx-auto">
          <SkillCardPack
            isExpanded={isSkillsExpanded}
            onToggle={() => setIsSkillsExpanded(!isSkillsExpanded)}
            onSelect={handleSkillCardClick}
            disabled={isExecuting}
          />
        </div>
      </div>

      {/* ====== 可滚动区域：仅对话消息 ====== */}
      <div className="flex-1 overflow-y-auto px-8 py-4 min-h-0">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-nexus-muted/40">
              <Bot size={40} className="mb-3" />
              <p className="text-sm font-mono">等待指令输入...</p>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} onDownloadLog={handleDownloadLog} />
            ))}
          </AnimatePresence>

          {/* 加载中气泡 — 下发指令后、收到第一条 thinking 前显示 */}
          {isWaitingForResponse && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-nexus-surface border border-nexus-border text-nexus-muted">
                <Bot size={14} />
              </div>
              <div className="bg-nexus-surface border border-nexus-border rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-3">
                  <Loader size={14} className="text-nexus-primary animate-spin" />
                  <span className="text-xs text-nexus-muted font-mono animate-pulse">
                    Agent 正在启动，正在连接设备并分析指令...
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* ====== 固定区域：底部命令输入 ====== */}
      <div className="shrink-0 px-8 pb-6 pt-4 border-t border-nexus-border/30 bg-nexus-bg/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto">
          <div className="bg-nexus-surface border border-nexus-border rounded-2xl p-5 relative overflow-visible focus-within:border-nexus-primary focus-within:shadow-cyber-glow transition-all duration-300">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-nexus-primary animate-glow-pulse" />
              <span className="text-[10px] font-bold text-nexus-primary uppercase tracking-widest font-mono">
                Awaiting Command Input...
              </span>
            </div>

            <div className="flex gap-4">
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-nexus-primary font-mono text-base">
                  {'>'}
                </span>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={placeholderExamples[currentPlaceholder]}
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl py-3.5 pl-10 pr-4 text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
                  disabled={isExecuting}
                />
              </div>

              {/* 执行中显示取消按钮，否则显示下发指令按钮 */}
              {isExecuting ? (
                <button
                  onClick={handleCancel}
                  className="cursor-target px-6 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-300 bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30"
                >
                  <XCircle size={15} />
                  取消任务
                </button>
              ) : (
                <button
                  onClick={handleExecute}
                  disabled={!command.trim() || !wsConnected || !selectedDevice}
                  className={`cursor-target px-6 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-300 ${
                    command.trim() && wsConnected && selectedDevice
                      ? 'bg-nexus-primary text-nexus-inverse hover:bg-nexus-primary/90 shadow-cyber-glow'
                      : 'bg-nexus-bg border border-nexus-border text-nexus-muted cursor-not-allowed'
                  }`}
                >
                  <Send size={15} />
                  下发指令
                </button>
              )}
            </div>

            {/* 设备选择器 — 动态真实设备列表 */}
            <div className="flex items-center gap-3 mt-3.5">
              <div className="relative" ref={dropdownRef}>
                <button
                  ref={deviceBtnRef}
                  onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
                  className="cursor-target flex items-center gap-2 px-3 py-1.5 rounded-lg bg-nexus-bg border border-nexus-border hover:border-nexus-primary/50 transition-colors text-xs font-mono"
                >
                  <Smartphone size={13} className="text-nexus-primary" />
                  <span className="text-nexus-text">
                    {selectedDevice
                      ? `${selectedDevice.brand} ${selectedDevice.model}`
                      : '未检测到设备'}
                  </span>
                  {selectedDevice && (
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      selectedDevice.status === 'online' ? 'bg-green-400' :
                      selectedDevice.status === 'busy' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                  )}
                  <ChevronDown
                    size={12}
                    className={`text-nexus-muted transition-transform duration-200 ${isDeviceDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {isDeviceDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full left-0 mb-2 bg-nexus-surface border border-nexus-border rounded-xl shadow-lg shadow-black/30 z-50 overflow-hidden min-w-[220px]"
                    >
                      <div className="max-h-[210px] overflow-y-auto">
                        {devices.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-nexus-muted text-center font-mono">
                            未检测到 ADB 设备
                          </div>
                        ) : (
                          devices.map((device) => (
                            <button
                              key={device.id}
                              onClick={() => {
                                setSelectedDevice(device);
                                setIsDeviceDropdownOpen(false);
                              }}
                              className={`cursor-target w-full text-left px-3 py-2 text-xs font-mono flex items-center gap-2 transition-colors ${
                                selectedDevice?.id === device.id
                                  ? 'bg-nexus-primary/10 text-nexus-primary'
                                  : 'text-nexus-text hover:bg-nexus-bg'
                              }`}
                            >
                              <Smartphone size={11} />
                              <div className="flex-1 min-w-0">
                                <span className="block truncate">{device.brand} {device.model}</span>
                                <span className="block text-[9px] text-nexus-muted truncate">{device.id}</span>
                              </div>
                              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                                device.status === 'online' ? 'bg-green-400' :
                                device.status === 'busy' ? 'bg-yellow-400' : 'bg-red-400'
                              }`} />
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-[10px] text-nexus-muted/60 font-mono leading-relaxed">
                * 指令将通过 AutoGLM 实时 Agent 循环在目标设备上执行。产物将保存至「资产库」。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ====== 人工接管模态弹窗 ====== */}
      <AnimatePresence>
        {takeoverVisible && (
          <TakeoverModal reason={takeoverReason} onResume={handleTakeoverDone} />
        )}
      </AnimatePresence>

      {/* ====== 技能口令弹窗 ====== */}
      <AnimatePresence>
        {skillDialogVisible && skillDialogConfig && (
          <SkillDialog
            skill={skillDialogConfig}
            onSubmit={handleSkillDialogSubmit}
            onClose={() => {
              setSkillDialogVisible(false);
              setSkillDialogConfig(null);
            }}
            isExecuting={isExecuting}
            hasDevice={!!selectedDevice}
            wsConnected={wsConnected}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* =====================================================
 *  子组件: 人工接管模态弹窗
 * ===================================================== */

interface TakeoverModalProps {
  reason: string;
  onResume: () => void;
}

/**
 * 当 Agent 触发 Take_over 动作时弹出
 * 用户在手机上完成操作后点击"继续执行"恢复 Agent
 */
function TakeoverModal({ reason, onResume }: TakeoverModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center">
            <Hand size={20} className="text-yellow-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-nexus-text">需要人工操作</h3>
            <p className="text-xs text-nexus-muted font-mono">AGENT PAUSED — TAKEOVER</p>
          </div>
        </div>

        <p className="text-sm text-nexus-text leading-relaxed mb-6 p-4 rounded-xl bg-nexus-bg border border-nexus-border">
          {reason}
        </p>

        <button
          onClick={onResume}
          className="cursor-target w-full py-3 rounded-xl bg-nexus-primary text-nexus-inverse font-bold text-sm flex items-center justify-center gap-2 hover:bg-nexus-primary/90 shadow-cyber-glow transition-all"
        >
          <Play size={16} />
          继续执行
        </button>

        <p className="text-[10px] text-nexus-muted/60 text-center mt-3 font-mono">
          请在手机上完成所需操作后点击上方按钮
        </p>
      </motion.div>
    </motion.div>
  );
}

/* =====================================================
 *  子组件: 可折叠技能卡包
 * ===================================================== */

interface SkillCardPackProps {
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (skill: SkillConfig) => void;
  /** 任务执行中时禁用所有技能卡片，防止误触发新任务 */
  disabled?: boolean;
}

/**
 * 6 张技能卡片折叠/展开的卡包组件
 * NOTE: 所有卡片通过 grid + 统一高度确保大小一致
 */
function SkillCardPack({ isExpanded, onToggle, onSelect, disabled = false }: SkillCardPackProps) {
  return (
    <div className="mb-2">
      <motion.button
        onClick={onToggle}
        className="cursor-target flex items-center gap-3 group mb-3"
        whileTap={{ scale: 0.97 }}
      >
        <div className="relative w-10 h-10">
          {[2, 1, 0].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-lg bg-nexus-surface border border-nexus-border"
              animate={{
                y: isExpanded ? 0 : i * -3,
                x: isExpanded ? 0 : i * 2,
                rotate: isExpanded ? 0 : i * 3,
                scale: isExpanded ? 1 : 1 - i * 0.05,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Package size={18} className="text-nexus-primary" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold text-nexus-muted uppercase tracking-widest flex items-center gap-2">
            <Terminal size={14} />
            内置快速口令 (Skills)
          </h2>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronUp size={14} className="text-nexus-muted group-hover:text-nexus-primary transition-colors" />
          </motion.div>
        </div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-2">
              {PRESET_SKILLS.map((skill, index) => {
                const Icon = skill.icon;
                return (
                  <motion.button
                    key={skill.id}
                    initial={{ opacity: 0, y: 30, scale: 0.8, rotateX: -15 }}
                    animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                    exit={{ opacity: 0, y: 20, scale: 0.8, rotateX: 10 }}
                    transition={{
                      type: 'spring',
                      stiffness: 260,
                      damping: 20,
                      delay: index * 0.06,
                    }}
                    onClick={() => !disabled && onSelect(skill)}
                    className={`cursor-target text-left p-4 rounded-xl bg-nexus-surface border transition-all duration-300 h-[100px] flex flex-col justify-between ${
                      disabled
                        ? 'border-nexus-border/50 opacity-40 cursor-not-allowed'
                        : 'border-nexus-border hover:border-nexus-primary hover:shadow-cyber-glow group'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center group-hover:border-nexus-primary/50 transition-colors shrink-0">
                        <Icon size={16} className="text-nexus-muted group-hover:text-nexus-primary transition-colors" />
                      </div>
                      <h3 className="text-sm font-bold text-nexus-text group-hover:text-nexus-primary transition-colors">
                        {skill.title}
                      </h3>
                    </div>
                    <p className="text-xs text-nexus-muted leading-relaxed line-clamp-2">
                      {skill.desc}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =====================================================
 *  子组件: 对话气泡
 * ===================================================== */

interface ChatBubbleProps {
  message: ChatMessage;
  onDownloadLog?: (filename: string) => void;
}

/**
 * 根据消息角色渲染不同样式的对话气泡
 */
function ChatBubble({ message, onDownloadLog }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isTakeover = message.role === 'takeover';

  const avatarClass = isUser
    ? 'bg-nexus-primary/20 text-nexus-primary border border-nexus-primary/30'
    : isError
      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
      : isTakeover
        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
        : 'bg-nexus-surface border border-nexus-border text-nexus-muted';

  const avatarIcon = isUser
    ? <User size={14} />
    : isError
      ? <AlertTriangle size={14} />
      : isTakeover
        ? <Hand size={14} />
        : <Bot size={14} />;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.3 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarClass}`}>
        {avatarIcon}
      </div>

      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {message.role === 'user' && (
          <UserBubble content={message.content} deviceLabel={message.deviceLabel} />
        )}
        {message.role === 'thinking' && (
          <ThinkingBubble content={message.content} step={message.step} />
        )}
        {message.role === 'action' && (
          <ActionBubble content={message.content} step={message.step} actionType={message.actionType} />
        )}
        {message.role === 'file' && (
          <FileBubble content={message.content} files={message.files ?? []} onDownloadLog={onDownloadLog} />
        )}
        {message.role === 'error' && (
          <ErrorBubble content={message.content} errorCode={message.errorCode} />
        )}
        {message.role === 'info' && (
          <InfoBubble content={message.content} />
        )}
        {message.role === 'takeover' && (
          <TakeoverBubble content={message.content} />
        )}
      </div>
    </motion.div>
  );
}

/** 用户消息气泡 */
function UserBubble({ content, deviceLabel }: { content: string; deviceLabel?: string }) {
  return (
    <div className="bg-nexus-primary/15 border border-nexus-primary/30 rounded-2xl rounded-tr-sm px-4 py-3">
      <p className="text-sm text-nexus-text leading-relaxed">{content}</p>
      {deviceLabel && (
        <div className="flex items-center gap-1.5 mt-2">
          <Smartphone size={10} className="text-nexus-primary/70" />
          <span className="text-[10px] text-nexus-primary/70 font-mono">
            → {deviceLabel}
          </span>
        </div>
      )}
    </div>
  );
}

/** Agent 思考过程气泡 */
function ThinkingBubble({ content, step }: { content: string; step?: number }) {
  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-2xl rounded-tl-sm px-4 py-3">
      {step && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold text-nexus-primary font-mono bg-nexus-primary/10 px-2 py-0.5 rounded">
            STEP {step}
          </span>
          <span className="text-[10px] text-nexus-muted font-mono">💭 思考</span>
        </div>
      )}
      <p className="text-xs text-nexus-text leading-relaxed whitespace-pre-wrap">{content}</p>
    </div>
  );
}

/** Agent 执行动作气泡 */
function ActionBubble({ content, step, actionType }: { content: string; step?: number; actionType?: string }) {
  return (
    <div className="bg-green-500/8 border border-green-500/20 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        {step && (
          <span className="text-[10px] font-bold text-green-400 font-mono bg-green-500/10 px-2 py-0.5 rounded">
            STEP {step}
          </span>
        )}
        {actionType && (
          <span className="text-[10px] font-bold text-green-400 font-mono">
            🎯 [{actionType}]
          </span>
        )}
      </div>
      <p className="text-xs text-green-300/90 leading-relaxed">{content}</p>
    </div>
  );
}

/** 产物文件气泡 */
function FileBubble({
  content,
  files,
  onDownloadLog,
}: {
  content: string;
  files: Array<{ name: string; size: string; type: string }>;
  onDownloadLog?: (filename: string) => void;
}) {
  return (
    <div className="bg-nexus-surface border border-nexus-border rounded-2xl rounded-tl-sm px-4 py-3">
      <p className="text-sm text-nexus-text mb-3">{content}</p>
      <div className="space-y-2">
        {files.map((file, i) => (
          <motion.div
            key={file.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.15 }}
            onClick={() => onDownloadLog?.(file.name)}
            className="cursor-target flex items-center gap-3 p-3 rounded-xl bg-nexus-bg border border-nexus-border hover:border-nexus-primary/50 hover:shadow-cyber-glow transition-all duration-300 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-nexus-primary/10 border border-nexus-primary/20 flex items-center justify-center">
              <FileText size={16} className="text-nexus-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-nexus-text truncate group-hover:text-nexus-primary transition-colors">
                {file.name}
              </p>
              <p className="text-[10px] text-nexus-muted font-mono">
                {file.type === 'text' ? '点击下载产物文件' : '点击下载日志文件'}
              </p>
            </div>
            <Download
              size={14}
              className="text-nexus-muted group-hover:text-nexus-primary transition-colors shrink-0"
            />
          </motion.div>
        ))}
      </div>
      {/* 完成标记 */}
      <div className="mt-3 pt-3 border-t border-nexus-border/50 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
        <span className="text-[10px] text-green-400 font-mono font-bold">EXECUTION COMPLETE</span>
      </div>
    </div>
  );
}

/** 错误气泡 */
function ErrorBubble({ content, errorCode }: { content: string; errorCode?: string }) {
  /**
   * NOTE: 根据 errorCode 返回针对性的排查建议
   * ERR_DEVICE_CONNECTION — USB 断连/设备通信失败，最常见原因是物理线松了
   * ERR_DEVICE_OFFLINE — 设备未连接
   * 其他 — 通用提示
   */
  const getHintByCode = (code?: string): { text: string; highlight?: boolean } => {
    switch (code) {
      case 'ERR_DEVICE_CONNECTION':
        return {
          text: '⚠️ 请优先检查 USB 数据线是否松动或断开，确认设备屏幕亮起后重试',
          highlight: true,
        };
      case 'ERR_DEVICE_OFFLINE':
        return { text: '请检查设备是否已通过 USB 连接并授权调试' };
      case 'ERR_DEVICE_BUSY':
        return { text: '当前设备正在执行其他任务，请等待完成或取消后再试' };
      default:
        return { text: '请排查问题后重新下发指令' };
    }
  };

  const hint = getHintByCode(errorCode);

  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center">
          <AlertTriangle size={14} className="text-red-400" />
        </div>
        <span className="text-xs font-bold text-red-400 uppercase tracking-wider font-mono">
          Execution Error
        </span>
        {errorCode && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400/80 border border-red-500/20 font-mono">
            {errorCode}
          </span>
        )}
      </div>
      <p className="text-sm text-red-300/90 leading-relaxed whitespace-pre-line">{content}</p>
      <div className={`mt-3 pt-2.5 border-t border-red-500/15 flex items-center gap-2 ${
        hint.highlight ? 'bg-yellow-500/10 -mx-4 px-4 -mb-3 pb-3 rounded-b-2xl border-t-yellow-500/20' : ''
      }`}>
        <div className={`w-1.5 h-1.5 rounded-full ${hint.highlight ? 'bg-yellow-400' : 'bg-red-400'} animate-pulse`} />
        <span className={`text-[10px] font-mono ${
          hint.highlight ? 'text-yellow-400 font-bold' : 'text-red-400/60'
        }`}>
          {hint.text}
        </span>
      </div>
    </div>
  );
}

/** 系统信息气泡（取消任务等） */
function InfoBubble({ content }: { content: string }) {
  return (
    <div className="bg-nexus-surface/50 border border-nexus-border/50 rounded-2xl rounded-tl-sm px-4 py-3">
      <p className="text-xs text-nexus-muted italic leading-relaxed">{content}</p>
    </div>
  );
}

/** 人工接管提示气泡 */
function TakeoverBubble({ content }: { content: string }) {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md bg-yellow-500/20 flex items-center justify-center">
          <Hand size={14} className="text-yellow-400" />
        </div>
        <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider font-mono">
          Takeover Required
        </span>
      </div>
      <p className="text-sm text-yellow-300/90 leading-relaxed">{content}</p>
    </div>
  );
}

/* =====================================================
 *  子组件: 技能口令弹窗（4 种弹窗类型）
 * ===================================================== */

interface SkillDialogProps {
  skill: SkillConfig;
  onSubmit: (command: string, skillId: string) => void;
  onClose: () => void;
  isExecuting: boolean;
  hasDevice: boolean;
  wsConnected: boolean;
}

/**
 * 根据口令的 dialogType 渲染不同形式的输入弹窗
 *
 * NOTE: 弹窗收集用户输入后，组装成自然语言指令交由 handleSkillDialogSubmit 发送。
 */
function SkillDialog({ skill, onSubmit, onClose, isExecuting, hasDevice, wsConnected }: SkillDialogProps) {
  // input / input_with_platforms 类型状态
  const [inputValue, setInputValue] = useState('');
  // platforms / input_with_platforms 类型状态（默认全选）
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    skill.dialogConfig.platformOptions || []
  );
  // publish 类型状态
  const [publishPlatforms, setPublishPlatforms] = useState<string[]>(
    skill.dialogConfig.platformOptions || []
  );
  const [publishMediaLocation, setPublishMediaLocation] = useState('');
  const [publishTitle, setPublishTitle] = useState('');
  const [publishKeywords, setPublishKeywords] = useState('');
  const [publishDescription, setPublishDescription] = useState('');

  const canSubmit = wsConnected && hasDevice && !isExecuting;

  /**
   * 根据弹窗类型组装最终发送给 Agent 的自然语言指令
   */
  const handleSubmit = () => {
    if (!canSubmit) return;

    let command = '';

    switch (skill.dialogType) {
      case 'input':
        if (!inputValue.trim()) return;
        // NOTE: 根据具体口令拼接不同语义的指令前缀
        if (skill.skillId === 'human_simulation') {
          command = `请模拟人类活动 ${inputValue.trim()} 次`;
        } else if (skill.skillId === 'shop_diagnosis') {
          command = `请帮我体检以下店铺：${inputValue.trim()}`;
        } else {
          command = inputValue.trim();
        }
        break;

      case 'input_with_platforms':
        if (!inputValue.trim()) return;
        if (selectedPlatforms.length === 0) return;
        command = `请帮我搜索以下商品的竞品数据：${inputValue.trim()}；需要分析的平台：${selectedPlatforms.join('、')}`;
        break;

      case 'platforms':
        if (selectedPlatforms.length === 0) return;
        command = `请前往以下平台采集数据：${selectedPlatforms.join('、')}`;
        break;

      case 'confirm':
        command = '开启私域微信自动化运营';
        break;

      case 'publish': {
        if (!publishMediaLocation.trim() || !publishTitle.trim()) return;
        const parts = [
          `请帮我发布内容到以下平台：${publishPlatforms.join('、')}`,
          `素材位置：${publishMediaLocation.trim()}`,
          `标题：${publishTitle.trim()}`,
        ];
        if (publishKeywords.trim()) {
          parts.push(`关键词：${publishKeywords.trim()}`);
        }
        if (publishDescription.trim()) {
          parts.push(`简介：${publishDescription.trim()}`);
        }
        command = parts.join('；');
        break;
      }
    }

    if (command) {
      onSubmit(command, skill.skillId);
    }
  };

  const Icon = skill.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-nexus-surface border border-nexus-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl"
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-nexus-primary/20 border border-nexus-primary/30 flex items-center justify-center">
              <Icon size={20} className="text-nexus-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-nexus-text">{skill.dialogConfig.title}</h3>
              <p className="text-[10px] text-nexus-muted font-mono uppercase tracking-wider">{skill.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cursor-target w-8 h-8 rounded-lg bg-nexus-bg border border-nexus-border flex items-center justify-center text-nexus-muted hover:text-nexus-text hover:border-nexus-primary/50 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 弹窗内容 — 根据 dialogType 渲染 */}
        <div className="space-y-4">
          {skill.dialogType === 'input' && (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={skill.dialogConfig.placeholder}
              className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl py-3 px-4 text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          )}

          {/* 输入框 + 平台多选组合弹窗（爆款竞品分析） */}
          {skill.dialogType === 'input_with_platforms' && (
            <div className="space-y-4">
              {/* 商品输入 */}
              <div>
                <label className="block text-xs font-semibold text-nexus-muted mb-2 uppercase tracking-wider">
                  搜索商品 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={skill.dialogConfig.placeholder}
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl py-3 px-4 text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  autoFocus
                />
              </div>
              {/* 平台选择 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">
                    分析平台
                  </label>
                  <button
                    onClick={() => {
                      const all = skill.dialogConfig.platformOptions || [];
                      setSelectedPlatforms((prev) =>
                        prev.length === all.length ? [] : [...all]
                      );
                    }}
                    className="cursor-target text-[10px] text-nexus-primary hover:text-nexus-primary/80 font-medium transition-colors"
                  >
                    {selectedPlatforms.length === (skill.dialogConfig.platformOptions || []).length
                      ? '取消全选'
                      : '全选'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(skill.dialogConfig.platformOptions || []).map((platform) => {
                    const isSelected = selectedPlatforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        onClick={() => {
                          setSelectedPlatforms((prev) =>
                            isSelected
                              ? prev.filter((p) => p !== platform)
                              : [...prev, platform]
                          );
                        }}
                        className={`cursor-target px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-nexus-primary/20 border border-nexus-primary/40 text-nexus-primary'
                            : 'bg-nexus-bg border border-nexus-border text-nexus-muted hover:border-nexus-primary/30'
                        }`}
                      >
                        {platform}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-nexus-muted mt-1.5">
                  已选 {selectedPlatforms.length}/{(skill.dialogConfig.platformOptions || []).length} 个平台，每个平台采集 TOP5 商品
                </p>
              </div>
            </div>
          )}

          {skill.dialogType === 'platforms' && (
            <div className="space-y-2">
              {(skill.dialogConfig.platformOptions || []).map((platform) => {
                const isSelected = selectedPlatforms.includes(platform);
                return (
                  <button
                    key={platform}
                    onClick={() => {
                      setSelectedPlatforms((prev) =>
                        isSelected
                          ? prev.filter((p) => p !== platform)
                          : [...prev, platform]
                      );
                    }}
                    className={`cursor-target w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-nexus-primary/10 border border-nexus-primary/40 text-nexus-primary'
                        : 'bg-nexus-bg border border-nexus-border text-nexus-text hover:border-nexus-primary/30'
                    }`}
                  >
                    <span>{platform}</span>
                    {isSelected && <Check size={16} className="text-nexus-primary" />}
                  </button>
                );
              })}
            </div>
          )}

          {skill.dialogType === 'confirm' && (
            <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-sm text-nexus-text leading-relaxed whitespace-pre-line">
                  {skill.dialogConfig.confirmMessage}
                </p>
              </div>
            </div>
          )}

          {skill.dialogType === 'publish' && (
            <div className="space-y-3">
              {/* 平台多选 */}
              <div>
                <label className="block text-xs font-semibold text-nexus-muted mb-2 uppercase tracking-wider">
                  发布平台
                </label>
                <div className="flex flex-wrap gap-2">
                  {(skill.dialogConfig.platformOptions || []).map((platform) => {
                    const isSelected = publishPlatforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        onClick={() => {
                          setPublishPlatforms((prev) =>
                            isSelected
                              ? prev.filter((p) => p !== platform)
                              : [...prev, platform]
                          );
                        }}
                        className={`cursor-target px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-nexus-primary/20 border border-nexus-primary/40 text-nexus-primary'
                            : 'bg-nexus-bg border border-nexus-border text-nexus-muted hover:border-nexus-primary/30'
                        }`}
                      >
                        {platform}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 素材位置 */}
              <div>
                <label className="block text-xs font-semibold text-nexus-muted mb-1.5 uppercase tracking-wider">
                  图片/视频放在了哪 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={publishMediaLocation}
                  onChange={(e) => setPublishMediaLocation(e.target.value)}
                  placeholder='例如：已经放在了相册，第一个视频就是'
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl py-2.5 px-4 text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors"
                />
              </div>

              {/* 标题 */}
              <div>
                <label className="block text-xs font-semibold text-nexus-muted mb-1.5 uppercase tracking-wider">
                  发布标题 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  placeholder='输入发布标题'
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl py-2.5 px-4 text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors"
                />
              </div>

              {/* 关键词 */}
              <div>
                <label className="block text-xs font-semibold text-nexus-muted mb-1.5 uppercase tracking-wider">
                  关键词 #
                </label>
                <input
                  type="text"
                  value={publishKeywords}
                  onChange={(e) => setPublishKeywords(e.target.value)}
                  placeholder='例如：#好物推荐 #开箱测评'
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl py-2.5 px-4 text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors"
                />
              </div>

              {/* 简介（可选） */}
              <div>
                <label className="block text-xs font-semibold text-nexus-muted mb-1.5 uppercase tracking-wider">
                  简介（可选）
                </label>
                <textarea
                  value={publishDescription}
                  onChange={(e) => setPublishDescription(e.target.value)}
                  placeholder='输入发布简介...'
                  rows={3}
                  className="cursor-target w-full bg-nexus-bg border border-nexus-border rounded-xl py-2.5 px-4 text-nexus-text placeholder-nexus-muted/60 focus:outline-none focus:border-nexus-primary/50 font-mono text-sm transition-colors resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="cursor-target flex-1 py-3 rounded-xl bg-nexus-bg border border-nexus-border text-nexus-muted font-bold text-sm hover:text-nexus-text hover:border-nexus-primary/30 transition-all"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`cursor-target flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              canSubmit
                ? 'bg-nexus-primary text-nexus-inverse hover:bg-nexus-primary/90 shadow-cyber-glow'
                : 'bg-nexus-bg border border-nexus-border text-nexus-muted cursor-not-allowed'
            }`}
          >
            <Send size={15} />
            {skill.dialogType === 'confirm' ? '确认开启' : '立即执行'}
          </button>
        </div>

        {/* 提示信息 */}
        {!wsConnected && (
          <p className="text-[10px] text-red-400 text-center mt-3 font-mono">
            ⚠ WebSocket 未连接，请检查后端服务
          </p>
        )}
        {!hasDevice && wsConnected && (
          <p className="text-[10px] text-yellow-400 text-center mt-3 font-mono">
            ⚠ 未检测到设备，请连接手机
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
