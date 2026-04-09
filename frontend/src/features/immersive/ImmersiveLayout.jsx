/**
 * ImmersiveLayout - 沉浸学习页面左右均分布局
 *
 * 左列 50%：视频区(60%) + 拼写区(40%)，中间水平分割线
 * 右列 50%：讲解区(50%) + 预留区(50%)，中间水平分割线
 * 左列右侧有垂直分割线，右列右侧贴网页边缘无分割线
 *
 * 全屏铺满，无边距间隔
 */
export default function ImmersiveLayout({
  // 左列上方 - 视频区
  leftTopContent,
  // 左列下方 - 拼写区
  leftBottomContent,
  // 右列上方 - 讲解区
  rightTopContent,
  // 右列下方 - 预留区（可传空或 null）
  rightBottomContent,
}) {
  return (
    <div className="immersive-layout">
      {/* 左列：视频 + 拼写（60:40 固定比例） */}
      <div className="immersive-layout__left">
        <div className="immersive-layout__left-top">
          {leftTopContent}
        </div>
        <div className="immersive-layout__divider-horizontal" />
        <div className="immersive-layout__left-bottom">
          {leftBottomContent}
        </div>
      </div>

      {/* 左右列之间的垂直分割线 */}
      <div className="immersive-layout__divider-vertical" />

      {/* 右列：讲解 + 预留（50:50 固定比例） */}
      <div className="immersive-layout__right">
        <div className="immersive-layout__right-top">
          {rightTopContent}
        </div>
        <div className="immersive-layout__divider-horizontal" />
        <div className="immersive-layout__right-bottom">
          {rightBottomContent}
        </div>
      </div>
    </div>
  );
}
