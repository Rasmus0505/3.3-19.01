import { Suspense, lazy } from "react";

import { AuthPanel } from "../../features/auth/components/AuthPanel";
import { GettingStartedPanel } from "../../features/getting-started/GettingStartedPanel";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui";
import { REFRESH_KEY, TOKEN_KEY } from "../authStorage";

const ImmersiveLessonPage = lazy(() =>
  import("../../features/immersive/ImmersiveLessonPage").then((module) => ({ default: module.ImmersiveLessonPage })),
);
const LessonList = lazy(() => import("../../features/lessons/components/LessonList").then((module) => ({ default: module.LessonList })));
const WordbookPanel = lazy(() => import("../../features/wordbook/WordbookPanel").then((module) => ({ default: module.WordbookPanel })));
const UploadPanel = lazy(() => import("../../features/upload/UploadPanel").then((module) => ({ default: module.UploadPanel })));
const RedeemCodePanel = lazy(() => import("../../features/wallet/components/RedeemCodePanel").then((module) => ({ default: module.RedeemCodePanel })));

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
  totalLessons,
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
  onBulkDeleteLessons,
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
  wordbookRefreshToken = 0,
  onWordbookChanged,
}) {
  const publicPanels = new Set(["getting-started"]);
  const contentAlert = globalStatus ? (
    <Alert variant="destructive">
      <AlertTitle>系统消息</AlertTitle>
      <AlertDescription>{globalStatus}</AlertDescription>
    </Alert>
  ) : null;

  function renderActivePanelContent() {
    if (activePanel === "getting-started") {
      return (
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
      );
    }

    if (activePanel === "history") {
      return (
        <Suspense fallback={<PanelFallback />}>
          <LessonList
            lessons={lessons}
            totalLessons={totalLessons}
            currentLessonId={currentLesson?.id}
            currentLessonNeedsBinding={currentLessonNeedsBinding}
            lessonCardMetaMap={lessonCardMetaMap}
            lessonMediaMetaMap={lessonMediaMetaMap}
            guideTargetLessonId={guideTargetLessonId}
            onStartLesson={onStartLesson}
            onRename={onRenameLesson}
            onDelete={onDeleteLesson}
            onBulkDelete={onBulkDeleteLessons}
            onRestoreMedia={onRestoreLessonMedia}
            onSwitchToUpload={onSwitchToUpload}
            loading={loadingLessons}
            hasMore={hasMoreLessons}
            loadingMore={loadingMoreLessons}
            onLoadMore={onLoadMoreLessons}
          />
        </Suspense>
      );
    }

    if (activePanel === "wordbook") {
      return (
        <Suspense fallback={<PanelFallback />}>
          <WordbookPanel apiCall={apiCall} refreshToken={wordbookRefreshToken} />
        </Suspense>
      );
    }

    if (activePanel === "upload") {
      return (
        <Suspense fallback={<PanelFallback />}>
          <UploadPanel
            accessToken={accessToken}
            isActivePanel
            onCreated={onCreatedLesson}
            balancePoints={walletBalance}
            billingRates={billingRates}
            subtitleSettings={subtitleSettings}
            onWalletChanged={onWalletChanged}
            onTaskStateChange={onTaskStateChange}
            onNavigateToLesson={onNavigateToGeneratedLesson}
          />
        </Suspense>
      );
    }

    if (activePanel === "redeem") {
      return (
        <Suspense fallback={<PanelFallback />}>
          <RedeemCodePanel apiCall={apiCall} onWalletChanged={onWalletChanged} />
        </Suspense>
      );
    }

    return null;
  }

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
            onWordbookChanged={onWordbookChanged}
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
        renderActivePanelContent()
      )}
    </section>
  );
}
