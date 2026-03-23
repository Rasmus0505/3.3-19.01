!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!define DESKTOP_INSTALL_STATE_FILE_NAME "desktop-install-state.json"

!ifndef BUILD_UNINSTALLER
Var BottleModelPreinstallCheckbox
Var BottleModelPreinstallState
!macro customInit
  StrCpy $BottleModelPreinstallState ${BST_CHECKED}
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
  Page custom BottleModelPageCreate BottleModelPageLeave
!macroend

Function BottleModelPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 22u "Optional local resources"
  Pop $1
  ${NSD_CreateLabel} 0 22u 100% 34u "Bottle always opens the existing cloud login page after install. You can optionally mark the bundled Bottle 1.0 local model as preinstalled now, or skip it and prepare it later from the desktop client."
  Pop $2

  ${NSD_CreateCheckbox} 0 66u 100% 12u "Preinstall Bottle 1.0 local model bundle (recommended)"
  Pop $BottleModelPreinstallCheckbox
  ${NSD_SetState} $BottleModelPreinstallCheckbox $BottleModelPreinstallState

  nsDialogs::Show
FunctionEnd

Function BottleModelPageLeave
  ${NSD_GetState} $BottleModelPreinstallCheckbox $BottleModelPreinstallState
FunctionEnd

!macro customInstall
  ClearErrors
  FileOpen $0 "$INSTDIR\resources\${DESKTOP_INSTALL_STATE_FILE_NAME}" w
  ${IfNot} ${Errors}
    ${If} $BottleModelPreinstallState == ${BST_CHECKED}
      FileWrite $0 "{$\"schemaVersion$\":1,$\"bottle1Preinstalled$\":true,$\"bottle1InstallChoice$\":$\"preinstalled$\"}"
      DetailPrint "Bottle 1.0 marked as preinstalled"
    ${Else}
      FileWrite $0 "{$\"schemaVersion$\":1,$\"bottle1Preinstalled$\":false,$\"bottle1InstallChoice$\":$\"opted_out$\"}"
      DetailPrint "Bottle 1.0 preinstall was skipped"
    ${EndIf}
    FileWrite $0 "$\r$\n"
    FileClose $0
  ${EndIf}
!macroend
!endif
