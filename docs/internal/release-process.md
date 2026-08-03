# Release Process

Versioning, changelog management, and publishing procedure for **mtc**.

---

## Versioning

MTC follows [Semantic Versioning](https://semver.org/):

| Component | When to Bump |
|-----------|-------------|
| **Major** | Breaking CLI changes, agent API changes, permission model changes |
| **Minor** | New features, new commands, new MCP capabilities, deprecations |
| **Patch** | Bug fixes, security patches, documentation updates |

## Release Cadence

| Type | Frequency | Lead Time |
|------|-----------|-----------|
| Major | As needed | 2 weeks notice |
| Minor | Every 2 weeks | 1 week notice |
| Patch | As needed | 24h |
| Hotfix | Emergency | Hours |

## Release Process

### 1. Preparation (3 days before release)

```bash
# Create release branch
git checkout -b release/v<version>

# Update version in package.json
# Update CHANGELOG.md with new entries
```

### 2. Staging (2 days before release)

Merge to `develop` and validate internally:

```bash
git checkout develop
git merge release/v<version>
git push origin develop
```

Notify #mtc-users for testing.

### 3. Release Day

```bash
# Tag the release
git checkout main
git merge release/v<version>
git tag v<version>
git push origin main --tags

# Build binaries
bun run build
```

### 4. Post-Release

- Publish release notes to GitHub Releases
- Update internal documentation portal
- Notify #mtc-announce

## Changelog Format

```
## [x.y.z] - YYYY-MM-DD

### Added
- New features

### Changed
- Behavior changes (non-breaking)

### Fixed
- Bug fixes

### Deprecated
- Features scheduled for removal

### Removed
- Features removed in this version

### Security
- Security fixes
```

## Hotfix Process

For P0/P1 issues:

1. Branch from `main`: `git checkout -b hotfix/<description>`
2. Fix, test, and merge directly to `main`
3. Tag and release immediately
4. Backport to `develop` branch
5. Post-mortem within 24h

## Binary Distribution

Compiled binaries are attached to GitHub Releases:

- Linux (x86_64)
- macOS (arm64, x86_64)
- Windows (x86_64)

Build command: `bun run build`

## Deprecation Policy

Breaking changes require:
1. Deprecation notice in the changelog one minor version before removal
2. Runtime warning when deprecated feature is used
3. Migration guide in release notes
