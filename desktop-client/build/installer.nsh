!include "MUI2.nsh"

Var BottleModelCheckbox
Var BottleModelPreinstall
Var BottleModelPreinstallJson
Var BottleModelInstallChoice

Function BottleModelPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateCheckbox} 0 0 100% 12u "Preinstall Bottle 1.0 local model bundle (recommended)"
  Pop $BottleModelCheckbox
  ${NSD_Check} $BottleModelCheckbox
  nsDialogs::Show
FunctionEnd

Function BottleModelPageLeave
  ${NSD_GetState} $BottleModelCheckbox $BottleModelPreinstall
  StrCpy $BottleModelPreinstallJson "false"
  StrCpy $BottleModelInstallChoice "opted_out"
  StrCmp $BottleModelPreinstall ${BST_CHECKED} 0 bottle_model_leave_done
  StrCpy $BottleModelPreinstallJson "true"
  StrCpy $BottleModelInstallChoice "preinstalled"
  bottle_model_leave_done:
FunctionEnd

Page custom BottleModelPageCreate BottleModelPageLeave

Section
  FileOpen $0 "$INSTDIR\\resources\\desktop-install-state.json" w
  FileWrite $0 '{"schemaVersion":1,"bottle1Preinstalled":$BottleModelPreinstallJson,"bottle1InstallChoice":"$BottleModelInstallChoice"}'
  FileClose $0
SectionEnd
