# 需求：Bottle 英语学习产品

**Defined:** 2026-03-26
**Core Value:** 用户可以把真实英语媒体快速变成可学习课程，而且不需要理解技术配置，也不会把重处理压力默认压到你的中心服务器上。

## v1 需求

### 身份认证

- [ ] **AUTH-01**: 用户可以使用邮箱和密码注册
- [ ] **AUTH-02**: 用户可以登录，并在刷新后保持可用会话
- [ ] **AUTH-03**: 当能力需要计费或用户态时，用户必须在正确认证状态下才能使用生成与学习功能

### 计费

- [ ] **BILL-01**: 用户可以通过兑换码把平台点数或余额充入账户
- [ ] **BILL-02**: 用户使用 Bottle 1.0 和 Bottle 2.0 时，按管理员配置的价格计费
- [ ] **BILL-03**: 用户使用付费生成能力时不需要提供自己的 ASR API Key

### 网页端生成

- [ ] **WEB-01**: 网页端用户在浏览器路径可支持时，可以上传本地媒体并通过 Bottle 2.0 生成课程
- [ ] **WEB-02**: 当某项能力仅支持桌面端或当前不可用时，网页端用户能收到清晰提示
- [ ] **WEB-03**: 网页端生成默认不应把中心服务器变成重媒体处理瓶颈

### 桌面端生成

- [ ] **DESK-01**: 桌面端用户可以在本机通过 Bottle 1.0 生成课程
- [ ] **DESK-02**: 桌面端用户可以在同一产品表面通过 Bottle 2.0 云端 ASR 生成课程
- [ ] **DESK-03**: 桌面端用户可以在不理解模型/工具细节的前提下准备好 Bottle 1.0
- [ ] **DESK-04**: 桌面端用户可以通过本地工具链导入支持的媒体链接

### 课程产物

- [ ] **LESS-01**: Bottle 1.0 和 Bottle 2.0 生成出的内容都能落成统一课程记录
- [ ] **LESS-02**: 用户可以打开生成后的课程并查看句子内容
- [ ] **LESS-03**: 生成进度、局部失败和完成状态在产品 UI 中清晰可见

### 学习体验

- [ ] **LEARN-01**: 用户可以从生成后的课程进入拼写/学习练习
- [ ] **LEARN-02**: 不论课程来自本地生成还是云端生成，学习体验都应保持可用
- [ ] **LEARN-03**: 用户不需要理解底层 ASR 路线也能继续完成学习

### 管理运营

- [ ] **ADMIN-01**: 管理员可以配置或调整 Bottle 1.0 与 Bottle 2.0 的价格
- [ ] **ADMIN-02**: 管理员可以查看运行时健康和生成支持状态以便排障
- [ ] **ADMIN-03**: 管理员可以继续管理兑换码和钱包相关运营能力

## v2 需求

### 扩展方向

- **V2-01**: 只有在浏览器大规模使用可靠时，才继续扩展浏览器侧能力
- **V2-02**: 支持按运行时、模型、速度/质量档位做更细粒度定价
- **V2-03**: 在桌面端链接导入能力之外，支持更广泛的媒体来源

## Out of Scope

| Feature | Reason |
|---------|--------|
| 用户自己管理 ASR Key | 与低摩擦学习者体验冲突 |
| 浏览器完全复制本地工具链能力 | 浏览器并不是承载 ffmpeg / yt-dlp 重能力的正确环境 |
| 服务器优先媒体转换管线 | 与基础设施和成本约束冲突 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| BILL-01 | Phase 1 | Pending |
| BILL-02 | Phase 5 | Pending |
| BILL-03 | Phase 5 | Pending |
| WEB-01 | Phase 1 | Pending |
| WEB-02 | Phase 1 | Pending |
| WEB-03 | Phase 1 | Pending |
| DESK-01 | Phase 2 | Pending |
| DESK-02 | Phase 1 | Pending |
| DESK-03 | Phase 2 | Pending |
| DESK-04 | Phase 4 | Pending |
| LESS-01 | Phase 3 | Pending |
| LESS-02 | Phase 3 | Pending |
| LESS-03 | Phase 3 | Pending |
| LEARN-01 | Phase 3 | Pending |
| LEARN-02 | Phase 3 | Pending |
| LEARN-03 | Phase 6 | Pending |
| ADMIN-01 | Phase 5 | Pending |
| ADMIN-02 | Phase 5 | Pending |
| ADMIN-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*