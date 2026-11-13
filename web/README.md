# QPrint

QPrint is a Next.js printing platform. The customer order flow loads active shops and their printing prices from the existing `qprint_db` MySQL database.

## Local setup

1. Start MySQL from XAMPP and make sure the `qprint_db` schema is imported. For an existing database, run [`qprint_printing_pricing_migration.sql`](../qprint_printing_pricing_migration.sql) once to add the finishing-price table.
2. Copy `.env.example` to `.env.local`, set `SESSION_PASSWORD` to a random value of at least 32 characters (for example, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), and set the MySQL connection values if they differ from the XAMPP defaults.
3. Install dependencies and start the site:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Start a customer order at [http://localhost:3000/order](http://localhost:3000/order).

Uploaded PDFs are validated and stored under the ignored `storage/documents/` directory, outside `public/`. The order API writes print jobs, document metadata, print settings, price snapshots, a pending cash payment, and initial status history in one MySQL transaction. It returns the random QR token once; only its SHA-256 hash is stored in `print_jobs`.

Shop owners can register at `/register/shop` or sign in at `/login`. Registration creates the owner account, shop profile, default priority settings, and the standard Document Printing service in a single MySQL transaction. The owner dashboard at `/owner` and catalog at `/owner/services` are scoped to the signed-in user's shop. Every shop uses the same 16 print combinations (four paper sizes, two color modes, and single- or double-sided printing); owners set the per-page rates. Optional photocopying, lamination, binding, and other services are managed separately. Shops appear in Find a Shop after their print rates are saved. Owners configure supported paper sizes, four document-printing rates (black-and-white/colored, single-/double-sided), and optional stapled or laminated finishing charges. Paper size and orientation do not change the base rate; copies multiply the per-page price. Existing orders keep their price snapshots. Owners whose shop profile has been cleared can sign in with their existing account and add a new shop. Owner sessions use an encrypted, HTTP-only cookie shared across the site, expire after five hours, and can be ended immediately with Sign out; configure a private `SESSION_PASSWORD` before deployment.

## Project files

- `app/` — landing page, customer order flow, and API routes.
- `lib/db.ts` — MySQL connection pool.
- `storage/documents/` — private runtime PDF storage (not committed).
