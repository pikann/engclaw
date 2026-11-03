// electron-builder afterPack hook: flips Electron fuses on the packaged binary (Architecture §6).
const path = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

/** Keep in sync with tests/security.test.ts, which asserts these values. */
exports.fuses = {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
}

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context
  const name = packager.appInfo.productFilename
  const binary =
    electronPlatformName === 'darwin'
      ? path.join(appOutDir, `${name}.app`)
      : electronPlatformName === 'win32'
        ? path.join(appOutDir, `${name}.exe`)
        : path.join(appOutDir, packager.executableName)
  await flipFuses(binary, exports.fuses)
}
