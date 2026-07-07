# reporting Spec Delta — resolve-semver-ranges

## Changes to: Requirement: Package-Centric Reporting

### Update scenario:
```
#### Scenario: package results are displayed in aligned columns
- **WHEN** the system reports package-level updates or current packages in terminal output
- **THEN** the output may use aligned columns such as package, current version, and latest version to improve readability
```

**Replace with:**
```
#### Scenario: package results are displayed in three aligned columns
- **WHEN** the system reports package-level updates or current packages in terminal output
- **THEN** the output uses aligned columns: Package, Resolved, and Latest
- **AND** the Package column shows the package name, optionally with the original specifier in parentheses when it was a range, selector, or dist-tag
- **AND** the Resolved column shows the concrete resolved version
- **AND** the Latest column shows the npm registry `latest` dist-tag version
```
