!ifndef BUILD_UNINSTALLER
!include "LogicLib.nsh"
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "x64.nsh"

!define OVERWOLF_INSTALLER_URL "https://download.overwolf.com/install/Download?utm_content=new-light&utm_source=web_app_store"
!define OVERWOLF_FALLBACK_URL "https://www.overwolf.com/appstore"

Var OverwolfOptIn
Var OverwolfPlatformDetected
Var OverwolfCheckbox
Var OverwolfInstallerPath

LangString OverwolfPageTitle 1033 "Optional Overwolf platform"
LangString OverwolfPageTitle 1049 "Платформа Overwolf — по желанию"
LangString OverwolfPageSubtitle 1033 "Counterpick installs normally with or without Overwolf"
LangString OverwolfPageSubtitle 1049 "Counterpick установится независимо от вашего выбора"
LangString OverwolfDetected 1033 "Overwolf is already installed. Counterpick will not change it."
LangString OverwolfDetected 1049 "Overwolf уже установлен. Counterpick не будет его изменять."
LangString OverwolfMissing 1033 "Overwolf was not detected on this computer."
LangString OverwolfMissing 1049 "Overwolf не найден на этом компьютере."
LangString OverwolfConsent 1033 "Download and launch the official Overwolf installer after Counterpick"
LangString OverwolfConsent 1049 "Скачать и запустить официальный установщик Overwolf после Counterpick"
LangString OverwolfTerms 1033 "This is a separate third-party installation. Counterpick downloads only from Overwolf's official HTTPS service, verifies the Windows digital signature, and starts the installer without silent options. Overwolf will show its own terms and consent screens."
LangString OverwolfTerms 1049 "Это отдельная установка сторонней платформы. Counterpick скачивает файл только с официального HTTPS-сервиса Overwolf, проверяет цифровую подпись Windows и запускает установщик без скрытых параметров. Overwolf покажет собственные условия и экраны согласия."
LangString OverwolfCompanionUnavailable 1033 "Counterpick Live is not published in the Overwolf Appstore yet. Installing the platform now does not install the companion or enable Live mode."
LangString OverwolfCompanionUnavailable 1049 "Counterpick Live пока не опубликован в Overwolf Appstore. Установка платформы сейчас не установит companion и не включит Live-режим."
LangString OverwolfDownloadStatus 1033 "Downloading the official Overwolf installer..."
LangString OverwolfDownloadStatus 1049 "Скачиваем официальный установщик Overwolf..."
LangString OverwolfVerifyStatus 1033 "Verifying the Overwolf installer signature..."
LangString OverwolfVerifyStatus 1049 "Проверяем подпись установщика Overwolf..."
LangString OverwolfLaunchStatus 1033 "Starting the official Overwolf installer..."
LangString OverwolfLaunchStatus 1049 "Запускаем официальный установщик Overwolf..."
LangString OverwolfFallbackPrompt 1033 "Counterpick was installed, but the Overwolf installer could not be downloaded or verified and was not launched. Open the official Overwolf Appstore in your browser instead?"
LangString OverwolfFallbackPrompt 1049 "Counterpick установлен, но установщик Overwolf не удалось скачать или проверить, поэтому он не был запущен. Открыть официальный Overwolf Appstore в браузере?"

Function DetectOverwolfPlatform
  StrCpy $OverwolfPlatformDetected "0"
  IfFileExists "$PROGRAMFILES32\Overwolf\OverwolfLauncher.exe" overwolf_platform_found
  IfFileExists "$PROGRAMFILES32\Overwolf\Overwolf.exe" overwolf_platform_found
  IfFileExists "$PROGRAMFILES64\Overwolf\OverwolfLauncher.exe" overwolf_platform_found
  IfFileExists "$PROGRAMFILES64\Overwolf\Overwolf.exe" overwolf_platform_found
  IfFileExists "$LOCALAPPDATA\Overwolf\OverwolfLauncher.exe" overwolf_platform_found
  IfFileExists "$LOCALAPPDATA\Overwolf\Overwolf.exe" overwolf_platform_found

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Overwolf" "InstallLocation"
  IfFileExists "$0\OverwolfLauncher.exe" overwolf_platform_found
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Overwolf" "InstallLocation"
  IfFileExists "$0\OverwolfLauncher.exe" overwolf_platform_found
  Goto overwolf_platform_done

  overwolf_platform_found:
    StrCpy $OverwolfPlatformDetected "1"

  overwolf_platform_done:
FunctionEnd

Function OverwolfPageCreate
  ${If} ${Silent}
    Abort
  ${EndIf}
  IfFileExists "$INSTDIR\${PRODUCT_FILENAME}.exe" overwolf_page_skip overwolf_page_continue

  overwolf_page_skip:
    Abort

  overwolf_page_continue:

  Call DetectOverwolfPlatform
  !insertmacro MUI_HEADER_TEXT "$(OverwolfPageTitle)" "$(OverwolfPageSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${If} $OverwolfPlatformDetected == "1"
    ${NSD_CreateLabel} 0u 0u 100% 24u "$(OverwolfDetected)"
    Pop $0
    ${NSD_CreateLabel} 0u 38u 100% 52u "$(OverwolfTerms)"
    Pop $0
    ${NSD_CreateLabel} 0u 104u 100% 42u "$(OverwolfCompanionUnavailable)"
    Pop $0
    StrCpy $OverwolfCheckbox ""
  ${Else}
    ${NSD_CreateLabel} 0u 0u 100% 20u "$(OverwolfMissing)"
    Pop $0
    ${NSD_CreateCheckbox} 0u 30u 100% 28u "$(OverwolfConsent)"
    Pop $OverwolfCheckbox
    ${NSD_SetState} $OverwolfCheckbox ${BST_UNCHECKED}
    ${NSD_CreateLabel} 0u 68u 100% 50u "$(OverwolfTerms)"
    Pop $0
    ${NSD_CreateLabel} 0u 126u 100% 34u "$(OverwolfCompanionUnavailable)"
    Pop $0
    System::Call 'User32::SetFocus(p $OverwolfCheckbox) p.r0'
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function OverwolfPageLeave
  StrCpy $OverwolfOptIn "0"
  ${If} $OverwolfCheckbox != ""
    ${NSD_GetState} $OverwolfCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $OverwolfOptIn "1"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function OfferOfficialOverwolfFallback
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "$(OverwolfFallbackPrompt)" IDYES overwolf_open_official_page IDNO overwolf_fallback_done
  overwolf_open_official_page:
    ExecShell "open" "${OVERWOLF_FALLBACK_URL}"
  overwolf_fallback_done:
FunctionEnd

Function InstallOverwolfPlatform
  StrCpy $0 "${OVERWOLF_INSTALLER_URL}"
  StrCmp $0 "https://download.overwolf.com/install/Download?utm_content=new-light&utm_source=web_app_store" overwolf_url_allowed
  Call OfferOfficialOverwolfFallback
  Return

  overwolf_url_allowed:
  CreateDirectory "$TEMP\Counterpick"
  System::Call 'Kernel32::GetTempFileNameW(w "$TEMP\Counterpick", w "OWI", i 0, w .r1) i.r2'
  ${If} $2 == 0
    Call OfferOfficialOverwolfFallback
    Return
  ${EndIf}
  StrCpy $OverwolfInstallerPath "$1.exe"
  Delete "$1"
  Delete "$OverwolfInstallerPath"
  System::Call 'Kernel32::SetEnvironmentVariableW(w "COUNTERPICK_OVERWOLF_INSTALLER", w "$OverwolfInstallerPath") i.r2'
  ${If} $2 == 0
    Call OfferOfficialOverwolfFallback
    Return
  ${EndIf}
  SetOutPath "$PLUGINSDIR"
  File "/oname=download-overwolf.ps1" "${PROJECT_DIR}\installer\download-overwolf.ps1"
  SetOutPath "$INSTDIR"
  SetDetailsPrint both
  DetailPrint "$(OverwolfDownloadStatus)"
  nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File "$PLUGINSDIR\download-overwolf.ps1"`
  Pop $0
  Pop $3
  Delete "$PLUGINSDIR\download-overwolf.ps1"

  ${If} $0 != 0
    SetDetailsPrint none
    System::Call 'Kernel32::SetEnvironmentVariableW(w "COUNTERPICK_OVERWOLF_INSTALLER", w "") i.r3'
    Delete "$OverwolfInstallerPath"
    Call OfferOfficialOverwolfFallback
    Return
  ${EndIf}

  ClearErrors
  FileOpen $2 "$OverwolfInstallerPath" r
  IfErrors overwolf_download_invalid
  FileSeek $2 0 END $1
  FileClose $2
  IfErrors overwolf_download_invalid
  IntCmp $1 65536 overwolf_download_invalid overwolf_download_minimum_ok overwolf_download_minimum_ok

  overwolf_download_minimum_ok:
    IntCmp $1 67108864 overwolf_download_size_ok overwolf_download_size_ok overwolf_download_invalid

  overwolf_download_invalid:
    SetDetailsPrint none
    Delete "$OverwolfInstallerPath"
    Call OfferOfficialOverwolfFallback
    Return

  overwolf_download_size_ok:
    DetailPrint "$(OverwolfVerifyStatus)"
    nsExec::ExecToStack `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -Command "$$signature = Get-AuthenticodeSignature -LiteralPath $$env:COUNTERPICK_OVERWOLF_INSTALLER; $$signer = if ($$signature.SignerCertificate) { $$signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $$false) } else { '' }; if (($$signature.Status -eq 'Valid') -and (@('Overwolf Ltd','Overwolf Ltd.','Overwolf Limited') -contains $$signer)) { exit 0 }; exit 1"`
    Pop $2
    Pop $3
    ${If} $2 != 0
      SetDetailsPrint none
      System::Call 'Kernel32::SetEnvironmentVariableW(w "COUNTERPICK_OVERWOLF_INSTALLER", w "") i.r3'
      Delete "$OverwolfInstallerPath"
      Call OfferOfficialOverwolfFallback
      Return
    ${EndIf}

    DetailPrint "$(OverwolfLaunchStatus)"
    ClearErrors
    ExecShell "open" "$OverwolfInstallerPath"
    ${If} ${Errors}
      SetDetailsPrint none
      System::Call 'Kernel32::SetEnvironmentVariableW(w "COUNTERPICK_OVERWOLF_INSTALLER", w "") i.r3'
      Delete "$OverwolfInstallerPath"
      Call OfferOfficialOverwolfFallback
      Return
    ${EndIf}
    Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -Command "for ($$attempt = 0; $$attempt -lt 360; $$attempt++) { Start-Sleep -Seconds 5; try { Remove-Item -LiteralPath $$env:COUNTERPICK_OVERWOLF_INSTALLER -Force -ErrorAction Stop; exit 0 } catch {} }; exit 1"`
    System::Call 'Kernel32::SetEnvironmentVariableW(w "COUNTERPICK_OVERWOLF_INSTALLER", w "") i.r3'
    SetDetailsPrint none
FunctionEnd

!macro customInit
  StrCpy $OverwolfOptIn "0"
  StrCpy $OverwolfCheckbox ""
!macroend

!macro customPageAfterChangeDir
  Page custom OverwolfPageCreate OverwolfPageLeave
!macroend

!macro customInstall
  ${IfNot} ${Silent}
  ${AndIf} $OverwolfOptIn == "1"
    Call InstallOverwolfPlatform
  ${EndIf}
!macroend
!endif
