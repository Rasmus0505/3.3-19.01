import { useState, useRef, useCallback } from "react";
import AISidebar from "./AISidebar";

/**
 * 学习页面主布局组件
 * @param {Object} props
 * @param {React.ReactNode} props.videoContent - 视频内容
 * @param {React.ReactNode} props.typingContent - 拼写内容
 * @param {React.ReactNode} props.leftSidebarContent - 左侧 AI 老师内容
 * @param {React.ReactNode} props.rightSidebarContent - 右侧 AI 陪看内容
 * @param {string} props.leftSidebarTitle - 左侧侧边栏标题
 * @param {string} props.rightSidebarTitle - 右侧侧边栏标题
 */
export default function LearningLayout({
  videoContent,
  typingContent,
  leftSidebarContent,
  rightSidebarContent,
  leftSidebarTitle = "AI 老师",
  rightSidebarTitle = "AI 陪看",
}) {
  const [typingHeight, setTypingHeight] = useState(200);
  const [isResizingTyping, setIsResizingTyping] = useState(false);
  const typingContainerRef = useRef(null);

  const handleTypingResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizingTyping(true);

    const startY = e.clientY;
    const startHeight = typingHeight;

    const handleMouseMove = (e) => {
      const delta = startY - e.clientY;
      const newHeight = Math.min(400, Math.max(120, startHeight + delta));
      setTypingHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizingTyping(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [typingHeight]);

  return (
    <div className="learning-layout">
      {/* 顶部区域：侧边栏 + 视频 */}
      <div className="learning-layout__main">
        {/* 左侧 AI 老师侧边栏 */}
        <AISidebar side="left" title={leftSidebarTitle} collapsedIcon="📚">
          {leftSidebarContent}
        </AISidebar>

        {/* 视频区域 */}
        <div className="learning-layout__video">
          {videoContent}
        </div>

        {/* 右侧 AI 陪看侧边栏 */}
        <AISidebar side="right" title={rightSidebarTitle} collapsedIcon="💬">
          {rightSidebarContent}
        </AISidebar>
      </div>

      {/* 底部拼写区域 */}
      <div
        ref={typingContainerRef}
        className={`learning-layout__typing ${isResizingTyping ? "learning-layout__typing--resizing" : ""}`}
        style={{ height: `${typingHeight}px` }}
      >
        {/* 拖动调整高度的手柄 */}
        <div
          className="learning-layout__typing-resizer"
          onMouseDown={handleTypingResizeStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整拼写区域高度"
        />
        <div className="learning-layout__typing-content">
          {typingContent}
        </div>
      </div>
    </div>
  );
}


