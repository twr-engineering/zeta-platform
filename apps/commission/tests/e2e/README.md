# E2E Tests

Playwright end-to-end tests for this app.

## How tests are created

1. **QA Agent** writes tests based on PRD user stories (not source code)
2. Tests are committed to this directory
3. On subsequent builds, the coding agent runs these tests before making changes

## Running tests

```bash
# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific test file
npx playwright test tests/e2e/auth.spec.ts
```

## Test conventions

- One file per feature area (e.g., `auth.spec.ts`, `dashboard.spec.ts`)
- Use `data-testid` attributes for selectors (not CSS classes)
- Each test maps to a PRD user story — include the story ID in comments
- Tests verify behavior, not implementation details

## When tests fail after code changes

- If the test conflicts with new feature requirements → **update the test** with a comment explaining why
- If the test is unrelated to your changes → **you broke something, fix the code**
- **NEVER silently delete a test**
