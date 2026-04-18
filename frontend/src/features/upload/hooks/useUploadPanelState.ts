// 上传面板状态管理 Hook。
// 管理 UploadPanel 的核心状态逻辑。

import { useState, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  getActiveGenerationTask,
  saveActiveGenerationTask,
  clearActiveGenerationTask,
  getUploadPanelSuccessSnapshot,
  saveUploadPanelSuccessSnapshot,
  clearUploadPanelSuccessSnapshot,
} from '../../../shared/media/localTaskStore';

export interface UploadPanelState {
  // 文件状态
  selectedFile: File | null;
  filePreview: string | null;
  fileDuration: number | null;
  fileSize: number | null;

  // 上传状态
  uploadProgress: number;
  uploadStage: string;
  isUploading: boolean;
  uploadError: string | null;

  // ASR 模型
  selectedAsrModel: string;
  asrModelUpdateState: AsrModelUpdateState | null;

  // 生成任务
  activeTask: ActiveGenerationTask | null;

  // 桌面客户端
  isDesktopClientMode: boolean;
  desktopDiagnostics: DesktopDiagnostics | null;

  // 弹窗状态
  diagnosticsDialogOpen: boolean;
  desktopGuidanceDialogOpen: boolean;

  // 本地 ASR
  localAsrState: LocalAsrState | null;
}

export interface AsrModelUpdateState {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  progress?: number;
  lastError?: string;
}

export interface ActiveGenerationTask {
  taskId: string;
  lessonId: number;
  stage: string;
  progress: number;
  error?: string;
}

export interface DesktopDiagnostics {
  version?: string;
  modelVersions?: Record<string, string>;
  storageUsage?: { used: number; total: number };
  runtimeStatus?: string;
}

export interface LocalAsrState {
  status: 'idle' | 'preparing' | 'ready' | 'transcribing' | 'error';
  progress?: number;
  modelKey?: string;
}

export function useUploadPanelState() {
  // 文件状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);

  // 上传状态
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('idle');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ASR 模型
  const [selectedAsrModel, setSelectedAsrModel] = useState('qwen3-asr-flash-filetrans');
  const [asrModelUpdateState, setAsrModelUpdateState] = useState<AsrModelUpdateState | null>(null);

  // 桌面客户端
  const [isDesktopClientMode, setIsDesktopClientMode] = useState(false);
  const [desktopDiagnostics, setDesktopDiagnostics] = useState<DesktopDiagnostics | null>(null);

  // 弹窗状态
  const [diagnosticsDialogOpen, setDiagnosticsDialogOpen] = useState(false);
  const [desktopGuidanceDialogOpen, setDesktopGuidanceDialogOpen] = useState(false);

  // 本地 ASR
  const [localAsrState, setLocalAsrState] = useState<LocalAsrState | null>(null);

  // 恢复状态
  const restoreState = useCallback(() => {
    try {
      const task = getActiveGenerationTask();
      const snapshot = getUploadPanelSuccessSnapshot();
      if (task) {
        setActiveTask({
          taskId: task.taskId,
          lessonId: task.lessonId,
          stage: task.stage,
          progress: task.progress,
          error: task.error,
        });
      }
      return { task, snapshot };
    } catch {
      return { task: null, snapshot: null };
    }
  }, []);

  // 清除所有状态
  const clearAllState = useCallback(() => {
    setSelectedFile(null);
    setFilePreview(null);
    setFileDuration(null);
    setFileSize(null);
    setUploadProgress(0);
    setUploadStage('idle');
    setIsUploading(false);
    setUploadError(null);
    clearActiveGenerationTask();
    clearUploadPanelSuccessSnapshot();
  }, []);

  const state = useMemo(() => ({
    selectedFile,
    filePreview,
    fileDuration,
    fileSize,
    uploadProgress,
    uploadStage,
    isUploading,
    uploadError,
    selectedAsrModel,
    asrModelUpdateState,
    activeTask: null, // 从 useUploadHandlers 获取
    isDesktopClientMode,
    desktopDiagnostics,
    diagnosticsDialogOpen,
    desktopGuidanceDialogOpen,
    localAsrState,
  }), [
    selectedFile,
    filePreview,
    fileDuration,
    fileSize,
    uploadProgress,
    uploadStage,
    isUploading,
    uploadError,
    selectedAsrModel,
    asrModelUpdateState,
    isDesktopClientMode,
    desktopDiagnostics,
    diagnosticsDialogOpen,
    desktopGuidanceDialogOpen,
    localAsrState,
  ]);

  const actions = useMemo(() => ({
    setSelectedFile,
    setFilePreview,
    setFileDuration,
    setFileSize,
    setUploadProgress,
    setUploadStage,
    setIsUploading,
    setUploadError,
    setSelectedAsrModel,
    setAsrModelUpdateState,
    setIsDesktopClientMode,
    setDesktopDiagnostics,
    setDiagnosticsDialogOpen,
    setDesktopGuidanceDialogOpen,
    setLocalAsrState,
    restoreState,
    clearAllState,
  }), [
    restoreState,
    clearAllState,
  ]);

  return { state, actions };
}

export interface ActiveGenerationTask {
  taskId: string;
  lessonId: number;
  stage: string;
  progress: number;
  error?: string;
}

export function useActiveTaskState() {
  const [activeTask, setActiveTask] = useState<ActiveGenerationTask | null>(null);
  const activeTaskRef = useRef<ActiveGenerationTask | null>(null);

  const updateActiveTask = useCallback((task: Partial<ActiveGenerationTask>) => {
    setActiveTask(prev => {
      const updated = prev ? { ...prev, ...task } : null;
      activeTaskRef.current = updated;
      if (updated) {
        saveActiveGenerationTask({
          taskId: updated.taskId,
          lessonId: updated.lessonId,
          stage: updated.stage,
          progress: updated.progress,
          error: updated.error,
        });
      } else {
        clearActiveGenerationTask();
      }
      return updated;
    });
  }, []);

  return { activeTask, activeTaskRef, updateActiveTask, setActiveTask };
}


