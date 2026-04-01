# Phase 18 Research: wordbook-management-improvements

**Phase:** 18-wordbook-management-improvements
**Created:** 2026-04-02
**Status:** Research Complete

---

## 1. Technical Approach Recommendations

### 1.1 Batch Selection (Checkbox + Shift Multi-Select)

**Recommendation:** Implement hybrid selection mode using React state management.

**Implementation Pattern:**

```jsx
// State structure
const [selectedIds, setSelectedIds] = useState(new Set());
const [lastSelectedId, setLastSelectedId] = useState(null);

// Shift multi-select logic
const handleItemClick = (itemId, event) => {
  if (event.shiftKey && lastSelectedId) {
    // Range selection between lastSelectedId and itemId
    const items = getSortedItems();
    const lastIdx = items.findIndex(i => i.id === lastSelectedId);
    const currentIdx = items.findIndex(i => i.id === itemId);
    const [start, end] = [lastIdx, currentIdx].sort((a, b) => a - b);
    const rangeIds = items.slice(start, end + 1).map(i => i.id);
    setSelectedIds(prev => new Set([...prev, ...rangeIds]));
  } else if (event.ctrlKey || event.metaKey) {
    // Toggle single item
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  } else {
    // Direct click without modifier - checkbox behavior
    setSelectedIds(new Set([itemId]));
  }
  setLastSelectedId(itemId);
};
```

**Reference:** The current `WordbookPanel.jsx` already renders items in a deterministic order via `items.map()`, making range selection straightforward.

### 1.2 Floating Toolbar

**Recommendation:** CSS-positioned sticky bar that appears when `selectedIds.size > 0`.

**Implementation Pattern:**

```jsx
<div className={`sticky top-0 z-50 transition-all duration-200 ${selectedIds.size > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
  <div className="flex items-center gap-2 rounded-xl border bg-background/95 backdrop-blur shadow-lg px-4 py-2">
    <span className="text-sm font-medium">{selectedIds.size} 项已选中</span>
    <Separator orientation="vertical" className="h-6" />
    <Button size="sm" variant="ghost" onClick={() => batchDelete()}>删除</Button>
    <Button size="sm" variant="ghost" onClick={() => batchArchive()}>归档</Button>
    <Button size="sm" variant="ghost" onClick={() => batchMove()}>移动到</Button>
    <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>取消</Button>
  </div>
</div>
```

**Key Styling:**
- `backdrop-blur` for glassmorphism effect
- `shadow-lg` for elevation
- Smooth opacity/transform transitions

### 1.3 Lightweight Hint Component (Tooltip)

**Finding:** Project already has shadcn Tooltip at `frontend/src/components/ui/tooltip.jsx` with full `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent` exports.

**Decision D-18-04 requirement: "半透明悬浮样式"** requires custom styling beyond default shadcn.

**Recommended Approach:**

```jsx
// Use existing Tooltip with custom styling
<Tooltip>
  <TooltipTrigger asChild>
    <Button className="data-[state=delayed-open]:bg-primary/90">
      <PlayIcon />
    </Button>
  </TooltipTrigger>
  <TooltipContent className="bg-black/80 text-white border-0 shadow-xl backdrop-blur-sm">
    <p>播放课程</p>
  </TooltipContent>
</Tooltip>
```

**CSS Customization via Tailwind:**
- `bg-black/80` → semi-transparent black background
- `backdrop-blur-sm` → frosted glass effect
- `border-0` → remove default border

**D-18-06 Coverage:** Apply to all immersive learning buttons (relearn, hard, good, easy buttons in review mode).

### 1.4 Partial Translation Dialog

**Recommendation:** Reuse existing `Dialog` component with custom content area.

**Existing Components:**
- Dialog from `frontend/src/shared/ui` (shadcn)
- Translation service: `app/services/translation_qwen_mt.translate_to_zh(text, api_key)`

**Implementation Pattern:**

```jsx
const [translationDialog, setTranslationDialog] = useState({
  open: false,
  selectedText: '',
  translation: '',
  loading: false
});

const handleTranslate = async (text) => {
  setTranslationDialog({ open: true, selectedText: text, translation: '', loading: true });
  try {
    const resp = await apiCall('/api/wordbook/translate', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    const data = await parseResponse(resp);
    setTranslationDialog(prev => ({ ...prev, translation: data.translation, loading: false }));
  } catch {
    setTranslationDialog(prev => ({ ...prev, translation: '翻译失败', loading: false }));
  }
};
```

---

## 2. Key Implementation Patterns

### 2.1 API Design for Batch Operations

**New Backend Endpoints Needed:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/wordbook/batch-delete` | POST | Delete multiple entries |
| `/api/wordbook/batch-update-status` | PATCH | Archive/unarchive multiple |
| `/api/wordbook/batch-move` | PATCH | Move entries to different lesson source |
| `/api/wordbook/translate` | POST | Translate selected text (D-18-08, D-18-09) |

**Request/Response Schemas:**

```python
# Batch Delete
class WordbookBatchDeleteRequest(BaseModel):
    entry_ids: list[int] = Field(min_length=1, max_length=100)

class WordbookBatchDeleteResponse(BaseModel):
    ok: bool = True
    deleted_count: int
    failed_ids: list[int] = []

# Batch Status Update
class WordbookBatchStatusRequest(BaseModel):
    entry_ids: list[int] = Field(min_length=1, max_length=100)
    status: WordbookEntryStatus

# Partial Translation
class WordbookTranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)

class WordbookTranslateResponse(BaseModel):
    ok: bool = True
    text: str
    translation: str
```

### 2.2 Frontend State Architecture

**Component Hierarchy:**

```
WordbookPanel
├── BatchSelectionToolbar (floating, conditional render)
│   ├── SelectionCount
│   ├── BatchDeleteButton
│   ├── BatchArchiveButton
│   ├── BatchMoveDropdown
│   └── ClearSelectionButton
├── FilterBar (status, lesson source, sort)
├── WordbookList
│   └── WordbookItem[] (with Checkbox + Shift selection)
├── TranslationDialog (Dialog wrapper)
└── LessonPlayerPopup (existing)
```

**State Management:**

```jsx
// WordbookPanel state additions
const [selectedIds, setSelectedIds] = useState(new Set());
const [translationDialog, setTranslationDialog] = useState({ open: false, ... });
```

### 2.3 shadcn Style Alignment

**Reference from Phase 17 UI-SPEC.md:**

| Element | Style Specification |
|---------|---------------------|
| Card | `rounded-2xl` (16px), `bg-background` |
| Buttons | `rounded-lg` (8px), `h-9` or `h-11` |
| Typography | word: 24px semibold, context: 14px muted |
| Spacing | p-4, gap-3 |
| Badge variants | Use `variant="outline"` for neutral, `variant="secondary"` for mastered |

**Component Migration Target:**
- List view items → shadcn Card + Badge pattern
- Review buttons → Already using Button component
- Immersive learning buttons → Add Tooltip hints

---

## 3. Validation Architecture

### 3.1 Functional Tests

**Batch Selection:**
- [ ] Checkbox click toggles single item
- [ ] Shift+click selects range between last clicked and current
- [ ] Ctrl/Cmd+click adds/removes from selection
- [ ] "Select All" selects all visible items
- [ ] Selection persists across filter changes

**Batch Operations:**
- [ ] Delete removes all selected items from list
- [ ] Archive changes status and filters out from "active" view
- [ ] Move reassigns source lesson for all selected
- [ ] Confirmation dialog for destructive batch operations
- [ ] Partial failures show which items failed

**Partial Translation:**
- [ ] Click translate button shows loading state
- [ ] Successful translation displays in dialog
- [ ] Failed translation shows error message
- [ ] Dialog can be closed and reopened

**Tooltip System:**
- [ ] Hover on buttons shows tooltip after 300-500ms delay
- [ ] Tooltip has semi-transparent background with blur
- [ ] Tooltips visible on review buttons (D-18-06)
- [ ] Tooltips dismiss on mouse leave

### 3.2 Integration Tests

```python
# Backend batch operations
def test_wordbook_batch_delete():
    # Create 5 test entries
    # Delete 3 of them
    # Verify 2 remain, 3 deleted

def test_wordbook_batch_translate():
    # Call translate endpoint
    # Verify response structure
    # Verify qwen-mt-flash model used
```

### 3.3 UI Consistency Tests

- [ ] List view matches shadcn Card styling
- [ ] Review view uses consistent Button styles
- [ ] Floating toolbar has glassmorphism effect
- [ ] Tooltip has semi-transparent styling
- [ ] All interactive elements have hover states

---

## 4. Potential Pitfalls and Mitigations

### 4.1 Performance: Large Selection Sets

**Risk:** User selects 100+ items, UI becomes sluggish.

**Mitigation:**
- Use `React.memo` for list items
- Virtualize list if >50 items (consider `react-virtual`)
- Batch DOM updates using `requestAnimationFrame`
- Show loading indicator during batch operations

### 4.2 Shift Selection with Filters

**Risk:** Shift selection might select items outside current filter.

**Mitigation:**
- Track selection by entry ID (stable across filters)
- Clear selection when filter significantly changes
- Visual indication of "X items selected" with filter context

### 4.3 Translation API Rate Limiting

**Risk:** Rapid translate requests could hit rate limits.

**Mitigation:**
- Debounce translate button (300ms)
- Reuse existing `MT_MIN_REQUEST_INTERVAL_MS` infrastructure
- Show user-friendly "请稍后重试" on rate limit

### 4.4 Tooltip Z-Index Conflicts

**Risk:** Floating toolbar or dialogs might cover tooltips.

**Mitigation:**
- Set toolbar z-index lower than tooltip (z-40 vs z-50)
- Use `TooltipProvider` at panel level
- Test tooltip visibility in all states

### 4.5 State Synchronization

**Risk:** Selecting items, then switching views loses selection context.

**Mitigation:**
- Persist selection in component state
- Warn before navigation if selection exists
- "Clear selection" always visible in toolbar

### 4.6 Mobile/Touch Devices

**Risk:** Shift/Ctrl modifiers don't exist on mobile.

**Mitigation:**
- Mobile: Use checkbox-only mode (no shift)
- Touch: Long-press could trigger selection mode
- Consider swipe gestures for batch actions

---

## 5. Dependencies Analysis

### 5.1 Phase 17 Dependencies (Already Implemented)

| Component | Source | Usage |
|-----------|--------|-------|
| shadcn Tooltip | `frontend/src/components/ui/tooltip.jsx` | Hint system base |
| Dialog | `frontend/src/shared/ui` | Translation popup |
| Card, Button, Badge | `frontend/src/shared/ui` | shadcn styling |
| Review buttons | `WordbookPanel.jsx` | Add tooltips here |

### 5.2 Phase 9 Dependencies (Translation API)

| Component | Source | Usage |
|-----------|--------|-------|
| `translate_to_zh()` | `app/services/translation_qwen_mt.py` | Backend translation |
| `MT_MODEL = "qwen-mt-flash"` | `app/infra/translation_qwen_mt.py` | Model specification |

**Backend API Integration:**

```python
# New endpoint in app/api/routers/wordbook.py
@router.post("/translate", response_model=WordbookTranslateResponse)
def translate_wordbook_text(
    payload: WordbookTranslateRequest,
    current_user: User = Depends(get_current_user),
):
    # Get user API key from wallet/credentials
    api_key = get_user_translation_api_key(current_user.id)
    translation = translate_to_zh(payload.text, api_key)
    return WordbookTranslateResponse(
        ok=True,
        text=payload.text,
        translation=translation,
    )
```

### 5.3 New Dependencies

**Frontend:**
- None required (shadcn components already available)

**Backend:**
- `app/api/routers/wordbook.py` additions
- `app/services/wordbook_service.py` batch functions
- `app/schemas/wordbook.py` new schemas

---

## 6. Implementation Sequence Recommendation

### Phase 18-01: Batch Selection Infrastructure
1. Add selection state to `WordbookPanel`
2. Implement checkbox + shift multi-select logic
3. Create floating toolbar component
4. Wire up selection count display

### Phase 18-02: Batch Operations
1. Add batch delete endpoint + frontend
2. Add batch status update endpoint + frontend
3. Add batch move endpoint + frontend
4. Add confirmation dialogs

### Phase 18-03: Partial Translation
1. Add translate endpoint to wordbook router
2. Create TranslationDialog component
3. Wire up translate button trigger
4. Handle loading/error states

### Phase 18-04: UI Polish & Tooltips
1. Apply shadcn Card styling to list items
2. Add TooltipProvider wrapper
3. Add tooltips to immersive learning buttons
4. Apply semi-transparent tooltip styling

---

## 7. Open Questions (Pre-Research Answers)

| Question | Answer from Research |
|----------|----------------------|
| Tooltip library? | Already have shadcn Tooltip at `components/ui/tooltip.jsx` |
| Translation API? | `translate_to_zh()` in `app/services/translation_qwen_mt.py`, model `qwen-mt-flash` |
| Batch API pattern? | Follow existing wordbook CRUD pattern with batch request schemas |
| Mobile selection? | Fallback to checkbox-only (no Shift) on touch devices |

---

## 8. Summary

Phase 18 requires **backend batch endpoints** and **frontend selection UI** with existing component infrastructure. Key technical decisions:

1. **Selection:** React state with Set-based tracking, Shift range support
2. **Toolbar:** CSS sticky positioning with glassmorphism styling
3. **Translation:** Reuse `translate_to_zh()`, add new API endpoint
4. **Tooltips:** Extend existing shadcn Tooltip with custom semi-transparent styling
5. **UI:** Apply Phase 17 shadcn patterns to list view items

**Risk Level:** Medium — Standard CRUD operations with well-understood patterns.

---

*Research completed: 2026-04-02*
