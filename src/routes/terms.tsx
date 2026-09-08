import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use | Dami AI" },
      { name: "description", content: "Terms of use for Dami AI." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">Dami AI</p>
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Use</h1>
          <p className="text-sm text-muted-foreground">Last updated: 8 September 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Using Dami</h2>
          <p className="leading-relaxed text-muted-foreground">Dami is an AI-assisted legal research and legal information tool. You may use it for lawful research, learning, drafting support, and other legitimate legal information tasks. You must not use Dami to violate the law, harm another person, interfere with the service, or gain unauthorized access to systems or information.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Not a lawyer</h2>
          <p className="leading-relaxed text-muted-foreground">Dami is not a lawyer, law firm, court, government authority, or substitute for qualified legal advice. Using Dami does not create a lawyer-client relationship. Important legal decisions should be checked against current authoritative sources and, where appropriate, reviewed by a qualified legal professional in the relevant jurisdiction.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">AI can make mistakes</h2>
          <p className="leading-relaxed text-muted-foreground">AI-generated answers can be incomplete, outdated, or incorrect. Citations and sources should be opened and verified before relying on them. Laws also differ between countries and jurisdictions and can change over time.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your responsibility</h2>
          <p className="leading-relaxed text-muted-foreground">You are responsible for the questions, documents, audio, and other information you provide, and for how you use Dami's output. Only provide information you have the right to use and share.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Availability</h2>
          <p className="leading-relaxed text-muted-foreground">Dami is under active development. Features may change, fail, be temporarily unavailable, or behave differently across browsers, operating systems, languages, and speech services. The service is provided without a guarantee of uninterrupted availability or error-free results.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Desktop software</h2>
          <p className="leading-relaxed text-muted-foreground">The Dami desktop companion may request operating-system permissions such as microphone access and may offer launch-at-startup or floating-window features. You remain in control of these permissions through Dami and your operating-system settings.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Third-party services and sources</h2>
          <p className="leading-relaxed text-muted-foreground">Some Dami features depend on third-party speech, AI, search, hosting, or source websites. Those services may have their own terms and policies. A link or citation does not mean Dami controls or endorses the third-party website.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Changes</h2>
          <p className="leading-relaxed text-muted-foreground">These terms may change as Dami develops. Continued use after an update means you are using Dami under the updated terms.</p>
        </section>
      </article>
    </AppShell>
  );
}
