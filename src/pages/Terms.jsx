export default function Terms() {
  const updated = "March 7, 2026";

  const sections = [
    {
      title: "1. Acceptance of Terms",
      content: `By accessing or using The Overtime Journal ("OTJ", "we", "us") at overtimejournal.com, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform. We reserve the right to update these terms at any time — continued use of the platform after changes means you accept the updated terms.`
    },
    {
      title: "2. Eligibility",
      content: null,
      items: [
        "You must be at least 18 years old to use OTJ",
        "You must be legally permitted to access sports analytics content in your jurisdiction",
        "By creating an account, you confirm that you meet these requirements",
        "We reserve the right to terminate accounts found to belong to minors"
      ]
    },
    {
      title: "3. Not Gambling Advice",
      content: `OTJ is an analytics and entertainment platform. Everything on this site — edge scores, signals, confidence ratings, pick leans, B2B tiers, spread mismatches — is for informational and entertainment purposes only.`,
      items: [
        "We do not guarantee any outcomes",
        "Past performance of our picks does not guarantee future results",
        "Nothing on OTJ constitutes financial, legal, or gambling advice",
        "You are solely responsible for any betting decisions you make",
        "Always gamble responsibly. If you have a gambling problem, call 1-800-GAMBLER."
      ]
    },
    {
      title: "4. User Accounts",
      content: null,
      items: [
        "You sign in via Google OAuth — you are responsible for keeping your account secure",
        "You are responsible for all activity that occurs under your account",
        "You may not create accounts for others or share your account",
        "We reserve the right to suspend or terminate accounts that violate these terms",
        "You may delete your account at any time by contacting theovertimejournal@gmail.com"
      ]
    },
    {
      title: "5. User Content",
      content: "By posting picks, comments, or any other content on OTJ, you agree that:",
      items: [
        "You own or have the right to post the content",
        "You grant OTJ a non-exclusive license to display and use that content on the platform",
        "You will not post content that is illegal, harassing, hateful, or spam",
        "We reserve the right to remove any content that violates these terms without notice",
        "We are not responsible for the accuracy of picks or comments posted by users"
      ]
    },
    {
      title: "6. Subscriptions & Payments",
      content: "OTJ may offer paid subscription tiers and one-time purchases. When purchasing:",
      items: [
        "All payments are processed securely through Stripe",
        "Subscription pricing and features are displayed clearly before purchase",
        "Subscriptions auto-renew unless cancelled before the renewal date",
        "You may cancel your subscription at any time — access continues until the end of the billing period",
        "Refund policies will be specified at the time of purchase",
        "We reserve the right to change pricing with reasonable notice to subscribers",
        "Cosmetic purchases (borders, badges, etc.) are final sale — no refunds"
      ]
    },
    {
      title: "7. Intellectual Property",
      content: null,
      items: [
        "All OTJ content — edge models, dashboards, design, branding — is owned by The Overtime Journal",
        "You may not copy, reproduce, or redistribute our analytics, scoring systems, or content without permission",
        "The OTJ name, logo, and brand are our property",
        "User-generated content (picks, comments) remains yours — we only display it on the platform"
      ]
    },
    {
      title: "8. Prohibited Conduct",
      content: "You agree not to:",
      items: [
        "Use OTJ for any illegal purpose",
        "Attempt to hack, scrape, or reverse engineer the platform",
        "Create fake accounts or manipulate the leaderboard",
        "Harass, threaten, or abuse other users",
        "Post spam, advertisements, or promotional content in comments",
        "Attempt to sell or transfer your account to another person",
        "Use automated tools to submit picks or interact with the platform"
      ]
    },
    {
      title: "9. Disclaimers & Limitation of Liability",
      content: `OTJ is provided "as is" without warranties of any kind. We do not guarantee that the platform will be uninterrupted, error-free, or that data will always be accurate. To the fullest extent permitted by law:`,
      items: [
        "OTJ is not liable for any losses from betting decisions made using our analysis",
        "OTJ is not liable for any technical issues, data errors, or service interruptions",
        "Our total liability to you for any claim is limited to the amount you paid us in the last 3 months",
        "We are not responsible for third-party services (Google, Stripe, Supabase) or their actions"
      ]
    },
    {
      title: "10. Governing Law",
      content: "These terms are governed by the laws of the State of Arizona, United States. Any disputes will be resolved in the courts of Maricopa County, Arizona. If any provision of these terms is found unenforceable, the remaining provisions remain in full effect."
    },
    {
      title: "11. Contact",
      content: "Questions about these terms? Email us at theovertimejournal@gmail.com. We'll respond within 48 hours."
    }
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#08080f",
      color: "#e2e8f0",
      fontFamily: "'JetBrains Mono','SF Mono',monospace",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px" }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, color: "#4a5568", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            The Overtime Journal
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 12px", color: "#f1f5f9", letterSpacing: "-0.03em" }}>
            Terms of Service
          </h1>
          <div style={{ fontSize: 12, color: "#4a5568" }}>
            Last updated: {updated}
          </div>
          <div style={{ marginTop: 20, padding: "14px 18px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#fca5a5", lineHeight: 1.7 }}>
              <strong style={{ color: "#ef4444" }}>The short version:</strong> You must be 18+. Our picks are for entertainment only — not gambling advice. Don't be a jerk in the comments. You're responsible for your own betting decisions. We can ban accounts that break the rules.
            </div>
          </div>
        </div>

        {/* Sections */}
        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 36, paddingBottom: 36, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {section.title}
            </h2>

            {section.content && (
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8, margin: "0 0 12px" }}>
                {section.content}
              </p>
            )}

            {section.items && (
              <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                {section.items.map((item, j) => (
                  <li key={j} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8, marginBottom: 4 }}>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Footer */}
        <div style={{ fontSize: 11, color: "#374151", textAlign: "center", paddingTop: 24 }}>
          © 2026 The Overtime Journal · overtimejournal.com · theovertimejournal@gmail.com
          <br />For informational and entertainment purposes only. Gamble responsibly. 1-800-GAMBLER.
        </div>
      </div>
    </div>
  );
}
