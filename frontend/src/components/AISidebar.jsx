import { useState, useRef, useCallback } from "react";
import { PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose } from "lucide-react";

/**
 * AI 侧边栏组件
 * @param {Object} props
 * @param {'left' | 'right'} props.side - 左侧还是右侧
 * @param {React.ReactNode} props.children - AI 内容插槽
 * @param {string} props.title - 侧边栏标题
 * @param {number} props.defaultWidth - 默认宽度 (px)
 * @param {number} props.minWidth - 最小宽度 (px)
 * @param {number} props.maxWidth - 最大宽度 (px)
 * @param {string} props.collapsedIcon - 折叠状态显示的图标
 */
export default function AISidebar({
  side = "right",
  children,
  title = "AI 助手",
  defaultWidth = 280,
  minWidth = 200,
  maxWidth = 400,
  collapsedIcon = "🤖",
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  const isLeft = side === "left";

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (e) => {
      const delta = isLeft ? e.clientX - startX : startX - e.clientX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width, minWidth, maxWidth, isLeft]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div
      ref={sidebarRef}
      className={`ai-sidebar ${isCollapsed ? "ai-sidebar--collapsed" : ""} ${isResizing ? "ai-sidebar--resizing" : ""}`}
      style={{
        width: isCollapsed ? "60px" : `${width}px`,
        [isLeft ? "borderRight" : "borderLeft"]: "1px solid var(--border)",
      }}
      data-side={side}
    >
      {/* 折叠/展开按钮 */}
      <button
        type="button"
        className="ai-sidebar__toggle"
        onClick={toggleCollapse}
        aria-label={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        title={isCollapsed ? "展开" : "收起"}
      >
        {isLeft ? (
          isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />
        ) : (
          isCollapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />
        )}
      </button>

      {/* 折叠状态显示图标 */}
      {isCollapsed && (
        <div className="ai-sidebar__collapsed-icons">
          <span className="ai-sidebar__icon" title={title}>{collapsedIcon}</span>
        </div>
      )}

      {/* 展开状态显示内容 */}
      {!isCollapsed && (
        <div className="ai-sidebar__content">
          <div className="ai-sidebar__header">
            <h3 className="ai-sidebar__title">{title}</h3>
          </div>
          <div className="ai-sidebar__body">
            {children || (
              <div className="ai-sidebar__placeholder">
                <span className="ai-sidebar__placeholder-icon">{collapsedIcon}</span>
                <p>AI 功能开发中...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 拖动调整宽度的手柄 */}
      {!isCollapsed && (
        <div
          className="ai-sidebar__resizer"
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整宽度"
        />
      )}
    </div>
  );
}


