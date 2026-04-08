/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUploadPanelState } from '../features/upload/hooks/useUploadPanelState';

describe('useUploadPanelState', () => {
  describe('initial state', () => {
    it('should have correct initial values', () => {
      const { result } = renderHook(() => useUploadPanelState());

      expect(result.current.state.selectedFile).toBeNull();
      expect(result.current.state.uploadProgress).toBe(0);
      expect(result.current.state.uploadStage).toBe('idle');
      expect(result.current.state.isUploading).toBe(false);
      expect(result.current.state.uploadError).toBeNull();
      expect(result.current.state.selectedAsrModel).toBe('qwen3-asr-flash-filetrans');
    });
  });

  describe('file selection', () => {
    it('should update selected file', () => {
      const { result } = renderHook(() => useUploadPanelState());

      const mockFile = new File(['test content'], 'test.mp3', { type: 'audio/mpeg' });

      act(() => {
        result.current.actions.setSelectedFile(mockFile);
      });

      expect(result.current.state.selectedFile).toBe(mockFile);
      expect(result.current.state.fileSize).toBeNull(); // Not set yet
    });

    it('should update file preview', () => {
      const { result } = renderHook(() => useUploadPanelState());

      act(() => {
        result.current.actions.setFilePreview('blob:http://localhost/preview');
      });

      expect(result.current.state.filePreview).toBe('blob:http://localhost/preview');
    });

    it('should update file duration', () => {
      const { result } = renderHook(() => useUploadPanelState());

      act(() => {
        result.current.actions.setFileDuration(120000); // 2 minutes
      });

      expect(result.current.state.fileDuration).toBe(120000);
    });
  });

  describe('upload state', () => {
    it('should update upload progress', () => {
      const { result } = renderHook(() => useUploadPanelState());

      act(() => {
        result.current.actions.setUploadProgress(50);
      });

      expect(result.current.state.uploadProgress).toBe(50);
    });

    it('should update upload stage', () => {
      const { result } = renderHook(() => useUploadPanelState());

      act(() => {
        result.current.actions.setUploadStage('uploading');
      });

      expect(result.current.state.uploadStage).toBe('uploading');
    });

    it('should set uploading flag', () => {
      const { result } = renderHook(() => useUploadPanelState());

      act(() => {
        result.current.actions.setIsUploading(true);
      });

      expect(result.current.state.isUploading).toBe(true);
    });

    it('should set upload error', () => {
      const { result } = renderHook(() => useUploadPanelState());

      act(() => {
        result.current.actions.setUploadError('Network error');
      });

      expect(result.current.state.uploadError).toBe('Network error');
    });
  });

  describe('ASR model selection', () => {
    it('should update selected ASR model', () => {
      const { result } = renderHook(() => useUploadPanelState());

      act(() => {
        result.current.actions.setSelectedAsrModel('faster-whisper-medium');
      });

      expect(result.current.state.selectedAsrModel).toBe('faster-whisper-medium');
    });
  });

  describe('clearAllState', () => {
    it('should reset all state to initial values', () => {
      const { result } = renderHook(() => useUploadPanelState());

      // Set some state
      act(() => {
        result.current.actions.setSelectedFile(new File([''], 'test.mp3'));
        result.current.actions.setUploadProgress(50);
        result.current.actions.setUploadStage('uploading');
        result.current.actions.setIsUploading(true);
        result.current.actions.setUploadError('some error');
      });

      // Clear all
      act(() => {
        result.current.actions.clearAllState();
      });

      expect(result.current.state.selectedFile).toBeNull();
      expect(result.current.state.filePreview).toBeNull();
      expect(result.current.state.fileDuration).toBeNull();
      expect(result.current.state.uploadProgress).toBe(0);
      expect(result.current.state.uploadStage).toBe('idle');
      expect(result.current.state.isUploading).toBe(false);
      expect(result.current.state.uploadError).toBeNull();
    });
  });
});
