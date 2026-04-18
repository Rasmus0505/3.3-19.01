export default function ImmersiveLayout({
  leftTopContent,
  leftBottomContent,
  rightTopContent,
  rightBottomContent,
  fullscreenStudyMode = false,
}) {
  const layoutClassName = `immersive-layout immersive-layout--workbench${
    fullscreenStudyMode ? " immersive-layout--fullscreen-study" : ""
  }`;

  if (fullscreenStudyMode) {
    return (
      <div className={layoutClassName}>
        <section className="immersive-layout__left immersive-layout__left--fullscreen" aria-label="全屏视频与拼写工作区">
          {leftTopContent}
          {leftBottomContent}
        </section>
      </div>
    );
  }

  return (
    <div className={layoutClassName}>
      <section className="immersive-layout__left" aria-label="视频与拼写工作区">
        <div className="immersive-layout__left-top">{leftTopContent}</div>
        <div className="immersive-layout__divider-horizontal" aria-hidden="true" />
        <div className="immersive-layout__left-bottom">{leftBottomContent}</div>
      </section>

      {!fullscreenStudyMode ? <div className="immersive-layout__divider-vertical" aria-hidden="true" /> : null}

      {!fullscreenStudyMode ? (
        <aside className="immersive-layout__right" aria-label="讲解与题目工作区">
          <div className="immersive-layout__right-top">{rightTopContent}</div>
          <div className="immersive-layout__divider-horizontal" aria-hidden="true" />
          <div className="immersive-layout__right-bottom">{rightBottomContent}</div>
        </aside>
      ) : null}
    </div>
  );
}


