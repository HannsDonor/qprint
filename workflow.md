# QPRINT — COMPLETE SYSTEM DEVELOPMENT MASTER PROMPT

Act as a senior full-stack developer, software architect, UI/UX designer, and database engineer.

I am developing **QPrint**, a web-based printing service platform that connects customers with local printing shops. Customers can upload documents, customize printing settings, select a printing shop, pay at the physical shop, and retrieve their print jobs using QR codes.

The system also provides shop owners with tools to manage their printing businesses, services, prices, printers, payments, and printing queues.

The project already has:
- An established Next.js framework.
- A connected MySQL database.
- An existing database schema for QPrint.

Your responsibility is to develop the complete system using the existing project structure and database.

**IMPORTANT: Do not immediately rewrite the project or generate everything in one implementation. First understand the existing codebase, database structure, routes, dependencies, and conventions. Preserve working implementations. The development will be divided into smaller tasks, so establish the complete architecture and functionality first.**

---

# 1. PROJECT OVERVIEW

QPrint is a multi-shop printing platform.

There are two primary user types:

1. Customers — people who need documents printed.
2. Shop Owners — printing businesses that register and manage their shops.

There is also a separate local application:

3. QPrint Local Printing Service — a Windows application installed on each participating shop's computer. It communicates with the QPrint backend and the shop's physical printer.

The main website handles customer interactions, shop management, payments, QR codes, and print-job management.

The Local Printing Service handles the actual communication between QPrint and the Windows printing system.

The system must support multiple independent shops. Each shop must only access and manage its own business information, orders, devices, printers, and transactions.

---

# 2. LANDING PAGE AND PUBLIC WEBSITE

Create a professional, responsive landing page that introduces QPrint.

The landing page should be accessible without authentication.

### Header and navigation
- QPrint logo and branding.
- Home.
- Find Printing Shops.
- How It Works.
- About.
- Sign In.
- Register.

### Hero section
Explain the primary purpose of QPrint.

Suggested headline:

"Your Documents, Printed Without the Hassle."

Suggested description:

"Upload your documents, choose a printing shop, customize your printing preferences, and collect your prints using a simple QR code."

Include:
- Find a Printing Shop button.
- Start Printing button.
- Visual illustration of the printing workflow.

### How It Works section

Show the customer workflow:

1. Upload your document.
2. Customize printing settings.
3. Choose a printing shop.
4. Receive your QR code.
5. Pay at the selected shop.
6. Scan your QR code and get your documents printed.

### Features section

Highlight:
- Online document uploading.
- Customizable printing options.
- Multiple printing shops.
- Transparent shop-specific pricing.
- Priority Printing.
- QR-based job retrieval.
- Automated printing.
- Print-job tracking.

### Shop Owner section

Encourage printing businesses to register.

Include:
- Shop registration.
- Service and pricing management.
- Automated print queue.
- Printer integration.
- Sales and transaction monitoring.

### Footer

Include:
- About QPrint.
- Contact information.
- Privacy Policy.
- Terms and Conditions.
- Customer support.
- Shop registration.

---

# 3. USER AUTHENTICATION AND ACCOUNT MANAGEMENT

Implement authentication for customers and shop owners.

### Customer accounts

Features:
- Customer registration.
- Login and logout.
- Password hashing.
- Profile management.
- Contact information management.
- Password updates.
- Order history.
- Active print jobs.
- QR code access.
- Print-job tracking.

### Shop owner accounts

Features:
- Shop owner registration.
- Login and logout.
- Profile management.
- Password updates.
- Shop ownership association.
- Shop dashboard access.
- Session management.

### Authentication requirements

- Use secure password hashing.
- Protect private routes.
- Implement role-based authorization.
- Customers cannot access shop-owner pages.
- Shop owners cannot access another shop's administrative data.
- Never expose passwords or authentication secrets to the frontend.
- Use secure session handling.

Allow customers to browse shops without creating an account if the existing project supports guest browsing. Do not force guest orders to have a customer account.

---

# 4. CUSTOMER WORKFLOW

This is one of the most important parts of QPrint.

Customers should be able to complete the entire document-printing process through the public website.

## 4.1 Find Printing Shops

Create a printing shop discovery page.

Features:
- Display registered printing shops.
- Search by shop name.
- Search by location.
- Filter shops by availability.
- View shop addresses.
- View contact information.
- View operating hours.
- View available services.
- View printing prices.
- View Priority Printing availability.
- View shop details.

If location services are implemented, allow customers to find nearby shops.

Each shop must have an individual public profile.

## 4.2 Shop Details

Display:
- Shop name.
- Description.
- Address.
- Contact information.
- Operating hours.
- Available printing services.
- Service prices.
- Supported paper sizes.
- Black-and-white printing prices.
- Colored printing prices.
- Duplex availability.
- Priority Printing availability and additional fee.

Provide a button to start a print order at the selected shop.

## 4.3 Document Upload

Allow customers to upload PDF documents.

Requirements:
- PDF validation.
- File size validation.
- File type validation.
- File storage management.
- Display original filename.
- Display document size.
- Detect and display page count.
- Allow document removal before order submission.

Do not store PDF binary data directly in MySQL. Store files in an appropriate server-side file storage location and save their metadata and storage paths in the database.

Do not expose permanent public file URLs.

## 4.4 Printing Configuration

Allow customers to configure their printing preferences.

Settings should include:

- Paper size: A4, A3, Letter, Legal, Custom where supported.
- Color mode: Black and White or Colored.
- Number of copies.
- Page range.
- Orientation: Portrait or Landscape.
- Single-sided or Double-sided printing.
- Pages per sheet.

Only show options supported by the selected shop and printer.

Validate all settings on the backend.

## 4.5 Shop Service Selection

Allow customers to select services created by the shop owner.

Examples:
- Document Printing.
- Photocopy.
- Lamination.
- Binding.
- Other customized printing services.

Each shop controls its own available services and prices.

Customers must see the current price before submitting an order.

Save price snapshots in the order items so that future price changes do not modify existing orders.

## 4.6 Priority Printing

Implement Priority Printing as an optional paid service.

Each shop owner can:
- Enable Priority Printing.
- Disable Priority Printing.
- Set their own additional priority fee.

Customers can choose:
- Standard Printing.
- Priority Printing.

Display the additional fee before order submission.

Priority Printing must receive precedence over standard jobs in the shop's waiting queue.

Important:
- Priority Printing does not bypass payment confirmation.
- Priority Printing does not bypass QR validation.
- Priority Printing does not interrupt a document already being printed.
- Jobs within the same priority level should follow a first-in, first-out order.

## 4.7 Order Summary and Price Calculation

Before submitting an order, display:

- Selected shop.
- Uploaded document.
- Page count.
- Printing settings.
- Selected services.
- Number of copies.
- Base printing cost.
- Additional service costs.
- Priority fee, if selected.
- Total amount.

All pricing calculations must be performed and verified on the backend.

Never trust a total price submitted by the browser.

## 4.8 Print Job Creation

After the customer confirms the order:

- Create a unique print-job reference.
- Associate the job with the selected shop.
- Save the document metadata.
- Save printing settings.
- Save selected service items.
- Save price snapshots.
- Save the priority selection.
- Calculate and store the total price.
- Generate a unique QR retrieval token.

Initial status:

`awaiting_payment`

The customer should receive a QR code after successful job creation.

The QR code must represent a secure, unpredictable job retrieval token, not the actual document or an unrestricted database ID.

Only store the token hash in the database.

## 4.9 Customer QR Code Page

Create a dedicated order confirmation page.

Display:
- QR code.
- Job reference.
- Selected shop.
- Total amount.
- Payment instructions.
- Printing preferences.
- Priority status.
- Current job status.

Allow customers to:
- Display the QR code.
- Save or download the QR code.
- Reopen the QR code through their order history or secure tracking link.

The QR code should remain available until the job expires or is completed, according to the system's rules.

## 4.10 Order Tracking

Create a customer-facing tracking page.

Possible statuses:

- Awaiting Payment.
- Paid.
- Queued.
- Printing.
- Ready for Pickup.
- Completed.
- Cancelled.
- Expired.
- Failed.

Show a clear timeline of the order's progress.

Customers should not be able to modify printing settings after payment confirmation.

---

# 5. SHOP OWNER REGISTRATION AND SHOP MANAGEMENT

Shop owners must be able to register their printing businesses.

## 5.1 Shop Registration

Collect:
- Owner's full name.
- Email address.
- Password.
- Contact number.
- Shop name.
- Shop description.
- Shop address.
- Shop contact number.
- Shop email.
- Shop logo.
- Location coordinates, if supported.

After registration, associate the shop with the authenticated owner.

Create the default Priority Printing settings for the shop.

## 5.2 Shop Profile Management

Allow owners to:
- Edit shop information.
- Change the shop logo.
- Update contact information.
- Update address.
- Update operating hours.
- Enable or disable shop availability.

## 5.3 Shop Services Management

This is an essential feature.

Each shop owner must be able to create, edit, enable, disable, and archive their own printing services.

Examples:
- A4 Black-and-White Printing.
- A4 Colored Printing.
- Long Bond Paper Printing.
- Photocopy.
- Lamination.
- Binding.

Allow owners to configure:
- Service name.
- Category.
- Description.
- Pricing type.
- Service availability.

Each service may have multiple pricing options.

Example:

A4 Document Printing:
- Black and White: ₱3 per page.
- Colored: ₱10 per page.

Long Bond Paper:
- Black and White: ₱4 per page.
- Colored: ₱12 per page.

Owners must be able to change their prices at any time.

However, previously submitted orders must retain their original price snapshots.

## 5.4 Priority Printing Management

Create a dedicated settings section.

Allow the owner to:
- Enable Priority Printing.
- Disable Priority Printing.
- Set the additional fee.
- Preview the customer-facing priority option.

Save the settings in `shop_priority_settings`.

---

# 6. SHOP OWNER DASHBOARD

Create a professional dashboard with a clear sidebar navigation.

Suggested navigation:

- Dashboard.
- Print Orders.
- QR Scanner.
- Printing Queue.
- Services and Pricing.
- Shop Profile.
- Device Management.
- Printers.
- Priority Printing.
- Payments.
- Transactions.
- Reports.
- Account Settings.

## Dashboard overview

Display summary cards:

- Total Orders.
- Pending Payments.
- Paid Orders.
- Jobs Currently Printing.
- Ready for Pickup.
- Completed Orders.
- Today's Revenue.

Include:
- Recent orders.
- Daily sales chart.
- Order status chart.
- Priority versus standard order statistics.
- Printer connection status.
- Local Printing Service connection status.

All information must be filtered by the authenticated owner's shop.

---

# 7. PAYMENT MANAGEMENT

The initial payment process is handled physically at the printing shop.

The customer presents their QR code and pays the shop owner.

The owner must be able to:

- Scan or retrieve the print job.
- View the order details.
- Check the total amount.
- Select the payment method.
- Confirm cash payment.
- Record GCash payment.
- View payment history.
- View payment references.

Payment methods:
- Cash.
- GCash.

Initial payment statuses:
- Pending.
- Paid.
- Failed.
- Refunded.

Only the shop owner authorized for that job may confirm its physical payment.

After successful confirmation:

1. Create or update the payment record.
2. Record who confirmed payment.
3. Set the payment timestamp.
4. Update the print job's payment status.
5. Place the job in the printing queue.
6. Make the job eligible for printing.

All these operations must be handled securely and consistently through backend transactions.

Do not allow an unpaid job to enter the authorized printing queue.

---

# 8. QR SCANNER

The QR scanner will use an external USB camera connected to the shop's Windows computer.

The website should access the camera using browser camera permissions.

The owner should have a button to:

- Start Scanner.
- Stop Scanner.

Do not require a separate Windows camera application for the initial implementation.

After scanning:

1. Read the QR token.
2. Send it to the backend for validation.
3. Retrieve the corresponding job.
4. Verify that the job belongs to the authenticated shop.
5. Verify payment.
6. Verify expiration.
7. Verify that the job is not already printing, completed, or cancelled.
8. Display the order details.
9. Allow the owner to proceed with the authorized printing workflow.

Prevent duplicate scans from generating duplicate printing commands.

A QR scan must never directly execute an arbitrary print command.

---

# 9. PRINTING QUEUE MANAGEMENT

Create a dedicated printing queue page.

Separate jobs into:

- Priority Queue.
- Standard Queue.
- Currently Printing.
- Ready for Pickup.
- Failed Printing Jobs.

Display:
- Job reference.
- Customer information, if available.
- Document filename.
- Page count.
- Copies.
- Printing settings.
- Selected services.
- Total amount.
- Priority status.
- Time received.
- Current status.

Queue behavior:

1. Priority jobs are processed first.
2. Standard jobs follow.
3. Jobs within the same priority group follow FIFO ordering.
4. A job already being printed must not be interrupted by a new priority job.
5. Failed jobs can be reviewed and retried by an authorized owner.
6. Retrying a job must create a new print attempt record.

Implement appropriate real-time updates or polling for the queue.

---

# 10. DEVICE MANAGEMENT

Each participating printing shop has its own Windows computer.

That computer runs the QPrint Local Printing Service.

Create a Device Management page for shop owners.

Display:
- Registered computer name.
- Device identifier.
- Operating system.
- Local agent version.
- Connection status.
- Last heartbeat.
- Activation status.

Allow owners to:
- Register a computer.
- View connected computers.
- Deactivate a computer.
- Check service connectivity.

A shop may have multiple registered computers if supported by the architecture.

Each device must be securely associated with its shop.

Never expose device authentication tokens.

The local service must authenticate with the backend using a secure device credential.

---

# 11. PRINTER MANAGEMENT

Create a dedicated Printers page.

Allow shop owners to:

- Register a printer.
- Edit printer information.
- Set a default printer.
- Select printer connection type.
- Set printer availability.
- View connection status.
- View printer capabilities.
- Assign printers to registered Windows computers.

Printer information:

- Printer name.
- Brand.
- Model.
- Printer type.
- Connection type.
- Printer identifier.
- IP address, when applicable.
- Color support.
- Duplex support.
- Supported paper sizes.
- Default printer status.
- Availability status.
- Connection status.

The Local Printing Service should detect or enumerate available Windows printers and report their information to the backend.

Do not assume that registering a printer in the database automatically connects it to the physical printer.

---

# 12. QPRINT LOCAL PRINTING SERVICE

This is a separate Windows application.

Recommended initial technology: Python.

It must be developed separately from the Next.js web application.

Its purpose is to connect the QPrint backend with the shop's Windows printing system.

### Main responsibilities

- Register with QPrint.
- Authenticate the registered shop device.
- Maintain periodic heartbeat communication.
- Receive authorized printing jobs.
- Retrieve the assigned document securely.
- Retrieve the printing settings.
- Identify the selected printer.
- Submit the document to Windows Print Spooler.
- Report print submission and error information.
- Report printer availability and connectivity.

### Important communication rules

The Local Printing Service must not accept arbitrary print commands from the browser.

It must only process jobs authorized by the QPrint backend.

Use authenticated API communication, secure transport, and short-lived job authorization where appropriate.

Implement job locking and idempotency to prevent duplicate printing.

Do not assume that successful submission to Windows Print Spooler proves that physical printing is complete.

Track the distinction between:
- Job authorized.
- Job downloaded.
- Job submitted to spooler.
- Job completed or confirmed.
- Job failed.

The website should display the latest available printing status.

### Important architecture

The website and local application have different responsibilities:

QPrint Website:
- Customer management.
- Shop management.
- QR generation.
- QR validation.
- Payment confirmation.
- Printing queue.
- Job authorization.

Local Printing Service:
- Windows computer communication.
- Printer detection.
- Document retrieval.
- Print command execution.
- Print attempt reporting.

Do not move customer management, pricing, payments, or QR generation into the local application.

---

# 13. TRANSACTIONS AND REPORTS

Create a transaction management page for shop owners.

Display:
- Receipt number.
- Job reference.
- Customer.
- Payment method.
- Base printing price.
- Additional service costs.
- Priority fee.
- Total amount.
- Payment date.

Reports should include:

- Daily revenue.
- Weekly revenue.
- Monthly revenue.
- Total completed orders.
- Standard versus priority orders.
- Most frequently selected services.
- Payment method breakdown.
- Printing activity.

Provide appropriate date filters and CSV export.

All reports must be scoped to the authenticated shop.

---

# 14. DATABASE INTEGRATION

Use the existing connected MySQL database.

The existing QPrint schema includes these tables:

1. users
2. shops
3. shop_hours
4. shop_services
5. shop_service_prices
6. shop_devices
7. printers
8. shop_priority_settings
9. print_jobs
10. documents
11. print_settings
12. print_job_items
13. payments
14. print_attempts
15. job_status_history
16. transactions

Before implementation:

- Inspect the actual database tables.
- Inspect all columns and relationships.
- Verify the existing database connection.
- Check existing migrations and models.
- Identify missing columns or relationships.
- Avoid creating duplicate tables.
- Do not delete existing data.
- Do not replace the database connection configuration.

Use appropriate migrations, models, relationships, validation, and database transactions.

Use foreign keys and indexes appropriately.

Do not hardcode sample shop prices or business records into production logic.

Shop services and prices must come from the database.

---

# 15. SECURITY REQUIREMENTS

Implement:

- Secure authentication.
- Password hashing.
- Role-based access control.
- Shop-level data isolation.
- Server-side validation.
- Secure document uploads.
- File access authorization.
- QR token validation.
- Device authentication.
- Secure API endpoints.
- Payment authorization.
- Duplicate print prevention.
- Input sanitization.
- Rate limiting where appropriate.
- Protection against unauthorized file access.

Never trust customer-submitted prices, shop IDs, payment statuses, device IDs, or print authorization claims without server-side verification.

---

# 16. USER INTERFACE AND DESIGN REQUIREMENTS

Use a professional, clean, modern interface.

QPrint should feel like a real printing-service platform, not a generic administration template.

Design direction:

- Modern and minimal.
- Clean typography.
- Green as the primary brand color.
- Light neutral backgrounds.
- Clear cards and tables.
- Consistent spacing.
- Responsive layouts.
- Mobile-first customer experience.
- Desktop-friendly shop-owner dashboard.

Customer interface:
- Simple navigation.
- Easy document upload.
- Clear printing settings.
- Easy shop discovery.
- Transparent pricing.
- Prominent QR code.
- Understandable tracking timeline.

Shop-owner interface:
- Sidebar navigation.
- Dashboard cards.
- Organized data tables.
- Search and filtering.
- Status indicators.
- Clear confirmation dialogs.
- Responsive management pages.

Use consistent reusable components.

Avoid unnecessary animations, excessive gradients, and overly complicated layouts.

---

# 17. TECHNICAL DEVELOPMENT REQUIREMENTS

Follow the existing project's Next.js architecture and conventions.

Before writing code:

1. Inspect the project folder structure.
2. Identify the installed Next.js version.
3. Identify the current routing system.
4. Inspect the existing database connection.
5. Inspect the current database schema.
6. Inspect installed dependencies.
7. Identify existing authentication implementation.
8. Identify existing UI components.
9. Identify current API routes and server actions.
10. Identify existing environment variables.

Do not unnecessarily replace working libraries or configurations.

Use:
- Reusable components.
- Clear separation of concerns.
- Proper server-side operations.
- Typed data structures where applicable.
- Consistent error handling.
- Backend validation.
- Database transactions.
- Secure environment variables.

Avoid:
- Hardcoded data.
- Fake successful API responses.
- Mock printing operations presented as real printing.
- Duplicate business logic.
- Exposing database credentials.
- Storing uploaded PDF files inside public directories without access controls.

If a feature requires the separate Local Printing Service, implement the website/backend integration points and clearly identify what still requires the Windows application.

---

# 18. COMPLETE SYSTEM WORKFLOW

The complete system should follow this sequence:

CUSTOMER:

1. Open QPrint.
2. Browse available printing shops.
3. Select a shop.
4. Upload PDF documents.
5. Configure printing preferences.
6. Select available shop services.
7. Choose Standard or Priority Printing.
8. Review the order summary.
9. Submit the print job.
10. Receive a unique QR code.
11. Visit the selected shop.
12. Present the QR code.
13. Pay the shop owner.
14. Wait while the owner confirms payment and scans the QR.
15. Have the document printed.
16. Collect the completed order.

SHOP OWNER:

1. Register a shop.
2. Sign in.
3. Complete shop information.
4. Configure operating hours.
5. Create printing services.
6. Set service prices.
7. Configure Priority Printing.
8. Register the Windows computer.
9. Install and connect the Local Printing Service.
10. Register available printers.
11. Monitor the device connection.
12. Receive customer print jobs.
13. Confirm customer payment.
14. Activate the external QR scanner.
15. Scan and validate the QR code.
16. Authorize printing.
17. Monitor the printing queue.
18. Handle printing errors.
19. Mark jobs ready for pickup after the appropriate completion confirmation.
20. Manage transactions and reports.

---

# 19. FINAL DEVELOPMENT EXPECTATIONS

Treat QPrint as a complete, interconnected platform.

All features must eventually communicate with the same backend and database.

Do not create isolated pages with nonfunctional buttons.

Every form must have appropriate validation and persistence.

Every dashboard must retrieve actual database information.

Every customer order must be associated with its selected shop.

Every shop-owner operation must respect shop-level authorization.

Every print job must have a secure QR reference and complete order history.

Every printing command must be authorized by the backend and executed through the registered Local Printing Service.

The Local Printing Service must remain a separate Windows application, while the main QPrint website remains the central platform.

**For this master prompt, your first responsibility is to understand the existing project and establish the implementation architecture. Do not attempt to implement every feature simultaneously. Prepare the system structure, identify dependencies, and wait for my specific implementation tasks. I will provide the development breakdown one feature at a time.**