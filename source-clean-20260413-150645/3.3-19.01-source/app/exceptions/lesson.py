"""课程相关异常定义。"""


class LessonError(Exception):
    """课程相关异常基类。"""

    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = code
        self.message = message
        self.detail = detail
        super().__init__(message)


class LessonNotFoundError(LessonError):
    """课程不存在。"""

    def __init__(self, lesson_id: int | str):
        super().__init__(
            code="LESSON_NOT_FOUND",
            message=f"课程 {lesson_id} 不存在",
            detail={"lesson_id": lesson_id},
        )


class LessonGenerationError(LessonError):
    """课程生成失败。"""

    def __init__(self, reason: str, detail: str = ""):
        super().__init__(
            code="LESSON_GENERATION_FAILED",
            message=f"课程生成失败：{reason}",
            detail={"reason": reason, "detail": detail},
        )


class LessonAccessDeniedError(LessonError):
    """课程访问被拒绝。"""

    def __init__(self, lesson_id: int | str, user_id: int):
        super().__init__(
            code="LESSON_ACCESS_DENIED",
            message=f"用户 {user_id} 无权访问课程 {lesson_id}",
            detail={"lesson_id": lesson_id, "user_id": user_id},
        )


class LessonTaskError(LessonError):
    """课程任务执行异常。"""

    def __init__(self, task_id: str, reason: str):
        super().__init__(
            code="LESSON_TASK_ERROR",
            message=f"课程任务 {task_id} 执行失败：{reason}",
            detail={"task_id": task_id, "reason": reason},
        )
