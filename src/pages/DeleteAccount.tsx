import { Link } from "react-router-dom";
import { Receipt, Mail, Trash2 } from "lucide-react";

export default function DeleteAccount() {
  const subject = encodeURIComponent("Account Deletion Request - Bill Look");
  const body = encodeURIComponent(
    "Hello Bill Look Team,\n\nI would like to request deletion of my Bill Look account and all associated data.\n\nRegistered email: \nRegistered phone (if any): \nBusiness name(s): \n\nReason (optional): \n\nThank you."
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <Link to="/" className="font-bold text-lg">Bill Look</Link>
            <p className="text-xs text-muted-foreground">Account & Data Deletion</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 text-sm leading-relaxed">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Trash2 className="h-7 w-7 text-destructive" />
          Delete Your Bill Look Account
        </h1>
        <p className="text-muted-foreground mb-8">
          Developer: <strong>Bill Look</strong> · App: <strong>Bill Look — GST Billing & Inventory</strong>
        </p>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-2">How to request account deletion</h2>
            <p className="mb-3">
              You can request deletion of your Bill Look account and all associated business data
              by following any one of the steps below:
            </p>

            <ol className="list-decimal pl-5 space-y-3">
              <li>
                <strong>From inside the app:</strong> Open Bill Look → tap your profile avatar
                (top-right) → <em>Settings</em> → scroll to the bottom → tap <em>Delete Account</em>{" "}
                → confirm. Your account and data will be queued for permanent deletion.
              </li>
              <li>
                <strong>By email:</strong> Send an email from your registered email address to{" "}
                <a
                  href={`mailto:support@billlook.com?subject=${subject}&body=${body}`}
                  className="text-primary hover:underline font-medium"
                >
                  support@billlook.com
                </a>{" "}
                with the subject line <em>"Account Deletion Request - Bill Look"</em>. Include
                your registered email, phone number, and business name so we can verify your
                identity.
              </li>
            </ol>

            <div className="mt-4">
              <a
                href={`mailto:support@billlook.com?subject=${subject}&body=${body}`}
                className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2.5 rounded-lg font-medium hover:opacity-90"
              >
                <Mail className="h-4 w-4" />
                Email deletion request
              </a>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">What happens after you request deletion</h2>
            <p>
              We will verify your identity (usually within 2 business days) and permanently delete
              your account within <strong>30 days</strong> of verification. You will receive a
              confirmation email once deletion is complete.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Data that will be deleted</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your account profile (name, email, phone, password).</li>
              <li>Your businesses, branches, warehouses, logos and invoice settings.</li>
              <li>All customers, suppliers and party data you added.</li>
              <li>All items, categories, batches and stock movement history.</li>
              <li>All invoices, sales, purchases, quotations, returns and payment records.</li>
              <li>All expenses, reports, loyalty data and POS sessions.</li>
              <li>All uploaded files (item images, business logos, scanned documents).</li>
              <li>Staff accounts and module access tied to your businesses.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Data that may be retained</h2>
            <p className="mb-2">
              Some data is retained after account deletion only where required by law or for
              legitimate operational reasons:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Tax & GST records</strong> (invoices, financial transactions): retained
                for up to <strong>8 years</strong> as required by the Indian Income Tax Act and
                GST Act. These are stored in archival form and are not accessible through the app.
              </li>
              <li>
                <strong>Anonymised analytics</strong> (aggregate, non-identifiable usage
                statistics): retained indefinitely as they cannot be linked back to you.
              </li>
              <li>
                <strong>Security & fraud-prevention logs</strong> (IP addresses, login attempts):
                retained for up to <strong>180 days</strong>.
              </li>
              <li>
                <strong>Backups</strong>: residual copies in encrypted backups are overwritten
                within <strong>90 days</strong>.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Cancel a deletion request</h2>
            <p>
              If you change your mind, contact{" "}
              <a href="mailto:support@billlook.com" className="text-primary hover:underline">
                support@billlook.com
              </a>{" "}
              within 30 days of your request and we will restore your account.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Contact</h2>
            <p>
              Questions? Email{" "}
              <a href="mailto:support@billlook.com" className="text-primary hover:underline">
                support@billlook.com
              </a>{" "}
              — see our{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for more information about how we handle your data.
            </p>
          </div>
        </section>

        <div className="mt-10 pt-6 border-t text-center">
          <Link to="/auth" className="text-sm text-primary hover:underline">
            ← Back to Bill Look
          </Link>
        </div>
      </main>
    </div>
  );
}
