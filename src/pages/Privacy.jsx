export default function Privacy() {
  const updated = "March 7, 2026";

  const sections = [
    {
      title: "1. Who We Are",
      content: `The Overtime Journal ("OTJ", "we", "us") is a multi-sport analytics platform at overtimejournal.com. We provide betting edge analysis, pick tracking, and community tools for sports fans. We are not a sportsbook and do not place bets on your behalf.`
    },
    {
      title: "2. What We Collect",
      content: null,
      subsections: [
        {
          subtitle: "When you sign in with Google:",
          items: [
            "Your name and email address",
            "Your Google profile picture",
            "A unique user ID tied to your Google account"
          ]
        },
        {
          subtitle: "When you use the platform:",
          items: [
            "Picks you log (team, confidence, result)",
            "Comments you post on daily threads",
            "Your contest entries and results"
          ]
        },
        {
          subtitle: "If you subscribe or make a purchase (via Stripe):",
          items: [
            "Subscription tier (Free, Pro, VIP)",
            "Payment history and transaction IDs",
            "Billing cycle and renewal dates",
            "Note: We never store your full credit card number — Stripe handles all payment processing securely"
          ]
        },
        {
          subtitle: "Automatically:",
          items: [
            "Basic usage data (pages visited, features used)",
            "Browser type and device type",
            "IP address (used for security only, not sold or shared)"
          ]
        }
      ]
    },
    {
      title: "3. What We Don't Collect",
      content: null,
      items: [
        "Your passwords (Google handles authentication — we never see it)",
        "Your full credit card number, CVV, or bank details",
        "Your location beyond what Google provides",
        "Any data from minors — OTJ is intended for users 18 and older"
      ]
    },
    {
      title: "4. How We Use Your Data",
      content: null,
      items: [
        "To create and manage your account",
        "To display your picks and record on the leaderboard",
        "To process subscription payments and purchases through Stripe",
        "To send you notifications about high-confidence edges (VIP only, opt-in)",
        "To improve the platform based on usage patterns",
        "We do not sell your data to third parties. Ever."
      ]
    },
    {
      title: "5. Third-Party Services",
      content: "We use the following trusted third-party services to operate OTJ:",
      items: [
        "Google OAuth — authentication (Google Privacy Policy applies)",
        "Supabase — database and backend infrastructure",
        "Vercel — website hosting",
        "Stripe — payment processing (Stripe Privacy Policy applies)",
        "None of these services sell your data."
      ]
    },
    {
      title: "6. Data Retention",
      content: "We keep your account data as long as your account is active. If you delete your account, your personal data is removed within 30 days. Pick history and comments may be retained in anonymized form for analytics purposes."
    },
    {
      title: "7. Your Rights",
      content: "You have the right to:",
      items: [
        "Access the data we hold about you",
        "Request correction of inaccurate data",
        "Request deletion of your account and data",
        "Opt out of any marketing communications",
        "To exercise any of these rights, email us at theovertimejournal@gmail.com"
      ]
    },
    {
      title: "8. Gambling Disclaimer",
      content: `OTJ provides sports analytics and edge analysis for informational and entertainment purposes only. We do not guarantee any outcomes. Nothing on this platform constitutes financial or gambling advice. Always gamble responsibly. If you or someone you know has a gambling problem, call 1-800-GAMBLER.`
    },
    {
      title: "9. Children's Privacy",
      content: "OTJ is not intended for users under 18 years of age. We do not knowingly collect data from minors. If you believe a minor has created an account, contact us immediately at theovertimejournal@gmail.com."
    },
    {
      title: "10. Changes to This Policy",
      content: "We may update this policy as the platform grows. We'll notify registered users of significant changes via email. The latest version is always at overtimejournal.com/privacy."
    },
    {
      title: "11. Contact",
      content: "Questions about this policy? Email us at theovertimejournal@gmail.com. We'll respond within 48 hours."
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
            Privacy Policy
          </h1>
          <div style={{ fontSize: 12, color: "#4a5568" }}>
            Last updated: {updated}
          </div>
          <div style={{ marginTop: 20, padding: "14px 18px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#86efac", lineHeight: 1.7 }}>
              <strong style={{ color: "#22c55e" }}>The short version:</strong> We collect your name, email, picks, and comments to run the platform. We use Stripe for payments. We don't sell your data. We don't store your passwords or credit card numbers. You can delete your account anytime.
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

            {section.subsections && section.subsections.map((sub, j) => (
              <div key={j} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>
                  {sub.subtitle}
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
                  {sub.items.map((item, k) => (
                    <li key={k} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8, marginBottom: 4 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}

        {/* Footer */}
        <div style={{ fontSize: 11, color: "#374151", textAlign: "center", paddingTop: 24 }}>
          © 2026 The Overtime Journal · overtimejournal.com · theovertimejournal@gmail.com
          <br />For informational purposes only. Gamble responsibly. 1-800-GAMBLER.
        </div>
      </div>
    </div>
  );
}
