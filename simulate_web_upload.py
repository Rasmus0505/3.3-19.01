"""
模拟网页端素材生成链路测试

此脚本模拟网页端上传视频并生成课程素材的完整流程。
使用千问 ASR (qwen3-asr-flash-filetrans) 进行语音识别。

流程：
1. 获取预签名上传 URL
2. 上传视频文件到 DashScope OSS
3. 创建课程任务
4. 轮询任务状态直到完成

使用方式:
    # 方式1: 使用真实视频文件测试（需要 DASHSCOPE_API_KEY）
    python simulate_web_upload.py --video-path your_video.mp4

    # 方式2: 直接创建任务（模拟已上传的场景）
    python simulate_web_upload.py --mock-file-id "uploads/test/mock.mp4"
"""

import sys
sys.path.insert(0, '.')

import argparse
import json
import time
import httpx
from pathlib import Path


QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"


def get_api_base() -> str:
    """获取 API 基础 URL。"""
    return "http://localhost:8000"


def login(client: httpx.Client, email: str, password: str) -> str:
    """登录获取 token。"""
    resp = client.post(
        f"{get_api_base()}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"登录失败: {resp.status_code} - {resp.text}")
    return resp.json()["access_token"]


def register(client: httpx.Client, email: str, password: str) -> str:
    """注册用户并登录。"""
    # 先尝试注册
    reg_resp = client.post(
        f"{get_api_base()}/api/auth/register",
        json={"email": email, "password": password},
        timeout=30,
    )
    if reg_resp.status_code != 200:
        # 可能用户已存在，直接登录
        pass
    
    # 登录
    return login(client, email, password)


def get_upload_url(client: httpx.Client, token: str, filename: str, content_type: str = "video/mp4") -> dict:
    """获取预签名上传 URL。"""
    resp = client.post(
        f"{get_api_base()}/api/dashscope-upload/request-url",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "filename": filename,
            "content_type": content_type,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"获取上传 URL 失败: {resp.status_code} - {resp.text}")
    return resp.json()


def upload_file_to_dashscope(upload_url: str, file_path: Path, content_type: str = "video/mp4") -> bool:
    """上传文件到 DashScope OSS。"""
    with open(file_path, "rb") as f:
        file_content = f.read()
    
    # 解析上传 URL
    # upload_url 格式: https://... 或 oss://...
    headers = {"Content-Type": content_type}
    
    resp = httpx.put(upload_url, content=file_content, headers=headers, timeout=300)
    
    if resp.status_code in (200, 201):
        return True
    else:
        print(f"上传失败: {resp.status_code} - {resp.text[:200]}")
        return False


def create_lesson_task(
    client: httpx.Client,
    token: str,
    dashscope_file_id: str,
    asr_model: str = QWEN_ASR_MODEL,
    source_filename: str = "",
    dashscope_file_url: str = "",
) -> str:
    """创建课程生成任务。"""
    data = {
        "asr_model": asr_model,
        "semantic_split_enabled": "false",
        "dashscope_file_id": dashscope_file_id,
    }
    if source_filename:
        data["source_filename"] = source_filename
    if dashscope_file_url:
        data["dashscope_file_url"] = dashscope_file_url
    
    resp = client.post(
        f"{get_api_base()}/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        data=data,
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"创建任务失败: {resp.status_code} - {resp.text}")
    
    result = resp.json()
    return result.get("task_id", "")


def get_task_status(client: httpx.Client, token: str, task_id: str) -> dict:
    """获取任务状态。"""
    resp = client.get(
        f"{get_api_base()}/api/lessons/tasks/{task_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"获取任务状态失败: {resp.status_code} - {resp.text}")
    return resp.json()


def wait_for_task_completion(
    client: httpx.Client,
    token: str,
    task_id: str,
    poll_interval: float = 2.0,
    timeout: float = 600.0,
) -> dict:
    """等待任务完成。"""
    start_time = time.time()
    last_status = None
    
    while True:
        if time.time() - start_time > timeout:
            raise RuntimeError(f"任务超时 ({timeout}秒)")
        
        status = get_task_status(client, token, task_id)
        current_status = status.get("status", "")
        
        if current_status != last_status:
            print(f"  任务状态: {current_status}")
            last_status = current_status
        
        if current_status == "succeeded":
            print(f"  ✓ 任务成功完成!")
            return status
        elif current_status == "failed":
            print(f"  ✗ 任务失败!")
            print(f"  错误码: {status.get('error_code')}")
            print(f"  错误信息: {status.get('message')}")
            return status
        elif current_status == "running":
            stages = status.get("stages", [])
            percent = status.get("overall_percent", 0)
            print(f"  进度: {percent}% - {stages}")
        else:
            print(f"  当前状态: {current_status}")
        
        time.sleep(poll_interval)


def ensure_wallet_balance(client: httpx.Client, token: str, amount: int = 10000):
    """确保钱包有足够余额（仅用于测试）。"""
    # 检查余额
    resp = client.get(
        f"{get_api_base()}/api/wallet/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    
    if resp.status_code == 200:
        data = resp.json()
        balance = int(data.get("balance_amount_cents", data.get("balance_points", 0)))
        print(f"  当前余额: {balance}")
        
        if balance < amount:
            print(f"  余额不足，请充值或使用管理员工具添加测试余额")


def simulate_mock_task(
    client: httpx.Client,
    token: str,
    dashscope_file_id: str,
    source_filename: str = "mock-video.mp4",
) -> dict:
    """
    模拟创建任务（不实际调用千问 ASR）。
    
    当 dashscope_file_id 是测试 ID 时，后端会使用模拟的 ASR 结果。
    """
    print(f"创建模拟任务 (file_id: {dashscope_file_id})...")
    
    data = {
        "asr_model": QWEN_ASR_MODEL,
        "semantic_split_enabled": "false",
        "dashscope_file_id": dashscope_file_id,
        "source_filename": source_filename,
    }
    
    resp = client.post(
        f"{get_api_base()}/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        data=data,
        timeout=30,
    )
    
    if resp.status_code != 200:
        raise RuntimeError(f"创建任务失败: {resp.status_code} - {resp.text}")
    
    result = resp.json()
    print(f"  任务 ID: {result.get('task_id')}")
    return result


def run_full_flow(
    video_path: Path,
    email: str = "simulate-upload@example.com",
    password: str = "TestPassword123!",
    poll_interval: float = 2.0,
    timeout: float = 600.0,
):
    """运行完整的上传和生成流程。"""
    print("=" * 60)
    print("网页端素材生成链路模拟测试")
    print("=" * 60)
    print(f"视频文件: {video_path}")
    print(f"用户邮箱: {email}")
    print(f"ASR 模型: {QWEN_ASR_MODEL}")
    print()
    
    # 检查后端服务
    try:
        resp = httpx.get(f"{get_api_base()}/api/health", timeout=5)
        print(f"✓ 后端服务正常: {resp.status_code}")
    except Exception as e:
        print(f"✗ 无法连接后端服务: {e}")
        print(f"\n请先启动后端服务:")
        print(f"  cd d:\\3.3-19.01 && python -m uvicorn app.main:app --reload --port 8000")
        return None
    
    client = httpx.Client(timeout=60)
    
    try:
        # 1. 注册/登录
        print("\n[1/4] 用户登录...")
        token = register(client, email, password)
        print(f"✓ 登录成功")
        
        # 2. 获取上传 URL
        print("\n[2/4] 获取上传 URL...")
        upload_config = get_upload_url(
            client, token,
            filename=video_path.name,
            content_type="video/mp4",
        )
        print(f"✓ 获取上传配置成功")
        print(f"  - File ID: {upload_config.get('file_id')}")
        
        # 3. 上传文件
        print("\n[3/4] 上传视频文件...")
        upload_url = upload_config.get("upload_url") or upload_config.get("upload_host")
        if upload_url:
            success = upload_file_to_dashscope(upload_url, video_path)
            if success:
                print(f"✓ 文件上传成功")
            else:
                print(f"✗ 文件上传失败")
                return None
        else:
            print(f"⚠ 未获取到上传地址，尝试直接创建任务...")
        
        # 4. 创建课程任务
        print("\n[4/4] 创建课程生成任务...")
        file_id = upload_config.get("file_id", "")
        task_result = create_lesson_task(
            client, token,
            dashscope_file_id=file_id,
            source_filename=video_path.name,
            dashscope_file_url=upload_config.get("file_url", ""),
        )
        task_id = task_result.get("task_id", "")
        print(f"✓ 任务已创建: {task_id}")
        
        # 5. 等待完成
        print("\n等待任务完成...")
        final_status = wait_for_task_completion(
            client, token, task_id,
            poll_interval=poll_interval,
            timeout=timeout,
        )
        
        print("\n" + "=" * 60)
        print("任务结果:")
        print("=" * 60)
        print(json.dumps(final_status, indent=2, ensure_ascii=False))
        
        return final_status
        
    finally:
        client.close()


def run_mock_flow(
    dashscope_file_id: str = "uploads/test/mock-video.mp4",
    source_filename: str = "test-english-lesson.mp4",
    email: str = "simulate-mock@example.com",
    password: str = "TestPassword123!",
    poll_interval: float = 2.0,
    timeout: float = 60.0,
):
    """运行模拟流程（不实际上传文件）。"""
    print("=" * 60)
    print("模拟素材生成链路测试（Mock 模式）")
    print("=" * 60)
    print(f"模拟 File ID: {dashscope_file_id}")
    print(f"源文件: {source_filename}")
    print(f"用户邮箱: {email}")
    print()
    
    # 检查后端服务
    try:
        resp = httpx.get(f"{get_api_base()}/api/health", timeout=5)
        print(f"✓ 后端服务正常: {resp.status_code}")
    except Exception as e:
        print(f"✗ 无法连接后端服务: {e}")
        print(f"\n请先启动后端服务:")
        print(f"  cd d:\\3.3-19.01 && python -m uvicorn app.main:app --reload --port 8000")
        return None
    
    client = httpx.Client(timeout=60)
    
    try:
        # 1. 注册/登录
        print("\n[1/3] 用户登录...")
        token = register(client, email, password)
        print(f"✓ 登录成功")
        
        # 2. 检查余额
        print("\n[2/3] 检查钱包余额...")
        ensure_wallet_balance(client, token)
        
        # 3. 创建任务
        print("\n[3/3] 创建课程生成任务...")
        task_result = simulate_mock_task(client, token, dashscope_file_id, source_filename)
        task_id = task_result.get("task_id", "")
        print(f"✓ 任务已创建: {task_id}")
        
        # 4. 等待完成
        print("\n等待任务完成...")
        final_status = wait_for_task_completion(
            client, token, task_id,
            poll_interval=poll_interval,
            timeout=timeout,
        )
        
        print("\n" + "=" * 60)
        print("任务结果:")
        print("=" * 60)
        print(json.dumps(final_status, indent=2, ensure_ascii=False))
        
        return final_status
        
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(description="模拟网页端素材生成链路测试")
    parser.add_argument("--video-path", type=Path, help="视频文件路径（将实际上传到 DashScope）")
    parser.add_argument("--mock-file-id", type=str, help="模拟的 dashscope_file_id（不实际上传）")
    parser.add_argument("--mock-filename", type=str, default="mock-video.mp4", help="模拟的源文件名")
    parser.add_argument("--email", default="simulate-upload@example.com", help="测试用户邮箱")
    parser.add_argument("--password", default="TestPassword123!", help="测试用户密码")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="轮询间隔（秒）")
    parser.add_argument("--timeout", type=float, default=600.0, help="超时时间（秒）")
    parser.add_argument("--save-task-id", type=str, help="将任务 ID 保存到文件")
    
    args = parser.parse_args()
    
    if args.video_path:
        # 实际文件上传流程
        if not args.video_path.exists():
            print(f"错误: 视频文件不存在: {args.video_path}")
            return 1
        
        result = run_full_flow(
            video_path=args.video_path,
            email=args.email,
            password=args.password,
            poll_interval=args.poll_interval,
            timeout=args.timeout,
        )
    elif args.mock_file_id:
        # 模拟流程
        result = run_mock_flow(
            dashscope_file_id=args.mock_file_id,
            source_filename=args.mock_filename,
            email=args.email,
            password=args.password,
            poll_interval=args.poll_interval,
            timeout=args.timeout,
        )
    else:
        print("请指定 --video-path 或 --mock-file-id")
        print()
        print("示例:")
        print("  # 方式1: 使用真实视频测试")
        print("  python simulate_web_upload.py --video-path ./test.mp4")
        print()
        print("  # 方式2: 使用模拟 ID 测试")
        print("  python simulate_web_upload.py --mock-file-id 'uploads/test/demo.mp4'")
        return 1
    
    if args.save_task_id and result:
        task_id = result.get("task_id")
        if task_id:
            Path(args.save_task_id).write_text(task_id, encoding="utf-8")
            print(f"\n任务 ID 已保存到: {args.save_task_id}")
    
    if result and result.get("status") == "succeeded":
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
