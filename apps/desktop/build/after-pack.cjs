// electron-builder afterPack hook: checks that the speech detector was packaged, then flips Electron
// fuses on the packaged binary (Architecture §6).
const { existsSync } = require('node:fs')
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

/**
 * The model is fetched before packaging, not committed. Without it the app would silently fall back to
 * loudness-only auto-stop, so a build that lacks it fails.
 */
function assertSpeechDetector(resourcesDir) {
  const model = path.join(resourcesDir, 'vad', 'silero_vad_16k_op15.onnx')
  if (!existsSync(model))
    throw new Error(`speech detector missing from the app (${model}): run \`bun run vad\` first`)
}
exports.assertSpeechDetector = assertSpeechDetector

exports.default = async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context
  assertSpeechDetector(packager.getResourcesDir(appOutDir))
  const name = packager.appInfo.productFilename
  const binary =
    electronPlatformName === 'darwin'
      ? path.join(appOutDir, `${name}.app`)
      : electronPlatformName === 'win32'
        ? path.join(appOutDir, `${name}.exe`)
        : path.join(appOutDir, packager.executableName)
  await flipFuses(binary, exports.fuses)
}
