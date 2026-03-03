BEGIN;

ALTER TABLE IF EXISTS app.users SET SCHEMA public;
ALTER TABLE IF EXISTS app.lessons SET SCHEMA public;
ALTER TABLE IF EXISTS app.lesson_sentences SET SCHEMA public;
ALTER TABLE IF EXISTS app.lesson_progress SET SCHEMA public;
ALTER TABLE IF EXISTS app.media_assets SET SCHEMA public;

COMMIT;
