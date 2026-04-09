/**
 * ImmersiveLayout - 沉浸学习页面两列布局容器
 *
 * 左列：视频窗口 + 答题区（flex column）
 * 右列：讲解面板（sticky）
 *
 * 使用 CSS Grid 实现，不依赖外部容器
 */
import ExplanationSidebarContent from "./ExplanationSidebarContent";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function ImmersiveLayout({
  // 左列内容
  videoContent,     // JSX: 视频区域（含 Card/CarHeader）
  typingContent,    // JSX: 答题拼写区域

  // 右列内容
  explanation,      // object: 讲解数据
  audioUrl,         // string: 讲解音频 URL
  onReplay,         // function: 重播回调
  onStartPractice,  // function: 开始练习回调
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="immersive-layout">
      {/* 左列：视频 + 答题 */}
      <div className="immersive-layout__main">
        {videoContent}
        {typingContent}
      </div>

      {/* 右列：讲解面板 */}
      <div className="immersive-layout__sidebar">
        {/* 折叠按钮 */}
        <button
          className="immersive-layout__sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "展开讲解" : "收起讲解"}
        >
          {sidebarCollapsed ? (
            <ChevronLeft className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>

        {/* 讲解内容 */}
        {!sidebarCollapsed && (
          <ExplanationSidebarContent
            explanation={explanation}
            audioUrl={audioUrl}
            onReplay={onReplay}
            onStartPractice={onStartPractice}
          />
        )}
      </div>
    </div>
  );
}
