!include "MUI2.nsh"

Section
  FileOpen $0 "$INSTDIR\\resources\\desktop-install-state.json" w
  FileWrite $0 '{"schemaVersion":1,"bottle1Preinstalled":true,"bottle1InstallChoice":"preinstalled"}'
  FileClose $0
SectionEnd
