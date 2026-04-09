# TESTING

## Backend Testing

### Framework

**pytest** — configured in `pytest.ini`

```
[pytest]
testpaths = app/test
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
```

### Test Structure

- **Location:** `app/test/`
- **Naming:** `test_*.py`
- **Fixtures:** Not visible in standard glob (likely `conftest.py`)

### Example

```python
# app/test/test_example.py
def test_something():
    assert True
```

### Coverage

Run tests with coverage:
```bash
pytest --cov=app --cov-report=term-missing
```

## Frontend Testing

### Framework

**Vitest** + **@testing-library/react**

```json
// package.json scripts
"test": "vitest",
"test:ui": "vitest --ui",
"test:coverage": "vitest run --coverage",
"test:watch": "vitest --watch"
```

### Test Files

Co-located with source files:

```
frontend/src/features/admin-rates/__tests__/rateDraftValidation.test.js
frontend/src/app/learning-shell/__tests__/panelRoutes.test.js
```

### Example

```javascript
// rateDraftValidation.test.js
import { describe, it, expect } from 'vitest'
import { validateRateDraft } from '../rateDraftValidation'

describe('validateRateDraft', () => {
  it('returns error for negative price', () => {
    expect(validateRateDraft({ price_per_minute_yuan: -1 })).toBeDefined()
  })
})
```

### Testing Library Patterns

```javascript
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Prefer userEvent over fireEvent for user interactions
await userEvent.click(button)
```

## CI/CD

- No visible CI config in root (likely in Zeabur or external CI)
- Playwright tests may be in `.playwright-cli/` (manual runs)

## Coverage Target

Per project rules: **80% minimum** test coverage

## Known Test Gaps

- Backend: No visible `conftest.py` or detailed test structure
- Integration tests: DB tests likely require test database
- E2E tests: Playwright config present but not in CI
