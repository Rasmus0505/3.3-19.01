-- Run this before and after migration to verify row counts.
-- Before migration use public.*, after migration use app.*.

SELECT 'users' AS table_name, count(*) AS row_count FROM public.users
UNION ALL
SELECT 'lessons', count(*) FROM public.lessons
UNION ALL
SELECT 'lesson_sentences', count(*) FROM public.lesson_sentences
UNION ALL
SELECT 'lesson_progress', count(*) FROM public.lesson_progress
UNION ALL
SELECT 'media_assets', count(*) FROM public.media_assets;
