# Electron Builder Action

THIS IS A FORK! 👉 Credits to [@samuelmeuli](https://github.com/samuelmeuli)

[![Test](https://github.com/heliomarpm/action-electron-builder/actions/workflows/test.yml/badge.svg)](https://github.com/heliomarpm/action-electron-builder/actions/workflows/test.yml)

**GitHub Action for building and releasing Electron apps**

This is a GitHub Action for automatically building and releasing your Electron app using GitHub's CI/CD capabilities. It uses [`electron-builder`](https://github.com/electron-userland/electron-builder) to package your app and release it to a platform like GitHub Releases.

GitHub Actions allows you to build your app on macOS, Windows and Linux without needing direct access to each of these operating systems.

## Setup

1. **Install and configure `electron-builder`** (v24+) in your Electron app. You can read about this in [the project's docs](https://www.electron.build) or in [samuelmeuli's blog post](https://samuelmeuli.com/blog/2019-04-07-packaging-and-publishing-an-electron-app).

2. If you need to compile code (e.g. TypeScript to JavaScript or Sass to CSS), make sure this is done using a **`build` script in your `package.json` file**. The action will execute that script before packaging your app. However, **make sure that the `build` script does _not_ run `electron-builder`**, as this action will do that for you.

3. **Add a workflow file** to your project (e.g. `.github/workflows/build.yml`):

   ```yml
   name: Build/release

   on: push

   jobs:
     release:
       runs-on: ${{ matrix.os }}
       permissions:
         contents: write

       strategy:
         matrix:
           os: [macos-latest, ubuntu-latest, windows-latest]

       steps:
         - name: Check out Git repository
           uses: actions/checkout@v4

         - name: Install Node.js, NPM and Yarn
           uses: actions/setup-node@v4
           with:
             node-version: 20

         - name: Build/release Electron app
           uses: heliomarpm/action-electron-builder@v2.1
           with:
             # GitHub token, automatically provided to the action
             # (No need to define this secret in the repo settings)
             github_token: ${{ secrets.github_token }}

             # If the commit is tagged with a version (e.g. "v1.0.0"),
             # release the app after building
             release: ${{ startsWith(github.ref, 'refs/tags/v') }}
   ```

## Usage

### Building

Using this the workflow above, GitHub will build your app every time you push a commit.

### Releasing

When you want to create a new release, follow these steps:

1. Update the version in your project's `package.json` file (e.g. `1.2.3`)
2. Commit that change (`git commit -am v1.2.3`)
3. Tag your commit (`git tag v1.2.3`). Make sure your tag name's format is `v*.*.*`. Your workflow will use this tag to detect when to create a release
4. Push your changes to GitHub (`git push && git push --tags`)

After building successfully, the action will publish your release artifacts. By default, a new release draft will be created on GitHub with download links for your app. If you want to change this behavior, have a look at the [`electron-builder` docs](https://www.electron.build).

## Configuration

### Options

You can configure the action further with the following options:

- `package_root`: Directory where NPM/Yarn commands should be run (default: `"."`)
- `build_script_name`: Name of the optional NPM build script which is executed before `electron-builder` (default: `"build"`)
- `skip_build`: Whether the action should execute the NPM build script before running `electron-builder` (default: `false`)
- `use_vue_cli`: Whether to run `electron-builder` using the [Vue CLI plugin](https://nklayman.github.io/vue-cli-plugin-electron-builder) instead of calling the command directly (default: `false`)
- `args`: Other arguments to pass to the `electron-builder` command, e.g. configuration overrides (default: `""`)
- `max_attempts`: Maximum number of attempts for completing the build and release step (default: `1`)
- `package_manager`: Package manager to use (`yarn | npm`) (default: checks for correspondiung lockfiles, and if none found, `yarn`)

See [`action.yml`](./action.yml) for a list of all possible input variables.

### Code Signing

If you are building for **macOS**, you'll want your code to be [signed](https://samuelmeuli.com/blog/2019-04-07-packaging-and-publishing-an-electron-app/#code-signing). GitHub Actions therefore needs access to your code signing certificates:

- Open the Keychain Access app or the Apple Developer Portal. Export all certificates related to your app into a _single_ file (e.g. `certs.p12`) and set a strong password
- Base64-encode your certificates using the following command: `base64 -i certs.p12 -o encoded.txt`
- In your project's GitHub repository, go to Settings → Secrets and add the following two variables:
  - `mac_certs`: Your encoded certificates, i.e. the content of the `encoded.txt` file you created before
  - `mac_certs_password`: The password you set when exporting the certificates

Add the following options to your workflow's existing `action-electron-builder` step:

```yml
- name: Build/release Electron app
  uses: heliomarpm/action-electron-builder@v2.1
  with:
    # ...
    mac_certs: ${{ secrets.mac_certs }}
    mac_certs_password: ${{ secrets.mac_certs_password }}
```

The same goes for **Windows** code signing (`windows_certs` and `windows_certs_password` secrets).

### Snapcraft

If you are building/releasing your Linux app for Snapcraft (which is `electron-builder`'s default), you will additionally need to install and sign in to Snapcraft. This can be done using an `action-snapcraft` step before the `action-electron-builder` step:

```yml
- name: Install Snapcraft
  uses: samuelmeuli/action-snapcraft@v1
  # Only install Snapcraft on Ubuntu
  if: startsWith(matrix.os, 'ubuntu')
  with:
    # Log in to Snap Store
    snapcraft_token: ${{ secrets.snapcraft_token }}
```

You can read [here](https://github.com/samuelmeuli/action-snapcraft) how you can obtain a `snapcraft_token`.

### Notarization

If you've configured `electron-builder` to notarize your Electron Mac app [as described in this guide](https://samuelmeuli.com/blog/2019-12-28-notarizing-your-electron-app), you can use the following steps to let GitHub Actions perform the notarization for you:

1.  Define the following secrets in your repository's settings on GitHub:

    - `api_key`: Content of the API key file (with the `p8` file extension)
    - `api_key_id`: Key ID found on App Store Connect
    - `api_key_issuer_id`: Issuer ID found on App Store Connect

    or

    - `apple_id`: Apple ID
    - `apple_id_password`: App-specifc password for the Apple ID

2.  In your workflow file, add the following step before your `action-electron-builder` step:

    ```yml
    - name: Prepare for app notarization
      if: startsWith(matrix.os, 'macos')
      # Import Apple API key for app notarization on macOS
      run: |
        mkdir -p ~/private_keys/
        echo '${{ secrets.api_key }}' > ~/private_keys/AuthKey_${{ secrets.api_key_id }}.p8
    ```

3.  Pass the following environment variables to `action-electron-builder`:

    ```yml
    - name: Build/release Electron app
      uses: heliomarpm/action-electron-builder@v2.1
      with:
        # ...
      env:
        # macOS notarization API key
        API_KEY_ID: ${{ secrets.api_key_id }}
        API_KEY_ISSUER_ID: ${{ secrets.api_key_issuer_id }}
        # or, if using app-specific password:
        APPLE_ID: ${{ secrets.APPLE_ID }}
        APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
    ```

## Example

For an example of the action used in production (including app notarization and publishing to Snapcraft), see:

- [Udeler](https://github.com/heliomarpm/udemy-downloader-gui)
- [Electron Quick Start Vanilla](https://github.com/heliomarpm/electron-quick-start)
- [Electron Quick Start Vue 3 with Vite](https://github.com/heliomarpm/electron-vuevite-quick-start).
- [Mini Diary](https://github.com/samuelmeuli/mini-diary)

## Development

Suggestions and contributions are always welcome! Please discuss larger changes via issue before submitting a pull request.

## Related

- [Original Builder Action](https://github.com/samuelmeuli/action-electron-builder) – original GitHub Action from which this is forked
- [Snapcraft Action](https://github.com/samuelmeuli/action-snapcraft) – GitHub Action for setting up Snapcraft
- [Lint Action](https://github.com/samuelmeuli/lint-action) – GitHub Action for detecting and fixing linting errors
- [Maven Publish Action](https://github.com/samuelmeuli/action-maven-publish) – GitHub Action for automatically publishing Maven packages

## Credit

Credit to [Samuel Meuli](@samuelmeuli) for starting this [project](https://github.com/samuelmeuli/action-electron-builder)
