import type { IconName } from "../types/workspace";
export const moreFeatures: Array<{
  id:
    | "chat-assistant"
    | "long-book-analysis"
    | "revision-analysis"
    | "short-book-analysis"
    | "style-comparison"
    | "skill-marketplace"
    | "cloud-backup"
    | "device-sync"
    | "zhuque-detection";
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    id: "chat-assistant",
    label: "聊天",
    description: "打开独立聊天助手",
    icon: "message"
  },
  {
    id: "revision-analysis",
    label: "修改分析",
    description: "从文稿修改中学习可复用技能",
    icon: "file"
  },
  {
    id: "short-book-analysis",
    label: "短篇拆书分析",
    description: "整篇分析，支持最多 10 本联合提炼",
    icon: "book"
  },
  {
    id: "long-book-analysis",
    label: "长篇拆书分析",
    description: "分批提炼长篇剧情、人物与文风",
    icon: "book"
  },
  {
    id: "style-comparison",
    label: "文风比对",
    description: "比较两份文本的文风与相似度",
    icon: "file"
  },
  {
    id: "skill-marketplace",
    label: "技能广场",
    description: "发现、安装与发布写作技能",
    icon: "globe"
  },
  {
    id: "device-sync",
    label: "双端同步",
    description: "使用自己的网盘接续写作",
    icon: "archive"
  },
  {
    id: "cloud-backup",
    label: "云端备份",
    description: "备份创作空间和资料",
    icon: "archive"
  },
  {
    id: "zhuque-detection",
    label: "朱雀检测",
    description: "检测文本中的 AI 生成内容",
    icon: "globe"
  }
];
