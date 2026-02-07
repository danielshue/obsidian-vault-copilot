---
layout: default
title: Security
---

# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in an extension or in the catalog infrastructure, please report it responsibly.

### How to Report

1. **DO NOT** open a public issue for security vulnerabilities
2. Contact the repository owner with security concerns
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Affected extension(s)
   - Potential impact

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Resolution:** Depends on severity

---

## Extension Review Process

All extensions undergo security review before being merged:

### Automated Checks

- ✅ No hardcoded credentials or API keys
- ✅ No `eval()`, `Function()`, or dynamic code execution
- ✅ No suspicious network requests
- ✅ No obfuscated code
- ✅ Manifest schema validation

### Manual Review

- ✅ Code quality and clarity
- ✅ Appropriate permissions requested
- ✅ External dependencies justified
- ✅ Documentation accuracy

---

## Content Policies

### Prohibited

- Malware or malicious code
- Cryptocurrency miners
- Data harvesting
- Spam or advertising
- Illegal content
- Harassment tools

### Required Disclosures

Extensions must disclose:
- External API calls
- Data storage locations
- Required permissions
- Third-party dependencies

---

## Handling Malicious Content

If a malicious extension is discovered:

1. **Immediate removal** from catalog
2. **Notification** to affected users (if identifiable)
3. **Author ban** (pending investigation)
4. **Post-mortem** to improve detection

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅ Active |

---

## Contact

- Security issues: Contact the repository owner
- General questions: Use GitHub Discussions
