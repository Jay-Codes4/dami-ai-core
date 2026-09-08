; Dami installer branding for electron-builder / NSIS.
; Keep the wizard short: welcome -> install -> finish.

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "Install Dami"
  !define MUI_WELCOMEPAGE_TEXT "Your voice-first legal AI companion.$\r$\n$\r$\nDami can live on your desktop, respond to \"Hey Dami\", and help you research legal questions by voice.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "Dami is ready"
  !define MUI_FINISHPAGE_TEXT "Installation is complete.$\r$\n$\r$\nDami will open now and can also start automatically with Windows. Say \"Hey Dami\" whenever you need it."
  !define MUI_FINISHPAGE_RUN_TEXT "Open Dami"
!macroend
