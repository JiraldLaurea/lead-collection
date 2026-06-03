# Prototype Development Pipeline — Full Auto Execution

This instruction runs Step 1 through Step 7 continuously after the PRD is complete and validated. User review is replaced by automated self-validation and cross-validation. Use this mode when the PRD is already approved and the user wants the pipeline to continue without review gates.

---

## Usage

After PRD completion, use:

```text
"Run everything"
```

or

```text
"Run from Step 1 to the end"
```

---

## Preconditions

1. `PRD.md` exists.
2. The PRD has passed self-validation in four categories:
   - completeness
   - consistency
   - specificity
   - downstream compatibility
3. The project root exists or can be created.
4. The user has accepted automatic execution without intermediate review gates.

---

## Execution Flow

```text
PRD completed and validated
  ↓
Phase 0: Pre-check
  ↓
Phase 1: Planning document generation
  ↓
Phase 2: System design
  ↓
Phase 3: Initial project setup
  ↓
Phase 4: Task creation
  ↓
Phase 5: Development execution
  ↓
Phase 6: Testing
  ↓
Phase 7: Deployment preparation
  ↓
Completion report
```

---

# Phase 0: Pre-Check

1. Read `PRD.md`.
2. Confirm PRD self-validation passed.
3. If validation fails, auto-fix and revalidate up to 2 times.
4. If still failing, report unresolved issues and stop.
5. Confirm or create the project root.
6. Confirm or create:

```text
docs/logs/
docs/PIPELINE-STATUS.md
```

7. Record the pipeline start in `docs/PIPELINE-STATUS.md`.

---

# Phase 1: Planning Document Generation

Run `2. Planning Documents.md`.

Outputs:

```text
docs/plans/{module}/spec.md
docs/plans/policies/{policy}.md
docs/plans/wireframes/{module}.html
docs/plans/design-system.md
docs/plans/ui-implementation-rules.md
```

Validation:

- spec ↔ PRD feature mapping
- spec ↔ PRD API Section 9 mapping
- wireframe ↔ screen list mapping
- policy ↔ PRD policy mapping
- policy ↔ PRD error-code mapping
- design-system ↔ wireframe consistency

If validation fails, auto-fix and revalidate up to 2 times.

---

# Phase 2: System Design

Run `3. System Design.md`.

Outputs:

```text
docs/architecture/architecture.md
docs/architecture/db-design.md
docs/architecture/api-contract.md
```

Validation:

- PRD ↔ DB design
- PRD ↔ API contract
- DB design ↔ API contract
- architecture internal consistency

If validation fails, auto-fix and revalidate up to 2 times.

---

# Phase 3: Initial Project Setup

Run `4. Project Initial Setup.md`.

Setup must include:

- project structure
- frontend setup
- backend setup
- DB setup
- shared types
- CI/CD
- development environment
- shared UI components
- isolated project infrastructure

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

If monorepo:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api build
```

Also validate DB migration and seed commands.

---

# Phase 4: Task Creation

Run `5. Task Creation.md`.

Required outputs:

```text
docs/plans/tasks/{TASK-ID}.md
docs/plans/tasks/_dependency-graph.md
docs/plans/tasks/_traceability-matrix.md
docs/plans/tasks/_screen-inventory.md
docs/plans/tasks/_task-summary.md
```

Validation:

- every feature maps to a task
- every API maps to a BE/FS task
- every wireframe screen maps to a FE/FS task
- every CRUD API has corresponding UI or explicit exclusion
- dependency graph has no unresolved dependencies

If validation fails, fix and revalidate.

---

# Phase 5: Development Execution

Run `6. Development Execution.md`.

Execution order:

```text
INF → DB → BE → FE → FS → TEST/SEC
```

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Additional validation:

- all API endpoints verified
- all policy clauses implemented
- unit test files exist
- wireframe visual verification completed
- Git commits created by task or logical group

If build or tests fail, analyze error, fix, and rerun up to 3 times.

---

# Phase 6: Testing

Run `7. Testing.md`.

Outputs:

```text
tests/integration/
e2e/
tests/security/
docs/plans/test-plan.md
docs/screenshots/
docs/logs/YYYY-MM-DD.md
```

Validation:

- integration tests pass
- E2E tests pass
- layout assertion tests pass
- security checks pass
- optional performance tests pass or are skipped with a reason

---

# Phase 7: Deployment Preparation

Run `8. Deployment Preparation.md`.

Outputs:

```text
docs/deployment/runbook.md
docs/deployment/migration-plan.md
docs/deployment/rollback-plan.md
docs/deployment/smoke-test-checklist.md
```

Validation:

- deployment checklist complete
- environment variable matrix complete
- migration plan complete
- rollback plan complete
- health check verified
- monitoring and alerting plan complete

---

## Failure Handling Rules

| Situation | Response |
|---|---|
| document validation fails | auto-fix → revalidate up to 2 times |
| build/test fails | analyze error → fix → rerun up to 3 times |
| same error repeats twice | try a different approach |
| retry limit exceeded | report to user and stop |
| external service connection fails | use a mock if safe, continue, and log the issue |
| DB migration unsafe | stop and report risk |
| Git conflict or dirty state | stop and report current changes |

---

## Context Management

| Phase | Required Reads |
|---|---|
| Phase 1 | PRD, planning instruction |
| Phase 2 | PRD, planning outputs, system design instruction |
| Phase 3 | PRD, planning outputs, system design outputs, setup instruction |
| Phase 4 | PRD, planning outputs, architecture outputs, code patterns, task instruction |
| Phase 5 | PRD, tasks, dependency graph, architecture outputs, planning outputs, development instruction |
| Phase 6 | PRD, architecture outputs, specs, policies, wireframes, testing instruction |
| Phase 7 | PRD Sections 10/13, architecture outputs, deployment instruction |

---

## Progress Log Format

Write progress logs to:

```text
docs/logs/YYYY-MM-DD.md
```

Format:

```markdown
# Auto Execution Log

## Phase N: {Phase Name} — success/failure
- **Start**: {time}
- **Completed**: {time}
- **Outputs**: {created files}
- **Validation Result**: {passed count}/{total count}
- **Auto-Fixes**: {fixes if any}
- **Next Phase**: Phase {N+1}
```

---

## Completion Report

```markdown
## Auto Execution Complete

### Execution Result
- Phase 1 Planning Documents: ✅
- Phase 2 System Design: ✅
- Phase 3 Project Setup: ✅
- Phase 4 Task Creation: ✅
- Phase 5 Development: ✅
- Phase 6 Testing: ✅
- Phase 7 Deployment Preparation: ✅

### Generated Files
- docs/plans/...
- docs/architecture/...
- docs/plans/tasks/...
- source code
- tests
- deployment docs

### Auto-Fix History
- ...

### Manual Checks Recommended
- review wireframes in browser
- manually test critical UI flows
- review DB migrations before production
- set actual `.env` values
- complete final code review before production deployment
```

---

## Stop and Resume

When stopped, update:

```text
docs/PIPELINE-STATUS.md
```

Use this format:

```markdown
Stopped at: Phase {N} - {stage}
Reason: {reason}
Last successful output: {file or command}
Next action: {what should happen next}
```

To resume:

```text
"Continue execution"
"Run from Phase 5"
```

Before resuming, read `docs/PIPELINE-STATUS.md` first.

---

## Expected Outputs by Phase

| Phase | Expected Outputs |
|---|---|
| Phase 1 | specs, policies, wireframes, design system, UI rules |
| Phase 2 | architecture, DB design, API contract |
| Phase 3 | project skeleton, env example, CI, DB setup, shared UI/types |
| Phase 4 | task files, dependency graph, traceability matrix, screen inventory |
| Phase 5 | implemented code, unit tests, commits, screenshots |
| Phase 6 | integration tests, E2E tests, security checks, test plan, logs |
| Phase 7 | deployment runbook, migration plan, rollback plan, smoke test checklist |
