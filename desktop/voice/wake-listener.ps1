$ErrorActionPreference = "Stop"

try {
    Add-Type -AssemblyName System.Speech

    $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
    if (-not $installed -or $installed.Count -lt 1) {
        throw "No Windows speech recognizer is installed"
    }

    $info = $installed |
        Where-Object { $_.Culture.TwoLetterISOLanguageName -eq "en" } |
        Select-Object -First 1
    if (-not $info) {
        $info = $installed | Select-Object -First 1
    }

    $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new($info.Id)
    $recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(3)
    $recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(2)
    $recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(260)
    $recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(420)
    $recognizer.MaxAlternates = 8

    [string[]] $wakePhrases = @(
        "hey dami",
        "hey dammy",
        "hey demi",
        "hey darmi",
        "hey dummy",
        "hey danny",
        "hey day me",
        "hey dami ai",
        "okay dami",
        "ok dami",
        "hi dami",
        "dami"
    )
    $choices = New-Object System.Speech.Recognition.Choices
    foreach ($phrase in $wakePhrases) {
        $choices.Add($phrase)
    }

    $wakeBuilder = [System.Speech.Recognition.GrammarBuilder]::new($choices)
    $wakeBuilder.Culture = $info.Culture
    $wakeGrammar = [System.Speech.Recognition.Grammar]::new($wakeBuilder)
    $wakeGrammar.Name = "dami-wake"
    $wakeGrammar.Priority = 127

    $commandBuilder = [System.Speech.Recognition.GrammarBuilder]::new($choices)
    $commandBuilder.Culture = $info.Culture
    $commandBuilder.AppendDictation()
    $commandGrammar = [System.Speech.Recognition.Grammar]::new($commandBuilder)
    $commandGrammar.Name = "dami-command"
    $commandGrammar.Priority = 126

    # Dictation is a fallback for accents that Windows does not map cleanly to
    # the narrow wake grammar. Node still requires a Dami-shaped phrase before
    # activating, so ordinary background speech cannot start a voice turn.
    $dictationGrammar = New-Object System.Speech.Recognition.DictationGrammar
    $dictationGrammar.Name = "dami-accent-fallback"
    $dictationGrammar.Priority = 0

    $recognizer.LoadGrammar($wakeGrammar)
    $recognizer.LoadGrammar($commandGrammar)
    $recognizer.LoadGrammar($dictationGrammar)
    $recognizer.SetInputToDefaultAudioDevice()

    [Console]::Out.WriteLine("DAMI_READY")
    [Console]::Out.Flush()

    $wakePattern = '(?i)(?:hey|hi|okay|ok)\s+(?:dami|dammy|demi|darmi|dummy|danny|day\s*me|dar\s*me)(?:\s+ai)?\b|^\s*dami(?:\s+ai)?\b'

    while ($true) {
        $result = $recognizer.Recognize([TimeSpan]::FromSeconds(3))
        if ($null -eq $result) {
            continue
        }

        $candidates = @($result)
        try {
            $candidates += @($result.Alternates)
        }
        catch {
            # Some Windows recognizers expose no alternative list.
        }

        $selected = $null
        foreach ($candidate in $candidates) {
            if (
                $null -ne $candidate -and
                $candidate.Confidence -ge 0.08 -and
                -not [string]::IsNullOrWhiteSpace($candidate.Text) -and
                $candidate.Text -match $wakePattern
            ) {
                $selected = $candidate
                break
            }
        }
        if ($null -eq $selected) {
            continue
        }

        $text64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($selected.Text))
        $audio64 = ""
        if ($null -ne $result.Audio) {
            $stream = New-Object IO.MemoryStream
            try {
                $result.Audio.WriteToWaveStream($stream)
                $audio64 = [Convert]::ToBase64String($stream.ToArray())
            }
            finally {
                $stream.Dispose()
            }
        }

        [Console]::Out.WriteLine("DAMI_WAKE:" + $text64 + ":" + $audio64)
        [Console]::Out.Flush()
    }
}
catch {
    [Console]::Out.WriteLine("DAMI_ERROR:" + $_.Exception.Message)
    [Console]::Out.Flush()
    exit 1
}
finally {
    if ($null -ne $recognizer) {
        $recognizer.Dispose()
    }
}
