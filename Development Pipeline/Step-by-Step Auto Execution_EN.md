# Prototype Development Pipeline — Step-by-Step Auto Execution

This instruction runs the prototype development pipeline with user review gates between major parts. It is designed for quality control when the user wants to approve PRD, planning, and implementation stages separately.

---

## Usage

### Start from requirements

```text
"Run step-by-step" + requirements
```

Flow:

```text
Part 0: PRD Preparation → User Review → Part A: Planning → User Review → Part B: Implementation
```

### Start from an existing PRD

```text
"Run step-by-step" + PRD path
```

Flow:

```text
Part 0: PRD validation/revision → User Review → Part A → User Review → Part B
```

### Run by part

```text
"Run planning"          → Part A only
"Run implementation"    → Part B only
```

---

## Execution Flow

```text
[Requirements] or [Existing PRD]
  ↓
Part 0: PRD Preparation
  - Case A: requirements → create PRD
  - Case B: existing PRD → validate and revise if needed
  ↓
USER REVIEW GATE: PRD approval
  ↓
Part A: Planning Stage
  - Phase 1: Planning document generation
  - Phase 2: System design
  ↓
USER REVIEW GATE: planning approval
  ↓
Part B: Implementation Stage
  - Phase 3: Initial project setup
  - Phase 4: Task creation
  - Phase 5: Development execution
  - Phase 6: Testing
  - Phase 7: Deployment preparation
  ↓
Completion report
```

---

# Part 0: PRD Preparation

## Trigger

```text
"Run step-by-step" + requirements or PRD path
```

---

## Case A: Requirements Only

Run `1. PRD Writing.md`.

Steps:

1. Read `1. PRD Writing.md`.
2. Create `PRD.md` in the project root.
3. Run PRD self-validation:
   - completeness
   - consistency
   - specificity
   - downstream compatibility
4. If validation fails, auto-fix and revalidate up to 2 times.
5. If still failing, report missing items and stop.

---

## Case B: Existing PRD

Steps:

1. Read the existing PRD.
2. Validate against the 4 PRD self-validation categories.
3. If it passes, proceed to PRD review.
4. If it does not pass, revise automatically and revalidate up to 2 times.
5. If still failing, report unresolved issues and stop.

---

## Part 0 Completion Report

```markdown
## PRD Preparation Complete — Review Requested

### Execution Result
- PRD created/validated: ✅
- Self-validation: 4/4 categories passed
- Revised sections: {only if existing PRD was revised}

### PRD Path
- PRD.md

### Required Review Points
- [ ] Module boundaries
- [ ] Data model
- [ ] Policy thresholds
- [ ] API endpoint list
- [ ] Error codes
- [ ] Deployment environment

### Next Step
- If revisions are needed: provide revision details.
- If approved: say "Run planning".
```

Important: Do not start Part A before PRD approval.

Update:

```text
docs/PIPELINE-STATUS.md
Status: waiting-for-user-review
Next Action: user approves PRD or requests changes
```

---

# Part A: Planning Stage Auto Execution

## Trigger

```text
"Run planning"
```

Only run after PRD approval.

---

## Part A Pre-Check

1. Confirm `PRD.md` exists.
2. Confirm PRD review is approved in `docs/PIPELINE-STATUS.md` or user message.
3. Confirm `docs/plans/` and `docs/architecture/` paths are available or can be created.

---

## Phase 1: Planning Document Generation

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

- PRD ↔ spec mapping
- spec ↔ PRD API Section 9 mapping
- wireframe ↔ screen list mapping
- policy ↔ PRD policy/error-code mapping
- design-system ↔ wireframe consistency

Auto-fix and revalidate up to 2 times if validation fails.

---

## Phase 2: System Design

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

Auto-fix and revalidate up to 2 times if validation fails.

---

## Part A Completion Report

```markdown
## Planning Stage Complete — Review Requested

### Execution Result
- Phase 1 Planning Documents: ✅
  - specs: {N}
  - policies: {N}
  - wireframes: {N}
- Phase 2 System Design: ✅
  - architecture.md
  - db-design.md
  - api-contract.md

### Generated Outputs
- docs/plans/...
- docs/architecture/...

### Required Review Points
- [ ] Module structure
- [ ] Data model and relationships
- [ ] API endpoints, requests, and responses
- [ ] Authentication and authorization
- [ ] Business policies
- [ ] Wireframe screen structure
- [ ] Design-system tokens

### Next Step
- If revisions are needed: provide revision details.
- If approved: say "Run implementation".
```

Important: Do not start Part B before planning approval.

Update:

```text
docs/PIPELINE-STATUS.md
Status: waiting-for-user-review
Next Action: user approves planning or requests changes
```

---

# Part A Revision Handling

If the user requests changes:

1. Identify affected outputs: PRD, spec, policy, wireframe, design-system, architecture, DB, or API contract.
2. Apply the smallest consistent change.
3. Re-run cross-validation for affected documents.
4. Update `docs/PIPELINE-STATUS.md`.
5. Reissue the Part A review report.

---

# Part B: Implementation Stage Auto Execution

## Trigger

```text
"Run implementation"
```

Only run after Part A approval.

---

## Part B Pre-Check

1. Confirm Part A approval.
2. Confirm planning and architecture outputs exist.
3. Confirm project root is available.
4. Confirm project isolation requirements:
   - separate Git repo
   - separate DB/project instance
   - separate env files
   - isolated deployment settings
5. Check for existing code/config conflicts before writing code.

---

## Phase 3: Initial Project Setup

Run `4. Project Initial Setup.md`.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Also validate DB setup, seed data, dev server, and CI configuration.

---

## Phase 4: Task Creation

Run `5. Task Creation.md`.

Required pre-task outputs:

- traceability matrix
- screen inventory
- BE-FE CRUD correspondence table
- dependency graph

Validation:

- no blank feature/API/task mappings
- all screens mapped to FE/FS tasks
- all CRUD APIs have management UI or explicit exclusion

---

## Phase 5: Development Execution

Run `6. Development Execution.md`.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Also verify API behavior, policy implementation, unit-test existence, and visual verification gate.

---

## Phase 6: Testing

Run `7. Testing.md`.

Validation:

- integration tests pass
- E2E tests pass
- layout assertions pass
- security checks pass
- optional performance tests pass or are skipped with reason

---

## Phase 7: Deployment Preparation

Run `8. Deployment Preparation.md`.

Validation:

- environment variables complete
- migration plan complete
- rollback plan complete
- health check verified
- monitoring plan complete
- deployment runbook created

---

## Part B Completion Report

```markdown
## Implementation Stage Complete

### Execution Result
- Phase 3 Initial Project Setup: ✅
- Phase 4 Task Creation: ✅
- Phase 5 Development Execution: ✅
- Phase 6 Testing: ✅
- Phase 7 Deployment Preparation: ✅

### Validation Summary
- typecheck: passed / failed
- lint: passed / failed
- tests: passed / failed
- build: passed / failed
- E2E: passed / failed
- security: passed / failed

### Generated Outputs
- source code
- tests
- screenshots
- deployment docs
- logs

### Manual Checks Recommended
- review production environment variables
- review DB migration execution window
- review deployment target settings
- perform final code review
```

---

## Failure Handling Rules

| Situation | Response |
|---|---|
| PRD validation fails | auto-fix → revalidate up to 2 times |
| document validation fails | auto-fix → revalidate up to 2 times |
| build/test fails | analyze error → fix → rerun up to 3 times |
| same error repeats twice | try a different approach |
| retry limit exceeded | report to user and stop |
| external service fails | replace with mock if safe, log the issue |

---

## Context Management

| Phase | Required Reads |
|---|---|
| Part 0 | requirements or existing PRD, PRD instruction |
| Phase 1 | PRD, planning instruction |
| Phase 2 | PRD, planning outputs, system design instruction |
| Phase 3 | PRD, planning outputs, architecture outputs, setup instruction |
| Phase 4 | PRD, planning outputs, architecture outputs, code patterns, task instruction |
| Phase 5 | PRD, tasks, dependency graph, architecture outputs, planning outputs, development instruction |
| Phase 6 | PRD, architecture outputs, specs, policies, wireframes, testing instruction |
| Phase 7 | PRD Sections 10/13, architecture outputs, deployment instruction |

---

## Status File Rules

Maintain:

```text
docs/PIPELINE-STATUS.md
```

Update it when:

- a Part starts
- a Phase starts
- a Phase completes
- a user review gate is reached
- the pipeline stops
- the pipeline resumes

---

## Stop and Resume

### When Stopped

Record:

```markdown
Stopped at: Phase {N} - {stage}
Reason: {reason}
Last successful output: {file or command}
Next action: {what to do next}
```

### When Resuming

Supported commands:

```text
"Continue execution"
"Run from Phase 5"
"Run implementation again from task FE-AUTH-2"
```

When resuming, read `docs/PIPELINE-STATUS.md` first.
