import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Parallax" },
      { name: "description", content: "The terms that apply when you use Parallax." },
      { property: "og:title", content: "Terms of Service — Parallax" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms govern your use of Parallax, an AI research engine. By creating an account or using Parallax you agree to them. If you
        use Parallax for an organization, you confirm you have authority to accept these terms on its behalf.
      </p>

      <h2>Your account</h2>
      <p>
        You must provide accurate information and keep your sign-in credentials secure. You are responsible for activity under your account.
        You may sign in with email and password or with Google. You must be at least 16 years old to use Parallax.
      </p>

      <h2>What Parallax does</h2>
      <p>
        Parallax searches the web and reads the material you provide, then uses AI to write a report that cites its sources and flags gaps in the
        evidence. Reports are generated automatically and may contain errors, omissions or outdated information, even when cited.
        <strong> Check important claims against the cited sources before relying on them.</strong> Parallax does not provide legal, medical,
        financial or other professional advice.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of the questions, documents and reports you create. You give us a limited licence to store and process that content
        solely to operate Parallax for you, including sending it to the service providers described in our{" "}
        <Link to="/privacy">Privacy Policy</Link>. You promise that you have the right to upload what you upload, and that it does not infringe
        anyone's rights or break the law.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use Parallax to break the law, infringe others' rights, or produce harmful, deceptive or abusive material.</li>
        <li>Do not attempt to disrupt, probe or gain unauthorized access to the service, or to bypass usage limits.</li>
        <li>Do not scrape, resell or reverse engineer the service except as permitted by law.</li>
        <li>Do not upload content you are not allowed to share, including confidential data you have no right to process.</li>
      </ul>

      <h2>Organizations</h2>
      <p>
        Organization owners and administrators control membership, roles and settings. Content created in an organization workspace is visible to
        its members under the rules set there, and the organization may remove it or your access to it.
      </p>

      <h2>Third-party sources and services</h2>
      <p>
        Reports link to material on third-party websites that we do not control. We are not responsible for that material. Parallax relies on
        third-party services and may be interrupted when they are.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep Parallax available but do not guarantee uninterrupted service. We may change, suspend or discontinue features, and may
        suspend accounts that break these terms.
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using Parallax and ask us to delete your account at any time. We may suspend or end your access if you breach these terms
        or misuse the service.
      </p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>
        Parallax is provided "as is" and "as available", without warranties of any kind, to the fullest extent the law allows. To that same extent,
        we are not liable for indirect, incidental or consequential damages, or for loss of profits, data or goodwill, arising from your use of
        Parallax. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. If changes are material we will update the date above. Continuing to use Parallax after changes take effect
        means you accept them.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Write to <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
