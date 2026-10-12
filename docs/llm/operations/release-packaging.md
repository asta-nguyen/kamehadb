# Release Packaging

Verification: [x] Release tag handling and package metadata were checked against the current workflow and packaging configuration.

## Requirements

### OPS-fedor40-rpm

The Linux release SHALL identify its RPM artifact as targeting Fedora 40+.

#### Scenario: Fedora RPM asset

- GIVEN a Linux release build
- WHEN nfpm creates the RPM
- THEN the artifact name includes `fedora40` and its dependencies are `gtk3` and `webkit2gtk4.1`

Evidence: `.github/workflows/release.yml`, `build/linux/nfpm.yaml`

### OPS-stable-msi

The release workflow SHALL create a WiX MSI only for tags without a prerelease suffix.

#### Scenario: prerelease tag

- GIVEN the tag `v0.1.0-rc.1`
- WHEN the release workflow runs
- THEN the release is marked prerelease and the WiX MSI step is skipped

Evidence: `.github/workflows/release.yml`, `build/windows/kamehadb.wxs`

## Flow

1. A `v*` tag push or a manual dispatch resolves the release tag and creates a draft release.
2. The build matrix creates a macOS universal app, Linux amd64 packages, and Windows amd64 binaries.
3. Linux packaging creates `.deb`, Fedora 40+ `.rpm`, and `.AppImage` assets; Windows creates an NSIS installer and creates an MSI only for stable tags.
4. The matrix uploads artifacts, then the publish job attaches them to the draft release.

## State changes

- The release job creates or updates a draft GitHub release and uploads build artifacts.
- Packaging does not access or migrate application user data.

## Side effects

- CI installs build and packaging tools, downloads linuxdeploy components, and writes platform packages to the runner workspace.
- The release jobs upload the generated files to GitHub Actions artifacts and the draft release.

## Authorization & constraints

- The workflow requires `contents: write` to create and update release assets.
- Linux builds select WebKit2GTK 4.1 with the `webkit2_41` build tag.
- The RPM uses Fedora package names for GTK3 and WebKit2GTK 4.1; the artifact name makes that target explicit.
- The AppImage step invokes linuxdeploy's GTK plugin. The workflow does not stage WebKit helper executables separately, and the AppImage is not launched during the workflow; a bundled WebKit subprocess runtime is therefore not established by this pipeline.
- The changelog documents the AppImage's host WebKit2GTK 4.1 requirement.

## Error paths

- A failed build or packaging command stops the matrix job before upload.
- Artifact upload fails when no matching package file is found.
- A publish job failure leaves the draft release without all intended assets.

## Tests

The release workflow checks for package files during upload but does not launch the generated AppImage or installers.

## Related

- [Architecture overview](../architecture/overview.md)

## Sources

- `.github/workflows/release.yml`
- `build/linux/nfpm.yaml`
- `build/windows/kamehadb.wxs`
- `CHANGELOG.md`
