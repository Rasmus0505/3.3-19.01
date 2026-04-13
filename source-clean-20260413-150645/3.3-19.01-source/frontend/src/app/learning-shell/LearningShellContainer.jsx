import { api } from "../../shared/api/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "../../shared/ui";
import { useAppStore } from "../../store";
import { AnnouncementBanner } from "../../components/AnnouncementBanner";
import { AnnouncementModal } from "../../components/AnnouncementModal";
import { LearningShellAdminContent } from "./LearningShellAdminContent";
import { ConflictDialog } from "./ConflictDialog";
import { LearningShellHeader } from "./LearningShellHeader";
import { LearningShellPanelContent } from "./LearningShellPanelContent";
import { SIDEBAR_STORAGE_KEY, LearningShellSidebar } from "./LearningShellSidebar";
import { UploadTaskFloatingCard } from "./UploadTaskFloatingCard";
import { useLearningShellController } from "./hooks/useLearningShellController";
import { useCurrentLessonMediaBinding } from "./hooks/useCurrentLessonMediaBinding";
import { useDesktopSync } from "./hooks/useDesktopSync";
import { useLearningShellBootstrap } from "./hooks/useLearningShellBootstrap";
import { useLearningShellPrefetch } from "./hooks/useLearningShellPrefetch";
import { useOfflineMode } from "../../hooks/useOfflineMode";

export function LearningShellContainer() {
  const accessToken = useAppStore((state) => state.accessToken);
  const hasStoredToken = useAppStore((state) => state.hasStoredToken);
  const authStatus = useAppStore((state) => state.authStatus);
  const authStatusMessage = useAppStore((state) => state.authStatusMessage);
  const currentUser = useAppStore((state) => state.currentUser);
  const hydrateAccessToken = useAppStore((state) => state.hydrateAccessToken);
  const logout = useAppStore((state) => state.logout);
  const detectAdmin = useAppStore((state) => state.detectAdmin);
  const isAdminUser = useAppStore((state) => state.isAdminUser);
  const adminAuthState = useAppStore((state) => state.adminAuthState);

  const lessons = useAppStore((state) => state.lessons);
  const lessonsTotal = useAppStore((state) => state.lessonsTotal);
  const lessonsPage = useAppStore((state) => state.lessonsPage);
  const lessonsQuery = useAppStore((state) => state.lessonsQuery);
  const hasMoreLessons = useAppStore((state) => state.hasMoreLessons);
  const loadingLessons = useAppStore((state) => state.loadingLessons);
  const loadingMoreLessons = useAppStore((state) => state.loadingMoreLessons);
  const currentLesson = useAppStore((state) => state.currentLesson);
  const walletBalance = useAppStore((state) => state.walletBalance);
  const billingRates = useAppStore((state) => state.billingRates);
  const subtitleSettings = useAppStore((state) => state.subtitleSettings);
  const lessonCardMetaMap = useAppStore((state) => state.lessonCardMetaMap);
  const lessonMediaMetaMap = useAppStore((state) => state.lessonMediaMetaMap);
  const currentLessonNeedsBinding = useAppStore((state) => state.currentLessonNeedsBinding);
  const mediaRestoreTick = useAppStore((state) => state.mediaRestoreTick);

  const globalStatus = useAppStore((state) => state.globalStatus);
  const commandOpen = useAppStore((state) => state.commandOpen);
  const commandQuery = useAppStore((state) => state.commandQuery);
  const mobileNavOpen = useAppStore((state) => state.mobileNavOpen);
  const immersiveActive = useAppStore((state) => state.immersiveActive);
  const uploadTaskState = useAppStore((state) => state.uploadTaskState);

  const loadCatalog = useAppStore((state) => state.loadCatalog);
  const loadLessonDetail = useAppStore((state) => state.loadLessonDetail);
  const loadWallet = useAppStore((state) => state.loadWallet);
  const loadBillingRates = useAppStore((state) => state.loadBillingRates);
  const refreshCurrentLesson = useAppStore((state) => state.refreshCurrentLesson);
  const renameLesson = useAppStore((state) => state.renameLesson);
  const deleteLesson = useAppStore((state) => state.deleteLesson);
  const deleteLessonsBulk = useAppStore((state) => state.deleteLessonsBulk);
  const refreshSubtitleCacheMeta = useAppStore((state) => state.refreshSubtitleCacheMeta);
  const prefetchLessonMediaMeta = useAppStore((state) => state.prefetchLessonMediaMeta);
  const detectCurrentLessonMediaBinding = useAppStore((state) => state.detectCurrentLessonMediaBinding);
  const mergeLessonMediaMeta = useAppStore((state) => state.mergeLessonMediaMeta);
  const setCurrentLessonNeedsBinding = useAppStore((state) => state.setCurrentLessonNeedsBinding);
  const bumpMediaRestoreTick = useAppStore((state) => state.bumpMediaRestoreTick);

  const setGlobalStatus = useAppStore((state) => state.setGlobalStatus);
  const setCommandOpen = useAppStore((state) => state.setCommandOpen);
  const setCommandQuery = useAppStore((state) => state.setCommandQuery);
  const setMobileNavOpen = useAppStore((state) => state.setMobileNavOpen);
  const setImmersiveActive = useAppStore((state) => state.setImmersiveActive);
  const setUploadTaskState = useAppStore((state) => state.setUploadTaskState);

  useLearningShellBootstrap({
    accessToken,
    loadCatalog,
    loadWallet,
    loadBillingRates,
  });

  const isDesktopEnv = Boolean(typeof window !== "undefined" && window.syncEngine);
  const desktopSync = useDesktopSync({ accessToken, isDesktop: isDesktopEnv });

  const offlineMode = useOfflineMode({
    onSyncStart: () => desktopSync.forceSync?.(),
    onSyncComplete: (itemsCount) => {
      if (itemsCount !== undefined) {
        offlineMode.notifySyncComplete(itemsCount);
      }
    },
  });

  const controller = useLearningShellController({
    accessToken,
    hasStoredToken,
    authStatus,
    authStatusMessage,
    currentLesson,
    currentUser,
    lessons,
    lessonsTotal,
    lessonsPage,
    lessonsQuery,
    hasMoreLessons,
    loadingLessons,
    loadingMoreLessons,
    walletBalance,
    billingRates,
    subtitleSettings,
    lessonCardMetaMap,
    lessonMediaMetaMap,
    currentLessonNeedsBinding,
    mediaRestoreTick,
    globalStatus,
    commandOpen,
    commandQuery,
    immersiveActive,
    loadCatalog,
    loadLessonDetail,
    loadWallet,
    refreshCurrentLesson,
    renameLesson,
    deleteLesson,
    deleteLessonsBulk,
    refreshSubtitleCacheMeta,
    mergeLessonMediaMeta,
    setCurrentLessonNeedsBinding,
    bumpMediaRestoreTick,
    setGlobalStatus,
    setCommandOpen,
    setCommandQuery,
    setMobileNavOpen,
    setImmersiveActive,
    setUploadTaskState,
    hydrateAccessToken,
    logout,
    detectAdmin,
    isAdminUser,
    adminAuthState,
    desktopSync,
  });

  useLearningShellPrefetch({
    accessToken,
    activePanel: controller.activePanel,
    immersiveLayoutActive: controller.immersiveLayoutActive,
    lessons,
    prefetchLessonMediaMeta,
    refreshSubtitleCacheMeta,
  });
  useCurrentLessonMediaBinding({
    currentLesson,
    detectCurrentLessonMediaBinding,
  });

  return (
    <SidebarProvider storageKey={SIDEBAR_STORAGE_KEY}>
      <div className="section-soft min-h-screen overflow-x-clip bg-background md:flex">
        {!controller.immersiveLayoutActive ? (
          <Sidebar className="bg-background/95">
            <LearningShellSidebar
              activePanel={controller.activePanel}
              onPanelSelect={controller.handlePanelChange}
              accessToken={accessToken}
              walletBalance={walletBalance}
              hasLessons={lessons.length > 0}
              onOpenSearch={() => setCommandOpen(true)}
              onLogout={controller.handleLogout}
              hasStoredToken={hasStoredToken}
              authStatus={authStatus}
              authStatusMessage={authStatusMessage}
              isAdminUser={isAdminUser}
              isAdminRoute={controller.isAdminRoute}
              activeAdminKey={controller.activeAdminItem.key}
              adminNavExpanded={controller.adminNavExpanded}
              onAdminToggle={controller.handleAdminToggle}
              onAdminSelect={controller.handleAdminSelect}
              isDesktopSync={isDesktopEnv}
              syncStatus={desktopSync.syncStatus}
              syncInProgress={desktopSync.syncStatus === "syncing"}
              syncCompleted={desktopSync.completedItems}
              syncTotal={desktopSync.totalItems}
              lastSyncDisplay={desktopSync.lastSyncDisplay}
              onForceSync={desktopSync.forceSync}
              pendingCounts={desktopSync.pendingCounts}
              onOpenConflicts={() => controller.setConflictDialogOpen(true)}
              isOnline={offlineMode.isOnline}
              isSyncing={offlineMode.isSyncing}
              connectionStatus={offlineMode.syncStatus}
              connectionLastSyncDisplay={offlineMode.lastSyncDisplay}
              connectionSyncedItems={offlineMode.syncedItems}
            />
          </Sidebar>
        ) : null}

        <SidebarInset className="min-w-0">
          {!controller.immersiveLayoutActive ? (
            <LearningShellHeader
              currentPanel={controller.currentPanel}
              accessToken={accessToken}
              lessonsCount={lessons.length}
              walletBalance={walletBalance}
              mobileNavOpen={mobileNavOpen}
              setMobileNavOpen={setMobileNavOpen}
              activePanel={controller.activePanel}
              onPanelSelect={controller.handlePanelChange}
              onOpenSearch={() => setCommandOpen(true)}
              onLogout={controller.handleLogout}
              hasStoredToken={hasStoredToken}
              authStatus={authStatus}
              authStatusMessage={authStatusMessage}
              isAdminUser={isAdminUser}
              isAdminRoute={controller.isAdminRoute}
              activeAdminKey={controller.activeAdminItem.key}
              adminNavExpanded={controller.adminNavExpanded}
              onAdminToggle={controller.handleAdminToggle}
              onAdminSelect={controller.handleAdminSelect}
            />
          ) : null}

          {!controller.isAdminRoute && accessToken && controller.announcements.filter((a) => a.type === "banner").length > 0 ? (
            <div className="container-wrapper py-0">
              <div className="container space-y-2">
                {controller.announcements
                  .filter((a) => a.type === "banner")
                  .map((ann) => (
                    <AnnouncementBanner key={ann.id} announcement={ann} />
                  ))}
              </div>
            </div>
          ) : null}

          <main className="container-wrapper min-w-0 py-3 md:py-6">
            <div className="container">
              {controller.isAdminRoute ? (
                <LearningShellAdminContent
                  accessToken={accessToken}
                  hasStoredToken={hasStoredToken}
                  authStatus={authStatus}
                  authStatusMessage={authStatusMessage}
                  adminAuthState={adminAuthState}
                  isAdminUser={isAdminUser}
                  onGoToLogin={controller.handleGoToLogin}
                  onGoToHistory={controller.handleGoToHistoryPanel}
                  onLogout={controller.handleLogout}
                  apiCall={(path, options = {}) => api(path, options, accessToken)}
                />
              ) : (
                <LearningShellPanelContent
                  activePanel={controller.activePanel}
                  accessToken={accessToken}
                  currentLesson={currentLesson}
                  currentUser={currentUser}
                  immersiveLayoutActive={controller.immersiveLayoutActive}
                  mediaRestoreTick={mediaRestoreTick}
                  globalStatus={globalStatus}
                  onAuthed={controller.handleAuthed}
                  onProgressSynced={refreshCurrentLesson}
                  onExitImmersive={controller.handleExitImmersive}
                  onStartImmersive={controller.handleStartImmersive}
                  lessons={lessons}
                  totalLessons={lessonsTotal}
                  currentLessonNeedsBinding={currentLessonNeedsBinding}
                  lessonCardMetaMap={lessonCardMetaMap}
                  lessonMediaMetaMap={lessonMediaMetaMap}
                  loadingLessons={loadingLessons}
                  hasMoreLessons={hasMoreLessons}
                  loadingMoreLessons={loadingMoreLessons}
                  onLoadMoreLessons={controller.handleLoadMoreLessons}
                  onStartLesson={controller.handleStartLesson}
                  onRenameLesson={controller.handleRenameLesson}
                  onDeleteLesson={controller.handleDeleteLesson}
                  onBulkDeleteLessons={controller.handleBulkDeleteLessons}
                  onRestoreLessonMedia={controller.handleRestoreLessonMedia}
                  onRefreshHistory={() => loadCatalog({ page: 1, query: lessonsQuery, autoEnterImmersive: false })}
                  onSwitchToUpload={() => controller.handlePanelChange("upload")}
                  walletBalance={walletBalance}
                  billingRates={billingRates}
                  subtitleSettings={subtitleSettings}
                  onCreatedLesson={controller.handleLessonCreated}
                  onWalletChanged={loadWallet}
                  onTaskStateChange={setUploadTaskState}
                  onNavigateToGeneratedLesson={controller.handleNavigateToGeneratedLesson}
                  apiCall={(path, options = {}) => api(path, options, accessToken)}
                  isMobileViewport={controller.isMobileViewport}
                  onGoToLogin={controller.handleGoToLogin}
                  onGoToHistory={controller.handleGoToHistoryPanel}
                  guideTargetLessonId={controller.latestGeneratedLessonId}
                  wordbookRefreshToken={controller.wordbookRefreshToken}
                  onWordbookChanged={controller.handleWordbookChanged}
                  isOnline={offlineMode.isOnline}
                />
              )}
            </div>
          </main>

          {!controller.isAdminRoute ? (
            <UploadTaskFloatingCard
              activePanel={controller.activePanel}
              accessToken={accessToken}
              uploadTaskState={uploadTaskState}
              onOpenUpload={() => controller.handlePanelChange("upload")}
            />
          ) : null}

          <CommandDialog
            open={commandOpen}
            onOpenChange={(open) => {
              setCommandOpen(open);
              if (!open) {
                setCommandQuery("");
                if (lessonsQuery) {
                  void loadCatalog({ page: 1, query: "" });
                }
              }
            }}
          >
            <CommandInput placeholder="搜索课程名或模型..." value={commandQuery} onValueChange={setCommandQuery} />
            <CommandList>
              <CommandEmpty>没有找到匹配的课程</CommandEmpty>
              <CommandGroup heading="课程">
                {controller.filteredLessons.map((lesson) => (
                  <CommandItem
                    key={lesson.id}
                    value={`${lesson.title || ""} ${lesson.asr_model || ""} ${lesson.id}`}
                    onSelect={() => void controller.handleCommandSelect(lesson.id)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{lesson.title || `课程 ${lesson.id}`}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {lesson.asr_model || "未记录模型"} · {lesson.source_filename || "未知文件"}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </CommandDialog>
        </SidebarInset>
      </div>

      {isDesktopEnv ? (
        <ConflictDialog
          open={controller.conflictDialogOpen}
          onOpenChange={controller.setConflictDialogOpen}
          conflicts={desktopSync.conflicts}
          onResolve={desktopSync.resolveConflict}
        />
      ) : null}

      {accessToken ? (
        <AnnouncementModal announcements={controller.announcements.filter((a) => a.type === "modal")} />
      ) : null}
    </SidebarProvider>
  );
}
