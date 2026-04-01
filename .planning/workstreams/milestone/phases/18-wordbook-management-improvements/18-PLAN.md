# Phase 18 Plan: wordbook-management-improvements

**Phase:** 18-wordbook-management-improvements
**Created:** 2026-04-02
**Status:** In Progress

---

## Phase Overview

生词本管理功能增强，包括批量操作、局部翻译、UI 风格统一、轻提示系统。

**Requirements Addressed:**
- WORD-03: 批量操作
- WORD-05: 局部翻译
- WORD-06: UI风格统一
- HINT-01: 轻提示组件
- HINT-02: 轻提示覆盖沉浸式学习按钮

---

## Plan Summary

| Plan | Name | Wave | Requirements |
|------|------|------|--------------|
| 18-01 | Batch Operations Backend | 1 | WORD-03 |
| 18-02 | Frontend Batch Selection | 1 | WORD-03, WORD-06 |
| 18-03 | Tooltip System Enhancement | 1 | HINT-01, HINT-02 |
| 18-04 | Translation Dialog & Local Translation | 2 | WORD-05, HINT-02 |

---

## Plan 18-01: Batch Operations Backend

```yaml
---
wave: 1
depends_on: []
requirements_addressed: [WORD-03]
autonomous: true
---
```

### Task 18-01.1: Add Batch Schemas

<read_first>
- `app/schemas/wordbook.py` (existing schemas)
- `.planning/workstreams/milestone/phases/18-wordbook-management-improvements/18-RESEARCH.md` (API design)
</read_first>

<acceptance_criteria>
- [ ] `grep -n "class WordbookBatch" app/schemas/wordbook.py` finds 4 new schemas
- [ ] Each schema has `entry_ids: list[int]` with validation
- [ ] Translation schema has `text: str` with length validation
</acceptance_criteria>

<action>
Add to `app/schemas/wordbook.py`:

```python
# Batch Delete
class WordbookBatchDeleteRequest(BaseModel):
    entry_ids: list[int] = Field(default_factory=list, min_length=1, max_length=100)

class WordbookBatchDeleteResponse(BaseModel):
    ok: bool = True
    deleted_count: int
    failed_ids: list[int] = Field(default_factory=list)

# Batch Status Update
class WordbookBatchStatusRequest(BaseModel):
    entry_ids: list[int] = Field(default_factory=list, min_length=1, max_length=100)
    status: WordbookEntryStatus

class WordbookBatchStatusResponse(BaseModel):
    ok: bool = True
    updated_count: int
    failed_ids: list[int] = Field(default_factory=list)

# Batch Move
class WordbookBatchMoveRequest(BaseModel):
    entry_ids: list[int] = Field(default_factory=list, min_length=1, max_length=100)
    target_lesson_id: int = Field(gt=0)

class WordbookBatchMoveResponse(BaseModel):
    ok: bool = True
    moved_count: int
    failed_ids: list[int] = Field(default_factory=list)

# Partial Translation
class WordbookTranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)

class WordbookTranslateResponse(BaseModel):
    ok: bool = True
    text: str
    translation: str
```
</action>

### Task 18-01.2: Add Batch Service Functions

<read_first>
- `app/services/wordbook_service.py` (existing service functions)
- `app/repositories/wordbook.py` (existing repository functions)
</read_first>

<acceptance_criteria>
- [ ] `grep -n "def batch_" app/services/wordbook_service.py` finds 4 new functions
- [ ] Each batch function handles errors gracefully with partial success
- [ ] `batch_delete_wordbook_entries` deletes entries and returns count
- [ ] `batch_update_wordbook_status` updates status for multiple entries
- [ ] `batch_move_wordbook_entries` reassigns source lesson for entries
- [ ] `translate_wordbook_text` calls `translate_to_zh` from translation service
</acceptance_criteria>

<action>
Add to `app/services/wordbook_service.py`:

```python
def batch_delete_wordbook_entries(db: Session, *, entry_ids: list[int], user_id: int) -> dict[str, object]:
    """Delete multiple wordbook entries. Returns deleted_count and failed_ids."""
    deleted_count = 0
    failed_ids = []
    for entry_id in entry_ids:
        try:
            entry = get_wordbook_entry_for_user(db, entry_id=entry_id, user_id=user_id)
            if entry:
                db.delete(entry)
                deleted_count += 1
            else:
                failed_ids.append(entry_id)
        except Exception:
            failed_ids.append(entry_id)
    db.commit()
    return {"deleted_count": deleted_count, "failed_ids": failed_ids}


def batch_update_wordbook_status(db: Session, *, entry_ids: list[int], user_id: int, status: str) -> dict[str, object]:
    """Update status for multiple wordbook entries."""
    safe_status = str(status or "").strip().lower()
    if safe_status not in VALID_ENTRY_STATUSES:
        raise HTTPException(status_code=400, detail="词条状态无效")
    updated_count = 0
    failed_ids = []
    for entry_id in entry_ids:
        try:
            entry = get_wordbook_entry_for_user(db, entry_id=entry_id, user_id=user_id)
            if entry:
                entry.status = safe_status
                db.add(entry)
                updated_count += 1
            else:
                failed_ids.append(entry_id)
        except Exception:
            failed_ids.append(entry_id)
    db.commit()
    return {"updated_count": updated_count, "failed_ids": failed_ids}


def batch_move_wordbook_entries(db: Session, *, entry_ids: list[int], user_id: int, target_lesson_id: int) -> dict[str, object]:
    """Move multiple wordbook entries to a different source lesson."""
    from app.repositories.lessons import get_lesson_by_id_for_user
    lesson = get_lesson_by_id_for_user(db, lesson_id=target_lesson_id, user_id=user_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="目标课程不存在")
    moved_count = 0
    failed_ids = []
    for entry_id in entry_ids:
        try:
            entry = get_wordbook_entry_for_user(db, entry_id=entry_id, user_id=user_id)
            if entry:
                entry.latest_lesson_id = target_lesson_id
                db.add(entry)
                moved_count += 1
            else:
                failed_ids.append(entry_id)
        except Exception:
            failed_ids.append(entry_id)
    db.commit()
    return {"moved_count": moved_count, "failed_ids": failed_ids}


def translate_wordbook_text(text: str, api_key: str) -> dict[str, object]:
    """Translate text using MT service."""
    from app.services.translation_qwen_mt import translate_to_zh
    if not str(text or "").strip():
        raise HTTPException(status_code=400, detail="翻译文本不能为空")
    try:
        translation = translate_to_zh(text, api_key)
        return {"text": text, "translation": translation}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"翻译失败: {str(exc)}")
```
</action>

### Task 18-01.3: Add Batch API Endpoints

<read_first>
- `app/api/routers/wordbook.py` (existing endpoints)
- `app/schemas/wordbook.py` (new schemas)
</read_first>

<acceptance_criteria>
- [ ] `grep -n "@router.post.*batch" app/api/routers/wordbook.py` finds batch delete + translate endpoints
- [ ] `grep -n "@router.patch.*batch" app/api/routers/wordbook.py` finds batch status + move endpoints
- [ ] Each endpoint requires authentication (get_current_user dependency)
- [ ] Translate endpoint gets user API key and passes to service
</acceptance_criteria>

<action>
Add to `app/api/routers/wordbook.py`:

```python
from app.schemas.wordbook import (
    # ... existing imports ...
    WordbookBatchDeleteRequest,
    WordbookBatchDeleteResponse,
    WordbookBatchStatusRequest,
    WordbookBatchStatusResponse,
    WordbookBatchMoveRequest,
    WordbookBatchMoveResponse,
    WordbookTranslateRequest,
    WordbookTranslateResponse,
)
from app.services.wordbook_service import (
    # ... existing imports ...
    batch_delete_wordbook_entries,
    batch_update_wordbook_status,
    batch_move_wordbook_entries,
    translate_wordbook_text,
)
from app.repositories.users import get_user_api_key

@router.post("/batch-delete", response_model=WordbookBatchDeleteResponse, responses={401: {"model": ErrorResponse}})
def batch_delete_wordbook(
    payload: WordbookBatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = batch_delete_wordbook_entries(db, entry_ids=payload.entry_ids, user_id=current_user.id)
    return WordbookBatchDeleteResponse(
        ok=True,
        deleted_count=result["deleted_count"],
        failed_ids=result["failed_ids"],
    )

@router.patch("/batch-status", response_model=WordbookBatchStatusResponse, responses={401: {"model": ErrorResponse}})
def batch_update_wordbook(
    payload: WordbookBatchStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = batch_update_wordbook_status(db, entry_ids=payload.entry_ids, user_id=current_user.id, status=payload.status)
    return WordbookBatchStatusResponse(
        ok=True,
        updated_count=result["updated_count"],
        failed_ids=result["failed_ids"],
    )

@router.patch("/batch-move", response_model=WordbookBatchMoveResponse, responses={401: {"model": ErrorResponse}})
def batch_move_wordbook(
    payload: WordbookBatchMoveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = batch_move_wordbook_entries(db, entry_ids=payload.entry_ids, user_id=current_user.id, target_lesson_id=payload.target_lesson_id)
    return WordbookBatchMoveResponse(
        ok=True,
        moved_count=result["moved_count"],
        failed_ids=result["failed_ids"],
    )

@router.post("/translate", response_model=WordbookTranslateResponse, responses={401: {"model": ErrorResponse}})
def translate_wordbook(
    payload: WordbookTranslateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    api_key = get_user_api_key(db, user_id=current_user.id)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置翻译 API Key")
    result = translate_wordbook_text(payload.text, api_key)
    return WordbookTranslateResponse(
        ok=True,
        text=result["text"],
        translation=result["translation"],
    )
```
</action>

---

## Plan 18-02: Frontend Batch Selection

```yaml
---
wave: 1
depends_on: []
requirements_addressed: [WORD-03, WORD-06]
autonomous: true
---
```

### Task 18-02.1: Add Selection State Management

<read_first>
- `frontend/src/features/wordbook/WordbookPanel.jsx` (current implementation)
- `.planning/workstreams/milestone/phases/18-wordbook-management-improvements/18-RESEARCH.md` (selection patterns)
</read_first>

<acceptance_criteria>
- [ ] `grep -n "selectedIds" frontend/src/features/wordbook/WordbookPanel.jsx` finds Set-based selection state
- [ ] `grep -n "lastSelectedId" frontend/src/features/wordbook/WordbookPanel.jsx` finds last selected tracking
- [ ] Checkbox click toggles single item
- [ ] Shift+click selects range between last clicked and current
- [ ] Ctrl/Cmd+click adds/removes from selection
</acceptance_criteria>

<action>
Add to `WordbookPanel.jsx` state section (after existing state):

```javascript
const [selectedIds, setSelectedIds] = useState(new Set());
const [lastSelectedId, setLastSelectedId] = useState(null);
```

Add helper function after state declarations:

```javascript
const sortedItems = items; // items already sorted by API

const handleItemSelect = useCallback((itemId, event) => {
  const id = Number(itemId || 0);
  if (event.shiftKey && lastSelectedId) {
    // Range selection
    const lastIdx = sortedItems.findIndex(i => Number(i.id) === lastSelectedId);
    const currentIdx = sortedItems.findIndex(i => Number(i.id) === id);
    if (lastIdx !== -1 && currentIdx !== -1) {
      const [start, end] = [lastIdx, currentIdx].sort((a, b) => a - b);
      const rangeIds = sortedItems.slice(start, end + 1).map(i => Number(i.id));
      setSelectedIds(prev => new Set([...prev, ...rangeIds]));
    }
  } else if (event.ctrlKey || event.metaKey) {
    // Toggle single item
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  } else {
    // Direct click - checkbox behavior
    setSelectedIds(new Set([id]));
  }
  setLastSelectedId(id);
}, [lastSelectedId, sortedItems]);

const handleSelectAll = useCallback(() => {
  const allIds = sortedItems.map(i => Number(i.id));
  if (selectedIds.size === allIds.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(allIds));
  }
}, [selectedIds.size, sortedItems]);

const clearSelection = useCallback(() => {
  setSelectedIds(new Set());
  setLastSelectedId(null);
}, []);
```
</action>

### Task 18-02.2: Create FloatingToolbar Component

<read_first>
- `frontend/src/components/ui/tooltip.jsx` (existing tooltip pattern)
- `frontend/src/shared/ui` (shadcn components)
</read_first>

<acceptance_criteria>
- [ ] File `frontend/src/features/wordbook/FloatingToolbar.jsx` exists
- [ ] Toolbar appears when `selectedIds.size > 0`
- [ ] Toolbar has glassmorphism effect (backdrop-blur, bg-background/95)
- [ ] Toolbar shows selection count "{N} 项已选中"
- [ ] Toolbar has buttons: 删除, 归档, 移动到, 取消
- [ ] **Toolbar uses `position: fixed; top: 0; z-50`** for true floating behavior
- [ ] **Toolbar renders OUTSIDE scrollable container** (not inside list div)
</acceptance_criteria>

<action>
Create `frontend/src/features/wordbook/FloatingToolbar.jsx`:

```jsx
import { Trash2, Archive, Move, X } from "lucide-react";
import { Button, Separator } from "../../shared/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

export function FloatingToolbar({
  selectedCount,
  onDelete,
  onArchive,
  onMove,
  onClear,
}) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      {/* Fixed position at viewport top, outside scrollable containers */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 pt-3 pointer-events-auto">
          <div className="flex items-center gap-2 rounded-xl border bg-background/95 backdrop-blur-sm shadow-lg px-4 py-2">
            <span className="text-sm font-medium">{selectedCount} 项已选中</span>
            <Separator orientation="vertical" className="h-6" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDelete}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4 mr-1" />
                  删除
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
                <p>删除选中的词条</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onArchive}
                >
                  <Archive className="size-4 mr-1" />
                  归档
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
                <p>将选中词条标记为已掌握</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onMove}
                >
                  <Move className="size-4 mr-1" />
                  移动到
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
                <p>将选中的词条移动到其他课程</p>
              </TooltipContent>
            </Tooltip>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="text-muted-foreground"
            >
              <X className="size-4 mr-1" />
              取消
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
```

**Key positioning changes (per D-18-02 "顶部悬浮工具栏"):**
- Uses `position: fixed; top: 0;` instead of `sticky` - renders at viewport top, NOT inside scrollable container
- Uses `z-50` for proper stacking above all content (raised from z-40)
- Wrapped in `pointer-events-none` container with `pointer-events-auto` inner div
- Renders at viewport level, not inside scrollable containers
</action>

### Task 18-02.3: Wire Batch Operations in WordbookPanel

<read_first>
- `frontend/src/features/wordbook/WordbookPanel.jsx` (current implementation)
- `frontend/src/features/wordbook/FloatingToolbar.jsx` (new component)
</read_first>

<acceptance_criteria>
- [ ] FloatingToolbar imported and rendered at **component level** (NOT inside scrollable list div)
- [ ] Each list item has checkbox with selection handling
- [ ] Batch delete calls `/api/wordbook/batch-delete`
- [ ] Batch archive calls `/api/wordbook/batch-status` with status "mastered"
- [ ] Batch move calls `/api/wordbook/batch-move` with lesson selection
- [ ] After batch operation, selection clears and list refreshes
- [ ] Confirmation dialog for destructive operations
</acceptance_criteria>

<action>
In `WordbookPanel.jsx`:

1. Add import for FloatingToolbar:

```javascript
import { FloatingToolbar } from "./FloatingToolbar";
```

2. Add batch operation handlers after `handleDelete`:

```javascript
async function handleBatchDelete() {
  if (selectedIds.size === 0) return;
  if (!window.confirm(`确定要删除选中的 ${selectedIds.size} 个词条吗？此操作不可撤销。`)) {
    return;
  }
  setBusyEntryId(-1);
  try {
    const resp = await apiCall("/api/wordbook/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_ids: Array.from(selectedIds) }),
    });
    const data = await parseResponse(resp);
    if (!resp.ok) {
      toast.error(toErrorText(data, "批量删除失败"));
      return;
    }
    toast.success(`已删除 ${data.deleted_count} 个词条`);
    clearSelection();
    await loadWordbook();
  } catch (error) {
    toast.error(`网络错误: ${String(error)}`);
  } finally {
    setBusyEntryId(0);
  }
}

async function handleBatchArchive() {
  if (selectedIds.size === 0) return;
  try {
    const resp = await apiCall("/api/wordbook/batch-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_ids: Array.from(selectedIds), status: "mastered" }),
    });
    const data = await parseResponse(resp);
    if (!resp.ok) {
      toast.error(toErrorText(data, "批量归档失败"));
      return;
    }
    toast.success(`已将 ${data.updated_count} 个词条标记为已掌握`);
    clearSelection();
    await loadWordbook();
  } catch (error) {
    toast.error(`网络错误: ${String(error)}`);
  }
}

async function handleBatchMove() {
  if (selectedIds.size === 0) return;
  // Simple prompt for target lesson ID (could be replaced with a modal)
  const lessonIdStr = window.prompt(`将 ${selectedIds.size} 个词条移动到课程 ID：`);
  if (!lessonIdStr) return;
  const lessonId = parseInt(lessonIdStr, 10);
  if (isNaN(lessonId) || lessonId <= 0) {
    toast.error("请输入有效的课程 ID");
    return;
  }
  try {
    const resp = await apiCall("/api/wordbook/batch-move", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_ids: Array.from(selectedIds), target_lesson_id: lessonId }),
    });
    const data = await parseResponse(resp);
    if (!resp.ok) {
      toast.error(toErrorText(data, "批量移动失败"));
      return;
    }
    toast.success(`已将 ${data.moved_count} 个词条移动到新课程`);
    clearSelection();
    await loadWordbook();
  } catch (error) {
    toast.error(`网络错误: ${String(error)}`);
  }
}
```

3. **IMPORTANT: Render FloatingToolbar at component level, NOT inside the list scroll container**

The FloatingToolbar uses `position: fixed` so it should be rendered outside any scrollable containers. Place it at the top of the component's return statement:

```jsx
return (
  <Card>
    {/* ... header, mode tabs, filters ... */}

    {/* FloatingToolbar renders at viewport level via position:fixed */}
    <FloatingToolbar
      selectedCount={selectedIds.size}
      onDelete={handleBatchDelete}
      onArchive={handleBatchArchive}
      onMove={handleBatchMove}
      onClear={clearSelection}
    />

    {/* List view with scrollable container */}
    {panelMode === "list" ? (
      <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-300px)]">
        {/* Add "Select All" checkbox at top of list */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/10 px-3 py-2 sticky top-0 z-10">
            <input
              type="checkbox"
              checked={selectedIds.size === items.length && items.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size === items.length ? "取消全选" : "全选"}
            </span>
          </div>
        )}

        {items.map((item) => {
          const busy = busyEntryId === Number(item.id || 0);
          const isMastered = Number(item.memory_score || 0) >= 0.85;
          const isSelected = selectedIds.has(Number(item.id || 0));
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "bg-background"
              }`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                {/* Add checkbox at start of item */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        const id = Number(item.id || 0);
                        if (next.has(id)) {
                          next.delete(id);
                        } else {
                          next.add(id);
                        }
                        return next;
                      });
                    }}
                    className="mt-1 h-4 w-4 rounded border-input"
                  />
                  <div className="min-w-0 space-y-3">
                    {/* ... existing item content ... */}
                  </div>
                </div>
                {/* ... existing action buttons ... */}
              </div>
            </div>
          );
        })}
      </div>
    ) : null}
  </Card>
);
```
</action>

### Task 18-02.4: Apply shadcn Card Styling to List Items (WORD-06)

<read_first>
- `.planning/workstreams/milestone/phases/17-wordbook-review-improvements/17-UI-SPEC.md` (shadcn patterns)
- `frontend/src/features/wordbook/WordbookPanel.jsx` (current list implementation)
</read_first>

<acceptance_criteria>
- [ ] List items use `rounded-2xl` Card styling (per 17-UI-SPEC.md)
- [ ] List items use `bg-background` base (per 17-UI-SPEC.md)
- [ ] Status badges use `variant="outline"` or `variant="secondary"`
- [ ] List item padding uses `p-4` (16px)
- [ ] List item spacing uses `gap-3` (12px)
- [ ] Typography hierarchy consistent with Phase 17 review view styling
- [ ] Selection state uses `border-primary bg-primary/5`
</acceptance_criteria>

<action>
Update list item rendering in `WordbookPanel.jsx` to match shadcn Card patterns per 17-UI-SPEC.md:

**Per D-18-07: shadcn 风格收口范围：列表 + 复习视图**

Apply the following styling to list items (matching 17-UI-SPEC.md Section 2 Design Language):

1. **Card container styling:**
```jsx
<div
  key={item.id}
  className={cn(
    // Base Card styling (per 17-UI-SPEC.md)
    "rounded-2xl border bg-background p-4",
    // Spacing between cards
    "space-y-3",
    // Selection state
    isSelected ? "border-primary bg-primary/5" : ""
  )}
>
```

2. **Status badge styling** (consistent with Phase 17):
```jsx
{/* Use shadcn Badge with outline/secondary variant */}
<Badge variant="outline" className="text-xs">
  {statusLabel}
</Badge>

{/* For mastery indicator */}
<Badge
  variant={isMastered ? "secondary" : "outline"}
  className="text-xs"
>
  {isMastered ? "已掌握" : "学习中"}
</Badge>
```

3. **Typography hierarchy** (per 17-UI-SPEC.md):
- Word text: `text-lg font-semibold` (24px, semibold)
- Context text: `text-sm text-muted-foreground` (14px)
- Button text: `text-sm font-medium` (14px)
- Progress: `text-xs text-muted-foreground` (12px)

4. **Inner layout spacing:**
```jsx
<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
  {/* Content area */}
  <div className="space-y-2">
    {/* Word */}
    <p className="text-lg font-semibold">{item.entry_text}</p>
    {/* Context */}
    <p className="text-sm text-muted-foreground line-clamp-2">
      {item.latest_sentence_en || "暂无语境"}
    </p>
    {/* Meta info */}
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline" className="text-xs">{item.source_lesson_name}</Badge>
      <span>收录于 {formatDate(item.created_at)}</span>
    </div>
  </div>
  {/* Action buttons */}
  <div className="flex items-center gap-1">
    {/* ... action buttons ... */}
  </div>
</div>
```
</action>

---

## Plan 18-03: Tooltip System Enhancement

```yaml
---
wave: 1
depends_on: []
requirements_addressed: [HINT-01, HINT-02]
autonomous: true
---
```

### Task 18-03.1: Create Semi-Transparent Tooltip Style

<read_first>
- `frontend/src/components/ui/tooltip.jsx` (existing tooltip)
- `.planning/workstreams/milestone/phases/18-wordbook-management-improvements/18-CONTEXT.md` (D-18-04, D-18-05, D-18-06)
</read_first>

<acceptance_criteria>
- [ ] Tooltip has semi-transparent background (`bg-black/80` or similar)
- [ ] Tooltip has backdrop blur effect (`backdrop-blur-sm`)
- [ ] Tooltip has no border (`border-0`)
- [ ] Custom class `tooltip-hint` applied to tooltips
</acceptance_criteria>

<action>
Update `frontend/src/components/ui/tooltip.jsx`:

```jsx
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 z-50 overflow-hidden rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

// Semi-transparent hint style for immersive learning buttons (D-18-04, D-18-05)
export function TooltipHint({ children, content }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent
        className="bg-black/80 text-white border-0 shadow-xl backdrop-blur-sm"
        sideOffset={4}
      >
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}
```
</action>

### Task 18-03.2: Wrap ImmersiveLearning with TooltipProvider

<read_first>
- `frontend/src/features/wordbook/WordbookPanel.jsx` (review mode implementation)
</read_first>

<acceptance_criteria>
- [ ] `grep -n "TooltipProvider" frontend/src/features/wordbook/WordbookPanel.jsx` finds provider wrapper
- [ ] Review mode buttons (again, hard, good, easy) wrapped with tooltips
- [ ] Play button for lesson popup wrapped with tooltip
- [ ] Each tooltip shows contextual hint on hover
</acceptance_criteria>

<action>
Update `frontend/src/features/wordbook/WordbookPanel.jsx`:

1. Add imports:

```javascript
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
```

2. Wrap review section with TooltipProvider:

```jsx
{/* Replace the review section div with TooltipProvider wrapper */}
{panelMode === "review" ? (
  <TooltipProvider delayDuration={300}>
    <div className="space-y-4 rounded-2xl border bg-muted/5 p-4">
      {/* ... existing review content ... */}
    </div>
  </TooltipProvider>
) : null}
```

3. Wrap review buttons with tooltips:

```jsx
{/* Replace review buttons section */}
{!reviewFeedback ? (
  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    {REVIEW_ACTIONS.map((action) => {
      const tooltips = {
        again: { hover: "点击后会在 10 分钟后再次出现", click: "已安排 10 分钟后复习" },
        hard: { hover: "点击后会间隔较短时间复习", click: "已安排约 4 小时后复习" },
        good: { hover: "点击后正常间隔复习", click: "已安排约 1 天后复习" },
        easy: { hover: "点击后会间隔较长时间复习", click: "已安排约 4 天后复习" },
      };
      const gradeTooltip = tooltips[action.grade] || { hover: "", click: "" };
      return (
        <div key={action.grade} className="space-y-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full px-4"
                disabled={busyEntryId === Number(reviewItem.id || 0)}
                onClick={() => void handleReview(action.grade)}
              >
                {action.label}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
              <p>{gradeTooltip.hover}</p>
            </TooltipContent>
          </Tooltip>
          <p className="text-center text-xs text-muted-foreground">
            {getIntervalLabel(action.grade) || "—"}
          </p>
        </div>
      );
    })}
  </div>
) : null}
```

4. Wrap Play button with tooltip:

```jsx
{/* Replace Play button */}
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0"
      onClick={() => void openLessonPopup(reviewItem.source_lesson_id, reviewItem.latest_sentence_idx)}
    >
      <Play className="size-4" />
      播放课程
    </Button>
  </TooltipTrigger>
  <TooltipContent className="bg-black/80 text-white border-0 backdrop-blur-sm">
    <p>查看来源课程并播放</p>
  </TooltipContent>
</Tooltip>
```

5. Add state for click-based tooltip (D-18-06: 点击后各显示一次):

```javascript
const [clickTooltip, setClickTooltip] = useState(null);

async function handleReview(grade) {
  // ... existing code ...
  // After successful review, show click tooltip
  setClickTooltip(grade);
  setTimeout(() => setClickTooltip(null), 2000);
}
```

6. Update button tooltips to show click feedback:

```jsx
{/* Add click feedback tooltip */}
{clickTooltip && (
  <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-background/95 px-4 py-2 shadow-lg backdrop-blur-sm">
    <p className="text-sm font-medium">
      {{
        again: "已安排 10 分钟后复习",
        hard: "已安排约 4 小时后复习",
        good: "已安排约 1 天后复习",
        easy: "已安排约 4 天后复习",
      }[clickTooltip]}
    </p>
  </div>
)}
```
</action>

---

## Plan 18-04: Translation Dialog & Local Translation

```yaml
---
wave: 2
depends_on: [18-01]
requirements_addressed: [WORD-05]
autonomous: true
---
```

### Task 18-04.1: Create TranslationDialog Component

<read_first>
- `frontend/src/shared/ui` (shadcn Dialog component)
- `.planning/workstreams/milestone/phases/18-wordbook-management-improvements/18-RESEARCH.md` (dialog patterns)
</read_first>

<acceptance_criteria>
- [ ] File `frontend/src/features/wordbook/TranslationDialog.jsx` exists
- [ ] Dialog opens with selected text displayed
- [ ] Loading state while translating
- [ ] Translation result displayed in dialog
- [ ] Error state with retry option
</acceptance_criteria>

<action>
Create `frontend/src/features/wordbook/TranslationDialog.jsx`:

```jsx
import { useCallback, useEffect, useState } from "react";
import { parseResponse, toErrorText } from "../../shared/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui";
import { Button } from "../../shared/ui";
import { Loader2, AlertCircle } from "lucide-react";

export function TranslationDialog({
  open,
  onClose,
  text,
  apiCall,
}) {
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && text) {
      void translateText(text);
    }
  }, [open, text]);

  const translateText = useCallback(async (textToTranslate) => {
    setLoading(true);
    setError(null);
    setTranslation("");
    try {
      const resp = await apiCall("/api/wordbook/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToTranslate }),
      });
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setError(toErrorText(data, "翻译失败"));
        return;
      }
      setTranslation(data.translation || "");
    } catch (err) {
      setError(`网络错误: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const handleRetry = useCallback(() => {
    if (text) {
      void translateText(text);
    }
  }, [text, translateText]);

  const handleClose = useCallback(() => {
    setTranslation("");
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>局部翻译</DialogTitle>
          <DialogDescription>
            对选中的内容进行即时翻译
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Original text */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">原文</p>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm">{text}</p>
            </div>
          </div>

          {/* Translation result */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">翻译</p>
            {loading ? (
              <div className="flex items-center justify-center rounded-lg border bg-muted/30 p-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">翻译中...</span>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="size-4 mt-0.5 text-destructive shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetry}
                      className="h-7 text-xs"
                    >
                      重试
                    </Button>
                  </div>
                </div>
              </div>
            ) : translation ? (
              <div className="rounded-lg border bg-primary/5 p-3">
                <p className="text-sm">{translation}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">暂无翻译结果</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
</action>

### Task 18-04.2: Add Translate Button and Dialog State

<read_first>
- `frontend/src/features/wordbook/WordbookPanel.jsx` (current implementation)
- `frontend/src/features/wordbook/TranslationDialog.jsx` (new component)
</read_first>

<acceptance_criteria>
- [ ] TranslationDialog imported in WordbookPanel
- [ ] Translation state: `{ open: boolean, text: string }`
- [ ] Translate button visible in list item actions
- [ ] Clicking translate opens dialog with selected text
- [ ] Dialog calls `/api/wordbook/translate` endpoint
</acceptance_criteria>

<action>
Update `frontend/src/features/wordbook/WordbookPanel.jsx`:

1. Add import for TranslationDialog and Lucide icon:

```javascript
import { TranslationDialog } from "./TranslationDialog";
import { Languages } from "lucide-react"; // Add this import
```

2. Add translation dialog state:

```javascript
const [translationDialog, setTranslationDialog] = useState({ open: false, text: "" });
```

3. Add translation handlers:

```javascript
const openTranslationDialog = useCallback((text) => {
  setTranslationDialog({ open: true, text: text || "" });
}, []);

const closeTranslationDialog = useCallback(() => {
  setTranslationDialog({ open: false, text: "" });
}, []);
```

4. Add translate button to list item actions (next to delete button):

```jsx
<Button
  type="button"
  size="sm"
  variant="ghost"
  onClick={() => void openTranslationDialog(item.entry_text)}
  title="翻译"
>
  <Languages className="size-4" />
  翻译
</Button>
```

5. Add TranslationDialog at end of component (before closing Card tag):

```jsx
<TranslationDialog
  open={translationDialog.open}
  onClose={closeTranslationDialog}
  text={translationDialog.text}
  apiCall={apiCall}
/>
```

6. Also add translate button in review mode context section:

```jsx
{/* In review mode, add translate button next to context text */}
<div className="flex items-center gap-2">
  <p className="text-sm text-muted-foreground flex-1">
    英文语境：{reviewItem.latest_sentence_en || "暂无英文语境"}
  </p>
  <Button
    type="button"
    size="sm"
    variant="ghost"
    className="h-7 px-2"
    onClick={() => void openTranslationDialog(reviewItem.latest_sentence_en)}
  >
    <Languages className="size-3" />
  </Button>
</div>
```
</action>

---

## Verification Checklist

### Backend Verification
- [ ] `curl /api/wordbook/batch-delete` with valid entry_ids returns deleted_count
- [ ] `curl /api/wordbook/batch-status` with status "mastered" updates entries
- [ ] `curl /api/wordbook/batch-move` with target_lesson_id reassigns entries
- [ ] `curl /api/wordbook/translate` with text returns translation
- [ ] All batch endpoints return 401 without authentication
- [ ] All batch endpoints return failed_ids for non-existent entries

### Frontend Verification
- [ ] Checkbox click toggles single item selection
- [ ] Shift+click selects range between items
- [ ] Ctrl/Cmd+click adds/removes from selection
- [ ] **FloatingToolbar appears at viewport top (not inside scroll container)**
- [ ] **FloatingToolbar uses z-50 for proper stacking**
- [ ] FloatingToolbar shows correct count
- [ ] Batch delete removes items from list
- [ ] Batch archive changes status filter
- [ ] Tooltip appears on hover (300ms delay)
- [ ] Tooltip has semi-transparent black background
- [ ] Click feedback tooltip shows after review
- [ ] TranslationDialog opens with selected text
- [ ] TranslationDialog shows loading state
- [ ] TranslationDialog displays translation result

### Integration Verification
- [ ] Backend batch operations complete within 2 seconds for 100 items
- [ ] Selection persists across filter changes
- [ ] Selection clears after batch operation
- [ ] Error messages are user-friendly (Chinese)
- [ ] **UI matches shadcn Card styling from Phase 17 (WORD-06)**
- [ ] **List items use rounded-2xl, p-4, gap-3 spacing**
- [ ] **Status badges use outline/secondary variant**

---

## File Change Summary

### New Files
- `frontend/src/features/wordbook/FloatingToolbar.jsx`
- `frontend/src/features/wordbook/TranslationDialog.jsx`

### Modified Files
- `app/schemas/wordbook.py` (add batch schemas)
- `app/services/wordbook_service.py` (add batch functions)
- `app/api/routers/wordbook.py` (add batch endpoints)
- `frontend/src/components/ui/tooltip.jsx` (add TooltipHint)
- `frontend/src/features/wordbook/WordbookPanel.jsx` (add selection, toolbar, translation, shadcn styling)

---

## Dependencies
- Phase 17: shadcn component patterns (17-UI-SPEC.md)
- Phase 9: Translation API (`translate_to_zh`)
- Existing: Dialog, Button, Card, Badge components

---

## Out of Scope
- Translation result persistence (only display, not save)
- Complex filtering/sorting in management view
- Review strategy adjustments (Phase 17 scope)

---

## Decisions Summary

| # | Decision | Source |
|---|----------|--------|
| D-18-01 | 批量选择使用混合模式 | Context |
| D-18-02 | 顶部悬浮工具栏 (FloatingToolbar at viewport top) | Context |
| D-18-03 | 局部翻译调用 API 重新获取 | Context |
| D-18-04 | 新建轻提示组件 (半透明悬浮样式) | Context |
| D-18-05 | 轻提示触发: Hover | Context |
| D-18-06 | 沉浸式学习按钮都加上轻提示 | Context |
| D-18-07 | shadcn 风格收口范围：列表 + 复习视图 | Context |
| D-18-08 | 局部翻译 API 使用 qwen-mt-flash 模型 | Context |
| D-18-09 | 用户选中单词/短语后实时调用 API | Context |

---

*Plan created: 2026-04-02*
*Plan updated: 2026-04-02 (revised: Fixed FloatingToolbar position, added Task 18-02.4 for WORD-06)*
