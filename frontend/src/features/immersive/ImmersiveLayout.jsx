export default function ImmersiveLayout({
  mainContent,
  bottomContent,
  sideContent,
  sideOpen = false,
  onSideDismiss,
  sideLabel = "讲解面板",
}) {
  return (
    <div className={`immersive-layout ${sideOpen ? "immersive-layout--side-open" : ""}`}>
      <div className="immersive-layout__main">{mainContent}</div>
      <button
        type="button"
        aria-label="关闭讲解面板"
        className="immersive-layout__backdrop"
        onClick={onSideDismiss}
      />
      <aside
        className="immersive-layout__side"
        aria-label={sideLabel}
        aria-hidden={!sideOpen}
      >
        {sideContent}
      </aside>
      <div className="immersive-layout__bottom">{bottomContent}</div>
    </div>
  );
}
