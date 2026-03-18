import { Suspense, lazy } from "react";

import { AuthPanel } from "../../features/auth/AuthPanel";
import { GettingStartedPanel } from "../../features/getting-started/GettingStartedPanel";
import { LearningStatsPanel } from "../../features/learning-stats/LearningStatsPanel";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui";
import { REFRESH_KEY, TOKEN_KEY } from "../authStorage";

const ImmersiveLessonPage = lazy(() =>
  import("../../features/immersive/ImmersiveLessonPage").then((module) => ({ default: module.ImmersiveLessonPage })),
);
const LessonList = lazy(() => import("../../features/lessons/LessonList").then((module) => ({ default: module.LessonList })));
const UploadPanel = lazy(() => import("../../features/upload/UploadPanel").then((module) => ({ default: module.UploadPanel })));
const RedeemCodePanel = lazy(() => import("../../features/wallet/RedeemCodePanel").then((module) => ({ default: module.RedeemCodePanel })));

function PanelFallback() {
  return <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">内容加载中...</div>;
}

export function LearningShellPanelContent({
  activePanel,
  accessToken,
  currentLesson,
  currentUser,
  immersiveLayoutActive,
  mediaRestoreTick,
  globalStatus,
  onAuthed,
  onProgressSynced,
  onExitImmersive,
  onStartImmersive,
  lessons,
  currentLessonNeedsBinding,
  lessonCardMetaMap,
  lessonMediaMetaMap,
  loadingLessons,
  hasMoreLessons,
  loadingMoreLessons,
  onLoadMoreLessons,
  onStartLesson,
  onRenameLesson,
  onDeleteLesson,
  onRestoreLessonMedia,
  onSwitchToUpload,
  walletBalance,
  billingRates,
  subtitleSettings,
  onCreatedLesson,
  onWalletChanged,
  onTaskStateChange,
  onNavigateToGeneratedLesson,
  apiCall,
  isMobileViewport,
  gettingStartedProgress,
  showGettingStartedWelcome,
  onDismissGettingStartedWelcome,
  onStartGettingStartedGuide,
  onGoToLogin,
  onGoToHistory,
  guideTargetLessonId,
}) {
  const publicPanels = new Set(["getting-started"]);
  const contentAlert = globalStatus ? (
    <Alert variant="destructive">
      <AlertTitle>系统消息</AlertTitle>
      <AlertDescription>{globalStatus}</AlertDescription>
    </Alert>
  ) : null;

  if (immersiveLayoutActive) {
    return (
      <section className="min-w-0 space-y-4">
        {contentAlert}
        <Suspense fallback={<PanelFallback />}>
          <ImmersiveLessonPage
            lesson={currentLesson}
            accessToken={accessToken}
            apiClient={apiCall}
            onProgressSynced={onProgressSynced}
            immersiveActive={immersiveLayoutActive}
            onExitImmersive={onExitImmersive}
            onStartImmersive={onStartImmersive}
            externalMediaReloadToken={mediaRestoreTick}
          />
        </Suspense>
      </section>
    );
  }

  return (
      <section className="min-w-0 space-y-4">
      {contentAlert}
      {!accessToken && !publicPanels.has(activePanel) ? (
        <div className="mx-auto max-w-md">
          <AuthPanel onAuthed={onAuthed} tokenKey={TOKEN_KEY} refreshKey={REFRESH_KEY} />
        </div>
      ) : (
        <>
          <div className={activePanel === "getting-started" ? "block" : "hidden"}>
            <GettingStartedPanel
              accessToken={accessToken}
              currentUser={currentUser}
              isMobileViewport={isMobileViewport}
              progressState={gettingStartedProgress}
              showWelcomePrompt={showGettingStartedWelcome}
              onDismissWelcome={onDismissGettingStartedWelcome}
              onStartGuide={onStartGettingStartedGuide}
              onGoLogin={onGoToLogin}
              onGoUpload={() => onSwitchToUpload?.()}
              onGoHistory={onGoToHistory}
            />
          </div>
          <div className={activePanel === "history" ? "block" : "hidden"}>
            <Suspense fallback={<PanelFallback />}>
              <LessonList
                lessons={lessons}
                currentLessonId={currentLesson?.id}
                currentLessonNeedsBinding={currentLessonNeedsBinding}
                lessonCardMetaMap={lessonCardMetaMap}
                lessonMediaMetaMap={lessonMediaMetaMap}
                guideTargetLessonId={guideTargetLessonId}
                onStartLesson={onStartLesson}
                onRename={onRenameLesson}
                onDelete={onDeleteLesson}
                onRestoreMedia={onRestoreLessonMedia}
                onSwitchToUpload={onSwitchToUpload}
                loading={loadingLessons}
                hasMore={hasMoreLessons}
                loadingMore={loadingMoreLessons}
                onLoadMore={onLoadMoreLessons}
              />
            </Suspense>
          </div>
          <div className={activePanel === "stats" ? "block" : "hidden"}>
            <LearningStatsPanel
              accessToken={accessToken}
              onStartLesson={onStartLesson}
              onSwitchToUpload={onSwitchToUpload}
              onGoToHistory={onGoToHistory}
            />
          </div>
          <div className={activePanel === "upload" ? "block" : "hidden"}>
            <Suspense fallback={<PanelFallback />}>
              <UploadPanel
                accessToken={accessToken}
                isActivePanel={activePanel === "upload"}
                onCreated={onCreatedLesson}
                balancePoints={walletBalance}
                billingRates={billingRates}
                subtitleSettings={subtitleSettings}
                onWalletChanged={onWalletChanged}
                onTaskStateChange={onTaskStateChange}
                onNavigateToLesson={onNavigateToGeneratedLesson}
              />
            </Suspense>
          </div>
          <div className={activePanel === "redeem" ? "block" : "hidden"}>
            <Suspense fallback={<PanelFallback />}>
              <RedeemCodePanel apiCall={apiCall} onWalletChanged={onWalletChanged} />
            </Suspense>
          </div>
        </>
      )}
    </section>
  );
}
