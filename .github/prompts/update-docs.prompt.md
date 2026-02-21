---
agent: 'agent'
name: update-docs
description: Update and improve JSDoc documentation for classes and modules in the codebase, ensuring it adheres to the project's documentation standards.
tools: ['search', 'read', 'edit']
---
Review and update the documentation for the following code:

${selection}

## Documentation Standards

Follow the project's documentation conventions from AGENTS.md:

### File-Level
- Ensure the **standard copyright header** is present at the top of the file
- Add or update the `@module` tag with an accurate description
- Verify the architecture diagram (if any) reflects the current module structure
- Update `@since` version if the module was recently added or significantly changed
- Add `@see` cross-references to related modules

### Class-Level
- Add or update class-level JSDoc describing purpose, responsibilities, and lifecycle
- Document all public and protected members
- Mark private helpers with `@internal`

### Method-Level
- Every exported/public method must have JSDoc with `@param`, `@returns`, `@example`
- Add `@throws` for methods that throw errors
- Document side effects and async behavior
- Include realistic, runnable `@example` blocks

### Interface/Type-Level
- All exported interfaces and types must have doc comments
- Each property should have a brief inline doc comment

## Checklist

- [ ] Copyright header present
- [ ] `@module` tag with accurate description
- [ ] All exports documented with JSDoc
- [ ] `@param` and `@returns` on every function/method
- [ ] `@example` on all public functions with realistic usage
- [ ] `@throws` documented where applicable
- [ ] `@internal` on private helpers
- [ ] `@see` cross-references to related modules
- [ ] Complex logic has inline comments explaining "why"
- [ ] Architecture diagram (if present) matches current structure
- [ ] No stale references to removed methods or renamed modules

Match the documentation style used across the existing codebase.
