import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Dami AI" },
      { name: "description", content: "Privacy information for Dami AI." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">Dami AI</p>
          <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: 8 September 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What Dami processes</h2>
          <p className="leading-relaxed text-muted-foreground">Dami may process the questions you type or speak, audio needed to transcribe a voice request, language and voice preferences, research queries, and technical information needed to operate the service. Saved research and preferences may also be stored on your device where the product uses local browser storage.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How information is used</h2>
          <p className="leading-relaxed text-muted-foreground">Information is used to understand your request, transcribe speech, research legal information, generate responses, speak responses when enabled, remember your selected settings, improve reliability, and protect the service from misuse.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Voice and third-party services</h2>
          <p className="leading-relaxed text-muted-foreground">When you use voice or legal research features, the information needed to complete your request may be sent to service providers used by Dami for speech processing, AI reasoning, search, hosting, or related infrastructure. Dami does not claim that desktop wake-word recognition is fully local. Depending on your operating system and speech service, wake-word or speech recognition may use platform services.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Sensitive information</h2>
          <p className="leading-relaxed text-muted-foreground">Do not submit passwords, authentication codes, financial credentials, or information you are not permitted to share. Legal matters can contain confidential information, so consider whether a request is appropriate before sending it to an AI service.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Microphone access</h2>
          <p className="leading-relaxed text-muted-foreground">Dami requests microphone permission only when voice features require it. You can control microphone permission through your browser or operating system settings.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Data choices</h2>
          <p className="leading-relaxed text-muted-foreground">You can choose not to use voice features and use typed questions instead. You can also remove locally saved research or site data through the controls provided by your browser or device.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Changes to this policy</h2>
          <p className="leading-relaxed text-muted-foreground">This policy may be updated as Dami develops. The date at the top of this page will show when the policy was last changed.</p>
        </section>

        <section className="rounded-2xl border bg-muted/30 p-5">
          <h2 className="font-semibold">Open-source project</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Dami AI is an open-source project. Security issues should be reported privately using the security reporting guidance in the Dami AI GitHub repository rather than posted publicly.</p>
        </section>
      </article>
    </AppShell>
  );
}
