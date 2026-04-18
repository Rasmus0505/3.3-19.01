/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UploadProgress } from '../features/upload/components/UploadProgress';

describe('UploadProgress', () => {
  describe('idle state', () => {
    it('should return null when not uploading and progress is 0', () => {
      const { container } = render(
        <UploadProgress
          progress={0}
          stage="idle"
          isUploading={false}
          error={null}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('uploading state', () => {
    it('should display progress percentage', () => {
      render(
        <UploadProgress
          progress={50}
          stage="uploading"
          isUploading={true}
          error={null}
        />
      );

      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('should display correct stage label', () => {
      render(
        <UploadProgress
          progress={50}
          stage="uploading"
          isUploading={true}
          error={null}
        />
      );

      expect(screen.getByText('上传中')).toBeInTheDocument();
    });

    it('should show spinning loader when uploading', () => {
      const { container } = render(
        <UploadProgress
          progress={50}
          stage="uploading"
          isUploading={true}
          error={null}
        />
      );

      const loader = container.querySelector('.animate-spin');
      expect(loader).toBeInTheDocument();
    });

    it('should show warning message when uploading', () => {
      render(
        <UploadProgress
          progress={50}
          stage="uploading"
          isUploading={true}
          error={null}
        />
      );

      expect(screen.getByText(/请勿关闭页面/)).toBeInTheDocument();
    });
  });

  describe('completed state', () => {
    it('should display completion stage label', () => {
      render(
        <UploadProgress
          progress={100}
          stage="completed"
          isUploading={false}
          error={null}
        />
      );

      expect(screen.getByText('完成')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should display error message', () => {
      render(
        <UploadProgress
          progress={0}
          stage="error"
          isUploading={false}
          error="网络连接失败"
        />
      );

      expect(screen.getByText('上传失败')).toBeInTheDocument();
      expect(screen.getByText('网络连接失败')).toBeInTheDocument();
    });

    it('should not display progress bar when error', () => {
      const { queryByText } = render(
        <UploadProgress
          progress={50}
          stage="error"
          isUploading={false}
          error="Some error"
        />
      );

      // Error state should not show progress percentage
      expect(queryByText('50%')).not.toBeInTheDocument();
    });
  });

  describe('stage labels', () => {
    const stages = [
      { stage: 'preparing', expected: '准备中' },
      { stage: 'processing', expected: '处理中' },
      { stage: 'transcribing', expected: '语音识别中' },
      { stage: 'translating', expected: '翻译中' },
      { stage: 'generating', expected: '生成中' },
    ];

    stages.forEach(({ stage, expected }) => {
      it(`should display correct label for stage: ${stage}`, () => {
        render(
          <UploadProgress
            progress={25}
            stage={stage}
            isUploading={true}
            error={null}
          />
        );

        expect(screen.getByText(expected)).toBeInTheDocument();
      });
    });
  });
});


