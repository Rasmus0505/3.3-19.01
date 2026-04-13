"""语音识别（ASR）相关异常定义。"""


class AsrError(Exception):
    """ASR 相关异常基类。"""

    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


class AsrCancellationRequested(AsrError):
    """ASR 任务被取消请求。"""

    def __init__(self, reason: str = ""):
        super().__init__(
            code="ASR_CANCELLATION_REQUESTED",
            message=f"ASR 任务被取消：{reason}" if reason else "ASR 任务被取消",
            detail={"reason": reason},
        )


class AsrUploadError(AsrError):
    """ASR 音频上传失败。"""

    def __init__(self, reason: str):
        super().__init__(
            code="ASR_UPLOAD_FAILED",
            message=f"上传音频到 ASR 服务失败：{reason}",
            detail={"reason": reason},
        )


class AsrTaskCreateError(AsrError):
    """ASR 任务创建失败。"""

    def __init__(self, reason: str):
        super().__init__(
            code="ASR_TASK_CREATE_FAILED",
            message=f"创建 ASR 任务失败：{reason}",
            detail={"reason": reason},
        )


class AsrTaskWaitError(AsrError):
    """ASR 任务等待失败。"""

    def __init__(self, reason: str):
        super().__init__(
            code="ASR_TASK_WAIT_FAILED",
            message=f"等待 ASR 任务结果失败：{reason}",
            detail={"reason": reason},
        )


class AsrResultError(AsrError):
    """ASR 结果获取失败。"""

    def __init__(self, reason: str):
        super().__init__(
            code="ASR_RESULT_FAILED",
            message=f"获取 ASR 结果失败：{reason}",
            detail={"reason": reason},
        )


class AsrApiKeyMissingError(AsrError):
    """ASR API 密钥未配置。"""

    def __init__(self):
        super().__init__(
            code="ASR_API_KEY_MISSING",
            message="ASR API 密钥未配置",
            detail={},
        )


class AsrInvalidModelError(AsrError):
    """ASR 模型不支持。"""

    def __init__(self, model: str):
        super().__init__(
            code="ASR_INVALID_MODEL",
            message=f"不支持的 ASR 模型：{model}",
            detail={"model": model},
        )
