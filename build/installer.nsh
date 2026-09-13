; Keep the installer intentionally minimal and stable.
; Use electron-builder's default NSIS wizard and only apply a high-contrast surface.

!macro customInit
  ; Ensure an older background companion cannot keep a stale renderer and wake
  ; listener alive while the replacement is installed.
  nsExec::ExecToLog 'taskkill /F /IM "Dami.exe"'
  Pop $0
  SetCtlColors $HWNDPARENT 111827 FFFFFF
!macroend
