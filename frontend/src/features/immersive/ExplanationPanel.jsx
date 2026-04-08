import React, { useEffect, useRef } from 'react';
import { PlayArrow, Replay, Spellcheck } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Typography, Chip, Divider } from '@mui/material';

const ExplanationPanel = ({
  sentence,
  explanation,
  onReplay,
  onStartPractice,
  audioUrl
}) => {
  const audioRef = useRef(null);

  useEffect(() => {
    // 自动播放讲解音频
    if (audioUrl && audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(console.error);
    }
  }, [audioUrl]);

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(console.error);
    }
    onReplay?.();
  };

  const handleStartPractice = () => {
    onStartPractice?.();
  };

  if (!explanation) {
    return null;
  }

  return (
    <Card sx={{ maxWidth: 600, mx: 'auto', my: 2 }}>
      <CardContent>
        {/* 隐藏的音频元素 */}
        <audio ref={audioRef} />

        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlayArrow color="primary" />
          听力讲解
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* 简化句 */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            简化句：
          </Typography>
          <Typography variant="body1" sx={{ 
            fontStyle: 'italic',
            bgcolor: 'action.hover',
            p: 2,
            borderRadius: 1
          }}>
            {explanation.simplified_sentence}
          </Typography>
        </Box>

        {/* 关键词解释 */}
        {explanation.key_explanations?.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              关键词解释：
            </Typography>
            <Box sx={{ 
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              overflow: 'hidden'
            }}>
              {explanation.key_explanations.map((exp, idx) => (
                <Box key={idx} sx={{ p: 1.5, '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Chip 
                      label={exp.original_word} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                    <Typography variant="body2" color="text.secondary">
                      {exp.explanation}
                    </Typography>
                  </Box>
                  {exp.simple_example && (
                    <Typography variant="caption" color="text.disabled" sx={{ ml: 3 }}>
                      例: {exp.simple_example}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* 听力提示 */}
        {explanation.listen_tips && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              听力技巧：
            </Typography>
            <Typography variant="body2">
              {explanation.listen_tips}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* 操作按钮 */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<Replay />}
            onClick={handleReplay}
          >
            重新播放
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Spellcheck />}
            onClick={handleStartPractice}
          >
            开始拼写练习
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ExplanationPanel;