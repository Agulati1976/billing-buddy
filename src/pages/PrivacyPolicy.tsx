import { Link } from "react-router-dom";
import { Receipt } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <Link to="/" className="font-bold text-lg">Bill Look</Link>
            <p className="text-xs text-muted-foreground">Privacy Policy</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 prose prose-sm dark:prose-invert">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: June 8, 2026</p>

        <section className="space-y-6 text-sm leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold mb-2">1. Introduction</h2>
            <p>
              Bill Look ("we", "our", "us") provides GST billing, inventory and party management
              software for Indian businesses. This Privacy Policy explains how we collect, use,
              store and protect your information when you use our website, mobile app and services
              (collectively, the "Service").
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account information:</strong> name, email address, password, phone number.</li>
              <li><strong>Business information:</strong> business name, GSTIN, address, branches, logo and invoice settings.</li>
              <li><strong>Transactional data:</strong> invoices, items, customers, suppliers, payments, expenses, stock and reports you create.</li>
              <li><strong>Device information:</strong> device type, OS version, app version, IP address, crash logs.</li>
              <li><strong>Permissions you grant:</strong> camera (for barcode/invoice scanning), storage (for PDF export), and notifications.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide, operate and maintain the Service.</li>
              <li>To authenticate users and secure your account.</li>
              <li>To generate invoices, reports and AI-powered business insights you request.</li>
              <li>To sync your data across devices when you are online.</li>
              <li>To communicate service updates, security alerts and support responses.</li>
              <li>To comply with applicable laws including GST and tax record-keeping requirements.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">4. Data Storage and Security</h2>
            <p>
              Your data is stored on secure cloud infrastructure (Supabase) with encryption in
              transit (TLS) and at rest. Row-level security policies ensure that each shopkeeper
              can only access their own business data. We also support offline storage on your
              device for uninterrupted billing.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">5. Sharing of Information</h2>
            <p>We do not sell your personal or business data. We only share data with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Service providers that host or process data on our behalf (e.g. Supabase, AI providers for AI Insights).</li>
              <li>Authorities when required by law, court order or to protect our legal rights.</li>
              <li>Staff users you explicitly invite to your business.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">6. Your Rights</h2>
            <p>
              You may access, correct, export or delete your data at any time from within the app
              or by contacting us. Deleting your account permanently removes your business data
              from our active systems, subject to legal retention requirements.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">7. Children's Privacy</h2>
            <p>The Service is not intended for users under 18. We do not knowingly collect data from children.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              notified through the app or via email. Continued use of the Service after changes
              means you accept the updated policy.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">9. Contact Us</h2>
            <p>
              For questions about this Privacy Policy or your data, contact us at:{" "}
              <a href="mailto:support@billlook.com" className="text-primary hover:underline">
                support@billlook.com
              </a>
            </p>
          </div>
        </section>

        <div className="mt-10 pt-6 border-t text-center">
          <Link to="/auth" className="text-sm text-primary hover:underline">← Back to Bill Look</Link>
        </div>
      </main>
    </div>
  );
}
