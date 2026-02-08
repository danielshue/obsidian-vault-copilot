---
layout: docs
title: Extension update validation
permalink: /docs/extension-update-validation/
---

# Extension Update Validation

## Overview

The Obsidian Vault Copilot extension catalog enforces update permissions to ensure that only the original submitter of an extension can submit updates to that extension. This prevents unauthorized modifications and maintains the integrity of the extension ecosystem.

## How It Works

### Submitter Tracking

Each extension manifest includes a `submittedBy` field that records the GitHub username of the person who originally submitted the extension (or last updated it).

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "submittedBy": "github-username",
  ...
}
```

### Validation Process

When a pull request is submitted that modifies an extension:

1. The GitHub Actions workflow extracts the PR author's GitHub username
2. The validation script (`scripts/validate-extension.cjs`) checks if the PR author matches the `submittedBy` field in the extension's manifest
3. If they match, validation passes and the update can be merged
4. If they don't match, validation fails with an error message indicating that only the original submitter can update the extension

### For New Extensions

- The `submittedBy` field should be set to your GitHub username when creating a new extension
- The catalog build process will preserve this field when building the catalog
- This field will be used for all future update validations

### For Existing Extensions

- Extensions without a `submittedBy` field can be updated by anyone until the field is added
- Once the field is added to an extension's manifest, only that user can submit future updates

## Implementation Details

### Schema Changes

The manifest schema (`schema/manifest.schema.json`) now includes:

```json
{
  "submittedBy": {
    "type": "string",
    "description": "GitHub username of the person who submitted or last updated this extension. Used for update validation to ensure only the original submitter can update the extension.",
    "examples": ["danielshue", "janedeveloper", "github-username"]
  }
}
```

### Validation Script

The validation script checks the `submittedBy` field against the PR author:

```javascript
function validateSubmitter(extensionId, prAuthor, manifest) {
  const issues = [];

  // Skip validation if no PR author provided (local validation)
  if (!prAuthor) {
    return issues;
  }

  // For new extensions, record the submitter
  if (!manifest.submittedBy) {
    return issues;
  }

  // For updates, check if the PR author matches
  const previousSubmitter = manifest.submittedBy;
  
  if (previousSubmitter !== prAuthor) {
    issues.push({
      severity: 'error',
      message: `Update rejected: Only the original submitter (${previousSubmitter}) can update this extension. Current PR author: ${prAuthor}`,
      code: 'UNAUTHORIZED_UPDATE',
      file: 'manifest.json'
    });
  }

  return issues;
}
```

### GitHub Workflow Integration

The GitHub Actions workflow passes the PR author to the validation script:

```yaml
- name: Validate extensions (GitHub mode)
  id: validate
  run: node scripts/validate-extension.cjs --pr
  continue-on-error: true
  env:
    PR_AUTHOR: ${{ github.event.pull_request.user.login }}
```

## Updating Your Extension

### As the Original Submitter

If you are the original submitter:

1. Update your extension files as needed
2. Update the version number in `manifest.json`
3. Ensure the `submittedBy` field still contains your GitHub username
4. Submit a pull request
5. The validation will pass automatically

### As a Different User

If you are not the original submitter:

- You cannot submit updates to someone else's extension
- To suggest changes, you can:
  - Open an issue on the repository with your suggested changes
  - Fork the extension and create a new extension with a different ID
  - Contact the original submitter to collaborate

## Exceptions and Edge Cases

### Repository Maintainers

Repository maintainers (organization members with write access) can override the validation by:
- Manually merging pull requests after review
- Using the "safe-to-test" label for external contributions

### Transferring Ownership

To transfer ownership of an extension:

1. The original submitter updates the `submittedBy` field to the new owner's GitHub username
2. Submit a pull request with this change
3. After merging, the new owner can submit future updates

### Lost Access

If the original submitter no longer has access to their GitHub account:
- Contact repository maintainers
- Provide proof of authorship or ownership
- Maintainers can manually update the `submittedBy` field

## Best Practices

1. **Always include `submittedBy` in new extensions** - Set it to your GitHub username when creating a manifest
2. **Keep your GitHub account secure** - Use two-factor authentication to prevent unauthorized access
3. **Document major changes** - Use the `versions` field in the manifest to track changes
4. **Test locally first** - Run the validation script locally before submitting a PR:
   ```bash
   PR_AUTHOR=your-username node scripts/validate-extension.cjs path/to/extension
   ```

## Troubleshooting

### Error: "Update rejected: Only the original submitter can update this extension"

**Cause**: The PR author doesn't match the `submittedBy` field in the manifest.

**Solution**:
- Verify you're submitting from the correct GitHub account
- If you're the original submitter but using a different account, contact maintainers
- If you want to suggest changes, open an issue instead

### Error: "No manifest.json found"

**Cause**: The extension directory doesn't contain a manifest file.

**Solution**: Ensure your extension has a valid `manifest.json` file.

### Warning: "No submittedBy field in manifest"

**Cause**: The extension manifest doesn't have a `submittedBy` field (legacy extension).

**Solution**: Add the `submittedBy` field to your manifest:
```json
{
  ...
  "submittedBy": "your-github-username"
}
```

## See Also

- [Extension Submission Guide](../extensions/README.md)
- [Manifest Schema](../schema/manifest.schema.json)
- [Contributing Guidelines](../CONTRIBUTING.md)
