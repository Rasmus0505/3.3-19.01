SELECT 'users' AS table_name, count(*) AS row_count FROM app.users
UNION ALL
SELECT 'lessons', count(*) FROM app.lessons
UNION ALL
SELECT 'lesson_sentences', count(*) FROM app.lesson_sentences
UNION ALL
SELECT 'lesson_progress', count(*) FROM app.lesson_progress
UNION ALL
SELECT 'media_assets', count(*) FROM app.media_assets;
