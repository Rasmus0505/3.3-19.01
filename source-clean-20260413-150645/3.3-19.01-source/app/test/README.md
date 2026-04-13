# 后端测试

此目录包含后端服务的单元测试。

## 目录结构

```
app/test/
├── __init__.py              # 测试包初始化
├── conftest.py              # pytest fixtures 和配置
├── pytest.ini               # pytest 配置
├── billing/                 # 计费服务测试
│   ├── __init__.py
│   ├── test_wallet.py       # 钱包服务测试
│   ├── test_redeem.py       # 兑换码服务测试
│   └── test_rates.py         # 费率服务测试
└── utils/                   # 工具函数测试
    ├── __init__.py
    └── test_utils.py         # 工具函数测试
```

## 运行测试

### 安装测试依赖

```bash
pip install pytest pytest-cov
```

### 运行所有测试

```bash
pytest
```

### 运行指定模块测试

```bash
# 只运行计费服务测试
pytest app/test/billing/

# 只运行钱包测试
pytest app/test/billing/test_wallet.py

# 只运行工具函数测试
pytest app/test/utils/
```

### 运行测试并显示覆盖率

```bash
pytest --cov=app --cov-report=html
```

## 测试编写指南

### 命名规范

- 测试文件命名：`test_<模块名>.py`
- 测试类命名：`Test<被测试模块名>`
- 测试函数命名：`test_<测试内容>`

### 测试结构

```python
class TestSomething:
    """测试类描述（中文）"""

    def test_normal_case(self):
        """测试正常情况"""
        pass

    def test_edge_case(self):
        """测试边界情况"""
        pass
```

### 使用 Fixtures

`conftest.py` 提供了以下 fixtures：

- `engine`: SQLite 内存数据库引擎
- `db_session`: 数据库会话
- `test_user`: 测试用户
- `test_wallet`: 测试钱包账户
- `test_billing_rates`: 测试费率数据

### 示例

```python
def test_wallet_balance(db_session, test_wallet):
    """测试钱包余额查询"""
    assert test_wallet.balance_points == 10000
```
