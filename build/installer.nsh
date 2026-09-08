; Dami installer branding for electron-builder / NSIS.
; High-contrast light wizard so text and controls never look faded.

!macro customHeader
  !define MUI_BGCOLOR "FFFFFF"
  !define MUI_TEXTCOLOR "111827"
  !define MUI_FINISHPAGE_LINK_COLOR "155EEF"
  !define MUI_WELCOMEPAGE_TITLE "Install Dami"
  !define MUI_WELCOMEPAGE_TEXT "Your voice-first legal AI companion.$\r$\n$\r$\nDami can live on your desktop, respond to \"Hey Dami\", and help you research legal questions by voice.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "Dami is ready"
  !define MUI_FINISHPAGE_TEXT "Installation is complete.$\r$\n$\r$\nDami will open now and can also start automatically with Windows. Say \"Hey Dami\" whenever you need it."
  !define MUI_FINISHPAGE_RUN_TEXT "Open Dami"
!macroend

!macro customInit
  ; Force Windows controls onto a clean white surface with strong dark text.
  ; This avoids the low-contrast/washed-out appearance seen in the earlier build.
  SetCtlColors $HWNDPARENT 111827 FFFFFF
!macroend
