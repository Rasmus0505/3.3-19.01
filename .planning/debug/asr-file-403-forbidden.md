---
status: investigating
trigger: "Investigate issue: asr-file-403-forbidden\n\n**Summary:** In `D:\\3.3-19.01`, the ASR pipeline fails at the subtitle recognition stage with `ASR_TASK_FAILED` and subtask code `FILE_403_FORBIDDEN`."
created: 2026-03-26T22:02:26.3281937+08:00
updated: 2026-03-26T22:11:45.0000000+08:00
---

## Current Focus

hypothesis: the frontend passes a plain OSS object URL as `dashscope_file_url`, and the backend trusts it instead of resolving a DashScope-signed URL from `dashscope_file_id`, causing private-object access to fail with `FILE_403_FORBIDDEN`
test: patch `LessonService.generate_from_dashscope_file_id` to prefer `get_file_signed_url(dashscope_file_id)` and add a regression test that captures the URL passed into `transcribe_signed_url`
expecting: the new test should fail on the current code because it uses the plain URL, then pass once the service resolves the signed URL from the file ID
next_action: edit the backend service and add the regression test

## Symptoms

expected: ASR subtitle recognition should complete successfully for the target media file and continue the pipeline.
actual: The task stops during subtitle recognition and reports `{"task_status":"FAILED","subtask_code":"FILE_403_FORBIDDEN","subtask_message":"FILE_403_FORBIDDEN"}`.
errors: `ASR_TASK_FAILED: ASR 任务失败`; failed stage: `识别字幕`; subtask code/message: `FILE_403_FORBIDDEN`.
reproduction: Trigger the ASR flow in this workspace for a media file that should be transcribed; the failure appears during subtitle recognition.
started: Observed on 2026-03-26. Whether it ever worked before is unknown.

## Eliminated

## Evidence

- timestamp: 2026-03-26T22:03:58.0000000+08:00
  checked: `.planning/debug/knowledge-base.md`
  found: The knowledge base file does not exist in this workspace.
  implication: There is no prior resolved debug pattern to test first.

- timestamp: 2026-03-26T22:03:58.0000000+08:00
  checked: repository-wide search for `FILE_403_FORBIDDEN`, `ASR_TASK_FAILED`, `识别字幕`, `subtitle`, and `asr`
  found: The repository contains cloud ASR code, local desktop ASR code, and an urgent planning phase `01.1` titled `fix-asr-subtitle-recognition-403-file-access-failures`.
  implication: The failure is already recognized as a cloud subtitle-recognition issue and likely sits in the upload-to-ASR integration rather than unrelated frontend subtitle rendering code.

- timestamp: 2026-03-26T22:11:45.0000000+08:00
  checked: `app/services/lesson_service.py`, `app/infra/asr_dashscope.py`, and `app/infra/dashscope_storage.py`
  found: `LessonService.generate_from_dashscope_file_id()` sets `signed_url = dashscope_file_url or get_file_signed_url(dashscope_file_id)` and then passes it to `transcribe_signed_url()`.
  implication: Any caller-provided HTTP URL takes precedence over the provider-signed URL lookup.

- timestamp: 2026-03-26T22:11:45.0000000+08:00
  checked: `frontend/src/features/upload/UploadPanel.jsx` and `app/api/routers/dashscope_upload.py`
  found: The frontend builds `dashscope_file_url` by concatenating `upload_host` and `file_id` (`buildDashscopeFileHttpUrl`) and posts that value to `/api/lessons/tasks`.
  implication: The task runtime receives a plain OSS object URL rather than a signed download URL, which is consistent with DashScope later reporting `FILE_403_FORBIDDEN` for private uploads.
## Resolution

root_cause:
fix:
verification:
files_changed: []
