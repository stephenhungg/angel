export const metadata = {
  title: "angel — privacy policy",
  description: "how angel handles your data",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper text-ink-near">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-display italic text-[56px] leading-tight tracking-tight text-sakura-700 mb-2">
          privacy policy
        </h1>
        <div className="font-mono uppercase tracking-[0.18em] text-[10px] text-muted-secondary mb-12">
          last updated: may 9, 2026
        </div>

        <Section title="overview">
          <p>
            angel is an AI companion application. this privacy policy explains
            how we collect, use, and protect personal information when you use
            our website (angel-swipe-djvhgfzim-stephen-hungs-projects-d01c13ef.vercel.app),
            our desktop application, and our SMS service.
          </p>
        </Section>

        <Section title="information we collect">
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>persona data:</strong> swipe choices, derived persona
              vector, and chosen name during onboarding.
            </li>
            <li>
              <strong>phone number:</strong> if you voluntarily provide it
              during onboarding to enable SMS replies, or if you initiate
              contact by texting our number directly.
            </li>
            <li>
              <strong>conversation data:</strong> messages exchanged with angel
              via desktop app or SMS, used to provide personalized replies.
            </li>
            <li>
              <strong>usage telemetry:</strong> anonymous swipe events and
              orchestrator turns for product improvement and demo observability.
            </li>
          </ul>
        </Section>

        <Section title="how we use information">
          <ul className="list-disc pl-6 space-y-2">
            <li>to provide personalized AI companion replies</li>
            <li>to maintain conversation continuity across sessions and surfaces (desktop, SMS)</li>
            <li>to remember context you share with angel (preferences, projects, recent activity)</li>
            <li>to deliver SMS replies via Twilio (only when you have opted in or initiated contact)</li>
          </ul>
        </Section>

        <Section title="SMS messaging">
          <p>
            our SMS service operates on a strict opt-in basis. you provide
            consent by either (1) texting our number first, or (2) voluntarily
            entering your phone number during onboarding. you may opt out at
            any time by replying STOP, UNSUBSCRIBE, or END. opt-out requests
            are honored immediately. we do not send unsolicited or promotional
            SMS messages. message and data rates may apply per your carrier.
            we send conversational replies only — no marketing.
          </p>
        </Section>

        <Section title="data storage and sharing">
          <p>
            your data is stored on Convex (real-time backend), Nia (memory
            vector store), and locally on your device for the desktop app. we
            do not sell your data. we share data with our infrastructure
            providers (Convex, Nia, Tensorlake, Anthropic, Twilio) only as
            needed to provide the service. we use Anthropic's Claude API for
            generating AI responses; messages may be processed by Anthropic
            per their privacy policy.
          </p>
        </Section>

        <Section title="your rights">
          <ul className="list-disc pl-6 space-y-2">
            <li>opt out of SMS at any time (reply STOP)</li>
            <li>request deletion of your data by emailing the contact below</li>
            <li>access a copy of your conversation history on request</li>
          </ul>
        </Section>

        <Section title="contact">
          <p>
            for questions about this policy or your data, contact:{" "}
            <a
              href="mailto:stephenhung@berkeley.edu"
              className="text-sakura-600 underline"
            >
              stephenhung@berkeley.edu
            </a>
          </p>
        </Section>

        <div className="mt-16 pt-8 border-t border-hairline font-mono uppercase tracking-[0.2em] text-[10px] text-muted-secondary">
          angel — discovered, not designed
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display italic text-[28px] tracking-tight text-sakura-700 mb-4">
        {title}
      </h2>
      <div className="font-sans text-[15px] leading-[1.65] text-ink-near">
        {children}
      </div>
    </section>
  );
}
