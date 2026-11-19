Unicode true
Name "Vault uninstall hook check"
OutFile "${CHECK_OUTPUT}"
RequestExecutionLevel user
!include "MUI2.nsh"
!include "LogicLib.nsh"
Var Updated
Var installMode
!define isUpdated '$Updated == "1"'
!include "${__FILEDIR__}/../../desktop/uninstall.nsh"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro customUnWelcomePage
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function un.onInit
  !insertmacro customUnInit
FunctionEnd
Section "Install"
  WriteUninstaller "$TEMP\vault-uninstall-hook-check.exe"
SectionEnd
Section "Uninstall"
  !insertmacro customUnInstall
SectionEnd
