export default function ImmersiveLayout({
  leftTopContent,
  leftBottomContent,
  rightTopContent,
  rightBottomContent,
}) {
  return (
    <div className="immersive-layout immersive-layout--workbench">
      <section className="immersive-layout__left" aria-label="视频与拼写工作区">
        <div className="immersive-layout__left-top">{leftTopContent}</div>
        <div className="immersive-layout__divider-horizontal" aria-hidden="true" />
        <div className="immersive-layout__left-bottom">{leftBottomContent}</div>
      </section>

      <div className="immersive-layout__divider-vertical" aria-hidden="true" />

      <aside className="immersive-layout__right" aria-label="讲解与题目工作区">
        <div className="immersive-layout__right-top">{rightTopContent}</div>
        <div className="immersive-layout__divider-horizontal" aria-hidden="true" />
        <div className="immersive-layout__right-bottom">{rightBottomContent}</div>
      </aside>
    </div>
  );
}
