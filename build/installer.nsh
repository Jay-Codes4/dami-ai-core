; Keep the installer intentionally minimal and stable.
; Use electron-builder's default NSIS wizard and only apply a high-contrast surface.

!macro customInit
  SetCtlColors $HWNDPARENT 111827 FFFFFF
!macroend
