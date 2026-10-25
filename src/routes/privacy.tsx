import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Parallax" },
      { name: "description", content: "How Parallax collects, uses and protects your information, including data from Google Sign-In." },
      { property: "og:title", content: "Privacy Policy — Parallax" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Parallax is an AI research engine that gathers sources, reads them and writes cited reports. This policy explains what
        information we collect when you use Parallax, how we use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account information.</strong> Your email address and, if you sign in with Google, your name as provided by your Google account. If you sign up with email, we also store a securely hashed password.</li>
        <li><strong>Content you provide.</strong> Research questions and context, documents you upload or paste, and the reports Parallax generates for you.</li>
        <li><strong>Organization information.</strong> If you create or join an organization: its name and branding, your role, and the projects, drafts, comments and reviews you create within it.</li>
        <li><strong>Usage information.</strong> Basic, aggregated analytics about how the site is used (pages visited, device and browser type).</li>
      </ul>

      <h2>Google user data</h2>
      <p>
        When you choose "Continue with Google", Parallax requests only your basic profile: your email address, name and Google account
        identifier. We use these solely to create and sign you in to your Parallax account and to show your name to the members of
        organizations you belong to. We do not request access to your Gmail, Drive, Calendar, contacts or any other Google service.
      </p>
      <p>
        Parallax's use and transfer of information received from Google APIs adheres to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy#limited-use" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>,
        including the Limited Use requirements. We do not sell Google user data, use it for advertising, or transfer it to others except as needed to
        operate the service or as required by law.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To provide Parallax: sign you in, run research, store and display your reports, and support collaboration inside organizations.</li>
        <li>To keep the service secure, prevent abuse and fix problems.</li>
        <li>To communicate with you about your account, such as confirmations and review or mention notifications.</li>
        <li>To understand, in aggregate, how the product is used so we can improve it.</li>
      </ul>

      <h2>Who processes your information</h2>
      <p>We rely on a small number of service providers, who process data only to provide their service to us:</p>
      <ul>
        <li><strong>Supabase</strong> for authentication and database storage.</li>
        <li><strong>Google</strong> for sign-in, if you choose it.</li>
        <li><strong>AI and web search providers</strong> which receive your research question, context and the source text needed to generate a report. Content you upload is sent to the AI provider only to produce your report.</li>
        <li><strong>Vercel</strong> for hosting and privacy-friendly web analytics.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>Sharing within organizations</h2>
      <p>
        Reports and drafts created in an organization workspace are visible to that organization's members according to their roles and
        project settings. Your name and email are visible to fellow members. Reports in your personal workspace are visible only to you.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We keep your information for as long as your account is active. You can delete individual reports from History at any time. To delete
        your account and associated data, email us at the address below and we will do so within 30 days, except where we must keep
        information to meet legal obligations.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, and access to each row of data is restricted at the database level to the people entitled to see it.
        No system is perfectly secure, but we work to protect your information.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export or delete your personal information, and to object to
        or restrict certain processing. Contact us to exercise these rights.
      </p>

      <h2>Children</h2>
      <p>Parallax is not directed to children under 16, and we do not knowingly collect their information.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy. When we make material changes we will update the date above and, where appropriate, notify you.</p>

      <h2>Contact</h2>
      <p>
        Questions about privacy? Write to <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
