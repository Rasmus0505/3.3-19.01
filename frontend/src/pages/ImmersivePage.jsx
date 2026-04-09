import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ImmersiveLessonPage } from "../features/immersive/ImmersiveLessonPage";
import { api, parseResponse } from "../shared/api/client";
import { TOKEN_KEY } from "../app/authStorage";

export default function ImmersivePage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const accessToken = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : "";

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const loadLessonDetail = useCallback(async () => {
    if (!lessonId || !accessToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [detailResp, progressResp] = await Promise.all([
        api(`/api/lessons/${lessonId}`, {}, accessToken),
        api(`/api/lessons/${lessonId}/progress`, {}, accessToken),
      ]);

      const detailData = await parseResponse(detailResp);
      const progressData = await parseResponse(progressResp);

      if (!detailResp.ok) {
        setError(detailData?.message || "加载课程详情失败");
        setLoading(false);
        return;
      }

      const merged = {
        ...detailData,
        progress: progressResp.ok
          ? {
              current_sentence_index: progressData.current_sentence_index || 0,
              completed_sentence_indexes: progressData.completed_sentence_indexes || [],
              last_played_at_ms: progressData.last_played_at_ms || 0,
            }
          : {
              current_sentence_index: 0,
              completed_sentence_indexes: [],
              last_played_at_ms: 0,
            },
      };

      setLesson(merged);
    } catch (err) {
      setError(`网络错误: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [accessToken, lessonId]);

  useEffect(() => {
    void loadLessonDetail();
  }, [loadLessonDetail]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-destructive">{error || "课程不存在"}</div>
      </div>
    );
  }

  return (
    <ImmersiveLessonPage
      lesson={lesson}
      accessToken={accessToken}
      apiClient={api}
      onBack={handleBack}
    />
  );
}
