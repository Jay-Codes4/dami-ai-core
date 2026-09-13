# Installing Dami on Windows

Dami Desktop supports 64-bit Windows 10 and Windows 11. It needs an internet connection and microphone access for voice questions, Sahara transcription, legal research, and spoken answers.

## Install

1. Open the [latest Dami Desktop release](https://github.com/Jay-Codes4/dami-ai-core/releases/latest) and download `Dami-Setup.exe`.
2. If Chrome or Edge warns that the file is not commonly downloaded, open the download panel, choose the menu beside `Dami-Setup.exe`, then choose **Keep** or **Keep anyway**. Only continue when the download is from the official `Jay-Codes4/dami-ai-core` GitHub repository.
3. Double-click `Dami-Setup.exe`.
4. If Windows SmartScreen shows **Windows protected your PC**, select **More info**, confirm that the app name is Dami, then select **Run anyway**. This warning can appear because the open-source installer is not yet code-signed.
5. Complete the setup wizard. Dami starts automatically and appears as a small floating avatar near the lower-right corner of the Windows desktop.
6. When Windows requests microphone access, select **Allow**.

## Use Dami

- Wait until the label below the avatar says **Click me · or say “Hey Dami”**.
- Say **“Hey Dami”** by itself. The acknowledgement sound confirms the wake phrase; the rising listening cue means the microphone is open and you can ask your question immediately.
- You can also say the wake phrase and request together, for example: **“Hey Dami, give me five marriage laws in Nigeria.”** Dami acknowledges and processes the captured request without asking you to repeat it.
- You can also **single-click or double-click the avatar** and begin speaking immediately after the listening cue. This is a fully supported activation method, not an error state.
- While Dami is speaking, click her once to interrupt and ask a follow-up immediately.
- Dami stops listening after a short silence, transcribes the question with Sahara, researches the answer, and replies using her female voice.
- A descending sound confirms that recording has ended and Dami has started transcribing and researching.
- The label below the avatar shows **Dami is listening**, **Dami is transcribing**, **Dami is researching**, or **Dami is speaking**, so a judge never has to guess whether Dami is working.
- Dami remains available from the system tray. Right-click the tray icon to talk, pause or enable **Hey Dami**, show, hide, or quit Dami.

## If the microphone or wake phrase does not work

1. Open **Windows Settings → Privacy & security → Microphone**.
2. Turn on **Microphone access** and **Let desktop apps access your microphone**.
3. Make sure the intended microphone is the default input device under **Settings → System → Sound → Input**.
4. Under **Settings → Time & language → Language & region**, open your English language options and install the **Speech** feature if it is missing. Dami's private wake phrase listener uses the native Windows English recognizer; Sahara handles the actual legal-question transcription.
5. Close other apps that may be holding the microphone, then quit and reopen Dami from the Start menu.
6. Wait for **Click me · or say “Hey Dami”**, speak clearly, and try **“Hey Dami”**. You can always click or double-click the avatar to run the same voice workflow.

## Remove an older build

Before upgrading, right-click Dami's system-tray icon and choose **Quit Dami**. If an older Dami version is installed, uninstall it from **Settings → Apps → Installed apps**, then install the newest `Dami-Setup.exe`. The installer also closes a stale Dami background process automatically. Saved settings are retained unless you remove Dami's app data separately.

If activation fails, right-click the tray icon and choose **Open Dami diagnostics**. The log records activation stages and errors without storing microphone audio, legal questions, API keys, or other credentials.

## Judge verification checklist

1. Launch Dami and confirm the floating avatar appears.
2. Wait for **Click me · or say “Hey Dami”**, then say **“Hey Dami”** and confirm the rising cue and **Dami is listening** state appear without clicking.
3. Ask a jurisdiction-specific legal question.
4. Confirm the visible state advances through transcription and research, then Dami produces a complete sourced answer and speaks it using the female voice.
5. Repeat using a single-click or double-click on the avatar and confirm the same start/end cues.
