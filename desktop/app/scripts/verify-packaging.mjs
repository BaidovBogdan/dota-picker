import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verifyDist = process.argv.includes('--dist');
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

async function readText(path) {
  return (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
}

async function fileSize(path) {
  return (await stat(path)).size;
}

async function directorySize(path) {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    total += entry.isDirectory() ? await directorySize(entryPath) : await fileSize(entryPath);
  }
  return total;
}

const packageJson = JSON.parse(await readText(join(appDirectory, 'package.json')));
const packageLock = JSON.parse(await readText(join(appDirectory, 'package-lock.json')));
const builderConfig = await readText(join(appDirectory, 'electron-builder.yml'));
const installerScript = await readText(join(appDirectory, 'installer', 'installer.nsh'));
const downloadScript = await readText(join(appDirectory, 'installer', 'download-overwolf.ps1'));
const officialInstallerUrl = 'https://download.overwolf.com/install/Download?utm_content=new-light&utm_source=web_app_store';
const officialFallbackUrl = 'https://www.overwolf.com/appstore';

expect(packageJson.version === packageLock.version, 'package.json and package-lock.json versions differ');
expect(packageJson.version === packageLock.packages?.['']?.version, 'root lockfile package version differs');
expect(
  builderConfig.includes('electronLanguages:\n  - en-US\n  - ru\n'),
  'electronLanguages must contain only en-US and ru',
);
expect(
  builderConfig.includes('installerLanguages:\n    - en_US\n    - ru_RU\n'),
  'NSIS installer languages must contain English and Russian',
);
expect(builderConfig.includes('provider: github'), 'desktop update provider must be GitHub');
expect(builderConfig.includes('owner: BaidovBogdan'), 'desktop update owner changed');
expect(builderConfig.includes('repo: dota-picker'), 'desktop updates must use the unified dota-picker repository');
expect(!builderConfig.includes('counterpick-releases'), 'legacy release repository must not remain in the desktop package');
expect(builderConfig.includes('include: installer/installer.nsh'), 'custom NSIS include is not configured');
expect(installerScript.includes(`!define OVERWOLF_INSTALLER_URL "${officialInstallerUrl}"`), 'official Overwolf installer URL changed');
expect(installerScript.includes(`!define OVERWOLF_FALLBACK_URL "${officialFallbackUrl}"`), 'official Overwolf fallback URL changed');

const externalUrls = [...installerScript.matchAll(/https:\/\/[^\s"']+/g)].map((match) => match[0]);
expect(
  externalUrls.every((url) => url === officialInstallerUrl || url === officialFallbackUrl),
  'NSIS contains a non-allowlisted external URL',
);
expect(!installerScript.includes('http://'), 'NSIS must not contain an insecure HTTP URL');
expect(!/setup\.overwolf\.com\/\d/.test(installerScript), 'NSIS must not pin a versioned Overwolf setup URL');
expect(installerScript.includes('${NSD_SetState} $OverwolfCheckbox ${BST_UNCHECKED}'), 'Overwolf consent must default to unchecked');
expect(installerScript.includes('${If} ${Silent}'), 'silent Counterpick installs must skip the Overwolf consent page');
expect(
  installerScript.includes('IfFileExists "$INSTDIR\\${PRODUCT_FILENAME}.exe" overwolf_page_skip overwolf_page_continue'),
  'Counterpick updates must skip the Overwolf consent page',
);
expect(installerScript.includes('Get-AuthenticodeSignature'), 'downloaded Overwolf installer signature is not verified');
expect(installerScript.includes("@('Overwolf Ltd','Overwolf Ltd.','Overwolf Limited')"), 'Overwolf signer allowlist is missing');
expect(installerScript.includes("$$signature.Status -eq 'Valid'"), 'Authenticode status must be Valid');
expect(installerScript.includes('ExecShell "open" "$OverwolfInstallerPath"'), 'official Overwolf installer must launch interactively');
expect(!installerScript.includes('ExecWait'), 'Counterpick installer must not block indefinitely on Overwolf');
expect(!/OverwolfInstaller[^\n]*\/(?:S|silent)\b/i.test(installerScript), 'silent Overwolf launch options are forbidden');
expect(!installerScript.includes('inetc::get'), 'packaging must not rely on an undeclared NSIS download plugin');
expect(installerScript.includes('GetTempFileNameW'), 'Overwolf bootstrapper must use a collision-resistant temp path');
expect(installerScript.includes('IntCmp $1 67108864'), 'Overwolf bootstrapper download needs a 64 MiB upper bound');
expect(installerScript.includes('FileSeek $2 0 END $1'), 'NSIS must re-check the downloaded file size');
expect(!installerScript.includes('OWI*.tmp.exe'), 'NSIS must not delete wildcard temp files');
expect(installerScript.includes('-WindowStyle Hidden'), 'temporary Overwolf bootstrapper cleanup must be hidden');
expect(installerScript.includes('$$attempt -lt 360'), 'temporary Overwolf bootstrapper cleanup must be bounded');
expect(!/[A-Za-z]:\\Users\\|[A-Za-z]:\/Users\//.test(installerScript), 'NSIS contains a local absolute user path');
expect(installerScript.includes('Counterpick Live is not published in the Overwolf Appstore yet.'), 'unpublished companion disclosure is missing');
expect(installerScript.includes('Counterpick Live пока не опубликован в Overwolf Appstore.'), 'Russian unpublished companion disclosure is missing');
expect(downloadScript.includes(`$sourceUri = [Uri]'${officialInstallerUrl}'`), 'download helper official URL changed');
expect(downloadScript.includes("$allowedHost = 'download.overwolf.com'"), 'download helper host allowlist changed');
expect(downloadScript.includes("$currentUri.Scheme -ne 'https'"), 'download helper does not enforce HTTPS');
expect(downloadScript.includes('$handler.AllowAutoRedirect = $false'), 'download helper must validate every redirect');
expect(downloadScript.includes('Add-Type -AssemblyName System.Net.Http -ErrorAction Stop'), 'Windows PowerShell 5.1 HTTP assembly loading is missing');
expect(downloadScript.includes('if ($null -ne $client)'), 'download helper cleanup must be null-safe');
expect(downloadScript.includes('$redirect -le 5'), 'download helper redirect count must be bounded');
expect(downloadScript.includes('$client.Timeout = [TimeSpan]::FromMinutes(2)'), 'download helper needs a bounded network timeout');
expect(downloadScript.includes('$maximumBytes = 67108864'), 'download helper needs a 64 MiB stream limit');
expect(downloadScript.includes('$downloadedBytes[0] -ne 0x4D'), 'download helper must validate the PE header');
expect(!/[A-Za-z]:\\Users\\|[A-Za-z]:\/Users\//.test(downloadScript), 'download helper contains a local absolute user path');

let distSummary = null;
if (verifyDist) {
  const releaseDirectory = join(appDirectory, 'release');
  const installerName = `Counterpick-${packageJson.version}-x64.exe`;
  const installerPath = join(releaseDirectory, installerName);
  const blockmapPath = `${installerPath}.blockmap`;
  const latestPath = join(releaseDirectory, 'latest.yml');
  const unpackedDirectory = join(releaseDirectory, 'win-unpacked');
  const localesDirectory = join(unpackedDirectory, 'locales');
  const [installerBytes, blockmapBytes, latest, appUpdate, localeEntries, unpackedBytes] = await Promise.all([
    fileSize(installerPath),
    fileSize(blockmapPath),
    readText(latestPath),
    readText(join(unpackedDirectory, 'resources', 'app-update.yml')),
    readdir(localesDirectory),
    directorySize(unpackedDirectory),
  ]);

  expect(installerBytes > 20 * 1024 * 1024, 'Windows installer is unexpectedly small');
  expect(blockmapBytes > 0, 'Windows installer blockmap is empty');
  expect(latest.includes(`version: ${packageJson.version}`), 'latest.yml version differs from package version');
  expect(latest.includes(`url: ${installerName}`), 'latest.yml installer URL differs from the expected artifact');
  expect(/(?:^|\n)\s*sha512:\s*\S+/.test(latest), 'latest.yml does not contain a SHA-512 checksum');
  expect(appUpdate.includes('provider: github'), 'packaged update provider is not GitHub');
  expect(appUpdate.includes('owner: BaidovBogdan'), 'packaged update owner changed');
  expect(appUpdate.includes('repo: dota-picker'), 'packaged app does not use the unified update repository');
  expect(!appUpdate.includes('counterpick-releases'), 'packaged app still uses the legacy update repository');
  expect(
    localeEntries.toSorted().join(',') === ['en-US.pak', 'ru.pak'].join(','),
    `unexpected Electron locales: ${localeEntries.toSorted().join(', ')}`,
  );
  expect(await fileSize(join(unpackedDirectory, 'Counterpick.exe')) > 0, 'packaged Counterpick executable is missing');
  expect(await fileSize(join(unpackedDirectory, 'resources', 'app.asar')) > 0, 'packaged app.asar is missing');

  distSummary = {
    version: packageJson.version,
    installer: installerName,
    installerBytes,
    installerMiB: Number((installerBytes / 1024 / 1024).toFixed(2)),
    unpackedBytes,
    unpackedMiB: Number((unpackedBytes / 1024 / 1024).toFixed(2)),
    electronLocales: localeEntries.toSorted(),
  };
}

if (failures.length > 0) {
  throw new Error(`Packaging verification failed:\n- ${failures.join('\n- ')}`);
}

console.log(JSON.stringify({
  packaging: 'verified',
  version: packageJson.version,
  overwolfInstallerHost: 'download.overwolf.com',
  consentDefault: 'unchecked',
  ...distSummary,
}, null, 2));
