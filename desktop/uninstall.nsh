!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!macro customUnInit
  StrCpy $VaultDeleteData ${BST_UNCHECKED}
!macroend

; The welcome hook runs BEFORE removal; customUninstallPage runs after it.
!macro customUnWelcomePage
  Var VaultDeleteData
  Var VaultDeleteCheckbox

  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.VaultDataPage un.VaultDataPageLeave

  Function un.VaultDataPage
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    ${If} ${Silent}
      Abort
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "Your vault data" "Choose whether to keep your vault for a future reinstall."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 32u "By default, uninstalling removes the app but keeps your encrypted vault and settings. Updates always preserve your data."
    Pop $0
    ${NSD_CreateCheckbox} 0 44u 100% 28u "Also permanently delete my vault and settings"
    Pop $VaultDeleteCheckbox
    ${NSD_SetState} $VaultDeleteCheckbox $VaultDeleteData
    ${NSD_CreateLabel} 0 84u 100% 58u "Warning: deleting your vault cannot be undone. Export an encrypted backup before continuing. Backups outside the app's data folders are not deleted. A fresh vault on reinstall will use Mono."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.VaultDataPageLeave
    ${NSD_GetState} $VaultDeleteCheckbox $VaultDeleteData
    ${If} $VaultDeleteData == ${BST_CHECKED}
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Permanently delete all local vault entries and settings for this Windows user? This cannot be undone. Without an exported backup, your passwords will be lost." IDYES vault_delete_confirmed
      StrCpy $VaultDeleteData ${BST_UNCHECKED}
      ${NSD_SetState} $VaultDeleteCheckbox ${BST_UNCHECKED}
      Abort
      vault_delete_confirmed:
    ${EndIf}
  FunctionEnd
!macroend

!macro customUnInstall
  ; Never let a skipped page, silent uninstall, or update opt into deletion.
  ${IfNot} ${isUpdated}
    ${IfNot} ${Silent}
      ${If} $VaultDeleteData == ${BST_CHECKED}
        ; Electron's userData is per-user, even for an all-users installation.
        SetShellVarContext current
        ClearErrors
        RMDir /r "$APPDATA\Vault"
        RMDir /r "$APPDATA\vault-desktop"
        ${If} ${Errors}
          MessageBox MB_OK|MB_ICONEXCLAMATION "Windows could not remove all Vault data. Some files may remain in your AppData folder. Close any other running Vault instances and remove the remaining Vault data before reinstalling if you want a fresh start."
        ${EndIf}
        ${If} $installMode == "all"
          SetShellVarContext all
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
