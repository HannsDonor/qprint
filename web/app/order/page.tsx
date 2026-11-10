"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PDFDocument } from "pdf-lib";

type PriceOption = {
  serviceId: number;
  serviceName: string;
  priceId: number;
  optionName: string | null;
  paperSize: string | null;
  colorMode: "black_white" | "colored" | null;
  duplex: boolean | null;
  price: number;
};
type Shop = {
  id: number;
  name: string;
  description: string | null;
  address: string;
  contactNumber: string | null;
  priorityEnabled: boolean;
  priorityFee: number;
  prices: PriceOption[];
};
type DocumentItem = { file: File; pageCount: number };
type OrderResult = {
  jobCode: string;
  qrToken: string;
  shopName: string;
  status: string;
  expiresAt: string;
  price: { printing: string; priority: string; total: string; currency: string };
  documents: { name: string; pages: number }[];
  settings: { paperSize: string; colorMode: string; copies: number; pageRange: string | null; orientation: string; duplex: boolean; priority: boolean };
};

const steps = ["Choose a shop", "Upload files", "Print settings", "Pickup QR"];
const colorModes = [
  { value: "black_white", label: "Black & white" },
  { value: "colored", label: "Color" },
] as const;

function countRange(range: string, pageCount: number) {
  if (!range.trim()) return pageCount;
  const pages = new Set<number>();
  for (const segment of range.split(",")) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(segment.trim());
    if (!match) return 0;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > pageCount) return 0;
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return pages.size;
}

function formatPHP(amount: number | string) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(amount));
}

function shopInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function shopTone(id: number) {
  return ["sage", "peach", "blue"][id % 3];
}

export default function OrderPage() {
  const [step, setStep] = useState(0);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loadingShops, setLoadingShops] = useState(true);
  const [shopsError, setShopsError] = useState("");
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const [files, setFiles] = useState<DocumentItem[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [paper, setPaper] = useState("A4");
  const [color, setColor] = useState<"black_white" | "colored">("black_white");
  const [copies, setCopies] = useState(1);
  const [orientation, setOrientation] = useState("portrait");
  const [duplex, setDuplex] = useState(false);
  const [priority, setPriority] = useState(false);
  const [pageRange, setPageRange] = useState("");
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const shop = shops.find((item) => item.id === selectedShop);
  const visibleShops = useMemo(() => shops.filter((item) => `${item.name} ${item.address}`.toLowerCase().includes(query.toLowerCase())), [shops, query]);
  const paperOptions = useMemo(() => [...new Set(shop?.prices.map((price) => price.paperSize).filter((value): value is string => Boolean(value)) ?? [])], [shop]);
  const availableColors = useMemo(() => colorModes.filter((mode) => shop?.prices.some((price) => price.paperSize === paper && price.colorMode === mode.value)), [shop, paper]);
  const priceOption = shop?.prices.find((price) => price.paperSize === paper && price.colorMode === color && price.duplex === duplex)
    ?? shop?.prices.find((price) => price.paperSize === paper && price.colorMode === color && price.duplex === null);
  const duplexSupported = Boolean(shop?.prices.some((price) => price.paperSize === paper && price.colorMode === color && price.duplex === true));
  const selectedPageCount = files.reduce((sum, document) => sum + countRange(pageRange, document.pageCount), 0);
  const estimatedPrintTotal = priceOption ? selectedPageCount * copies * priceOption.price : null;
  const estimatedTotal = estimatedPrintTotal === null ? null : estimatedPrintTotal + (priority && shop ? shop.priorityFee : 0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/shops", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load print shops.");
        setShops(body.shops as Shop[]);
        setShopsError("");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setShopsError(loadError instanceof Error ? loadError.message : "Could not load print shops.");
      })
      .finally(() => setLoadingShops(false));
    return () => controller.abort();
  }, []);

  async function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setError("");
    setIsReading(true);
    const accepted: DocumentItem[] = [];
    let addedBytes = 0;
    for (const file of Array.from(incoming)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setError(`${file.name} is not a PDF. Please select PDF files only.`);
        continue;
      }
      if (file.size < 1 || file.size > 20 * 1024 * 1024) {
        setError(`${file.name} must be smaller than 20 MB.`);
        continue;
      }
      if (files.reduce((sum, item) => sum + item.file.size, 0) + addedBytes + file.size > 50 * 1024 * 1024) {
        setError("The total upload limit for an order is 50 MB.");
        continue;
      }
      try {
        const parsed = await PDFDocument.load(await file.arrayBuffer());
        const pageCount = parsed.getPageCount();
        if (!pageCount) throw new Error("This PDF has no pages.");
        accepted.push({ file, pageCount });
        addedBytes += file.size;
      } catch {
        setError(`${file.name} could not be opened. It may be damaged or password-protected.`);
      }
    }
    setFiles((current) => {
      const merged = [...current, ...accepted].filter((item, index, all) => all.findIndex((other) => other.file.name === item.file.name && other.file.size === item.file.size) === index);
      if (merged.length > 5) setError("You can upload up to 5 PDFs per order.");
      return merged.slice(0, 5);
    });
    if (fileInput.current) fileInput.current.value = "";
    setIsReading(false);
  }

  function continueTo(next: number) {
    setError("");
    if (step === 0 && !selectedShop) return setError("Choose a print shop to continue.");
    if (step === 1 && files.length === 0) return setError("Upload at least one PDF to continue.");
    if (step === 2 && !priceOption) return setError("This shop does not offer that print combination. Choose a supported option.");
    if (step === 2 && pageRange && files.some((document) => countRange(pageRange, document.pageCount) === 0)) return setError("Enter a valid page range for every document.");
    setStep(next);
  }

  async function createOrder() {
    if (!shop) return;
    setError("");
    setIsSubmitting(true);
    try {
      const form = new FormData();
      form.set("shopId", String(shop.id));
      form.set("paperSize", paper);
      form.set("colorMode", color);
      form.set("copies", String(copies));
      form.set("orientation", orientation);
      form.set("pageRange", pageRange);
      form.set("duplex", String(duplex));
      form.set("priority", String(priority));
      form.set("quotedTotalCents", String(Math.round((estimatedTotal ?? 0) * 100)));
      for (const document of files) form.append("documents", document.file, document.file.name);
      const response = await fetch("/api/orders", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409 && String(body.error).includes("price changed")) {
          const shopResponse = await fetch("/api/shops", { cache: "no-store" });
          if (shopResponse.ok) {
            const current = await shopResponse.json();
            setShops(current.shops as Shop[]);
          }
        }
        throw new Error(body.error ?? "Could not create the order.");
      }
      setOrderResult(body as OrderResult);
      setError("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadQRCode() {
    const svg = document.getElementById("pickup-qr");
    if (!(svg instanceof SVGSVGElement)) return;
    const source = new XMLSerializer().serializeToString(svg);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${orderResult?.jobCode ?? "qprint-pickup"}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function startOver() {
    setStep(0);
    setSelectedShop(null);
    setFiles([]);
    setPaper("A4");
    setColor("black_white");
    setCopies(1);
    setOrientation("portrait");
    setDuplex(false);
    setPriority(false);
    setPageRange("");
    setOrderResult(null);
    setError("");
  }

  return (
    <main className="order-page">
      <header className="order-header">
        <Link href="/" className="order-brand" aria-label="QPrint home"><span className="order-brand-mark"><i /><i /><i /><i /></span><span>qprint<span>.</span></span></Link>
        <div className="order-header-note"><span className="safe-lock">♧</span> Your print order, step by step</div>
        <Link className="order-exit" href="/">Exit order <span>×</span></Link>
      </header>

      <section className="order-shell">
        <div className="order-heading">
          <div className="order-kicker"><span /> START A PRINT ORDER</div>
          <h1>Let’s get it <em>printed.</em></h1>
          <p>Choose a shop, add your documents, and set up your print. You’ll review everything before pickup.</p>
        </div>
        <nav className="order-progress" aria-label="Order progress">
          {steps.map((label, index) => <div className={`progress-step ${index === step ? "active" : ""} ${index < step ? "complete" : ""}`} key={label}>
            <span className="progress-number">{index < step ? "✓" : `0${index + 1}`}</span><span className="progress-label">{label}</span>{index < steps.length - 1 && <span className="progress-line" />}
          </div>)}
        </nav>

        <div className="order-content">
          <section className="order-main-card">
            {step === 0 && <>
              <div className="card-heading"><div><span className="step-overline">STEP 01 · LOCATION</span><h2>Choose your print shop</h2><p>Pick where you’d like to collect your order.</p></div><span className="card-heading-icon">⌖</span></div>
              <label className="shop-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by shop or area" aria-label="Search shops" /><span className="shop-search-count">{shops.length} shops</span></label>
              {loadingShops && <div className="shop-list-message">Loading print shops…</div>}
              {!loadingShops && shopsError && <div className="shop-list-message shop-load-error" role="alert">{shopsError}<button type="button" onClick={() => { setLoadingShops(true); setShopsError(""); fetch("/api/shops", { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setShops(body.shops); }).catch((loadError: unknown) => setShopsError(loadError instanceof Error ? loadError.message : "Could not load shops.")).finally(() => setLoadingShops(false)); }}>Try again</button></div>}
              {!loadingShops && !shopsError && visibleShops.length === 0 && <div className="shop-list-message">{shops.length ? "No shops match that search." : "No active shops with printing prices are available yet."}</div>}
              <div className="shop-list">{visibleShops.map((item) => {
                const startingPrice = Math.min(...item.prices.map((price) => price.price));
                return <button key={item.id} type="button" className={`shop-option ${selectedShop === item.id ? "selected" : ""}`} onClick={() => { setSelectedShop(item.id); const first = item.prices[0]; if (!item.prices.some((price) => price.paperSize === paper && price.colorMode === color && price.duplex === duplex)) { setPaper(first.paperSize ?? "A4"); setColor(first.colorMode ?? "black_white"); setDuplex(first.duplex ?? false); } if (!item.priorityEnabled) setPriority(false); setError(""); }}>
                  <span className={`shop-avatar ${shopTone(item.id)}`}>{shopInitials(item.name)}</span><span className="shop-info"><span className="shop-name-row"><strong>{item.name}</strong>{item.priorityEnabled && <span className="shop-priority-label">Priority available</span>}</span><span className="shop-address">{item.address}</span><span className="shop-meta">From {formatPHP(startingPrice)} / page{item.priorityEnabled ? ` · Priority ${formatPHP(item.priorityFee)}` : ""}</span></span><span className="shop-choice"><span /></span>
                </button>;
              })}</div>
              {error && <p className="inline-error" role="alert">{error}</p>}
              <div className="selected-shop-note"><span>✓</span> {shop ? <>Selected: <strong>{shop.name}</strong></> : "Choose a shop to see its supported options"}</div>
            </>}

            {step === 1 && <>
              <div className="card-heading"><div><span className="step-overline">STEP 02 · YOUR DOCUMENTS</span><h2>Upload your PDFs</h2><p>Add the documents you want {shop?.name ?? "this shop"} to print.</p></div><span className="card-heading-icon">↥</span></div>
              <div className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}>
                <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple onChange={(event) => void addFiles(event.target.files)} aria-label="Choose PDF files" />
                <span className="upload-icon">↥</span><strong>{isReading ? "Checking your PDFs…" : "Drop your PDFs here"}</strong><span>or <button type="button" disabled={isReading} onClick={() => fileInput.current?.click()}>browse files</button> from your device</span><small>PDF only · Up to 20 MB each · 5 files per order</small>
              </div>
              {files.length > 0 && <div className="uploaded-files"><div className="file-list-heading"><strong>Your documents <span>{files.length}</span></strong><small>Page counts checked</small></div>{files.map((item) => <div className="uploaded-file" key={`${item.file.name}-${item.file.size}`}><span className="pdf-tile">PDF</span><span className="uploaded-file-info"><strong>{item.file.name}</strong><small>{(item.file.size / (1024 * 1024)).toFixed(2)} MB · {item.pageCount} {item.pageCount === 1 ? "page" : "pages"}</small></span><button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setFiles((current) => current.filter((file) => file !== item))}>×</button></div>)}</div>}
              <div className="upload-privacy"><span>♧</span><p>PDF contents are checked again on the server. Files are saved outside the public website folder.</p></div>
            </>}

            {step === 2 && <>
              <div className="card-heading"><div><span className="step-overline">STEP 03 · PRINT PREFERENCES</span><h2>Set up your print</h2><p>Only settings with prices at {shop?.name} are selectable.</p></div><span className="card-heading-icon">☷</span></div>
              <div className="settings-group"><label className="field-label">PAPER SIZE</label><div className="choice-row">{paperOptions.map((item) => <button type="button" key={item} className={`choice-chip ${paper === item ? "chosen" : ""}`} onClick={() => { setPaper(item); const nextColor = colorModes.find((mode) => shop?.prices.some((price) => price.paperSize === item && price.colorMode === mode.value)); if (nextColor) setColor(nextColor.value); setDuplex(false); }}>{item}</button>)}</div></div>
              <div className="settings-grid"><div className="settings-group"><label className="field-label" htmlFor="color-mode">COLOR MODE</label><select id="color-mode" value={color} onChange={(event) => { const value = event.target.value as "black_white" | "colored"; setColor(value); if (!shop?.prices.some((price) => price.paperSize === paper && price.colorMode === value && price.duplex === true)) setDuplex(false); }}>{availableColors.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></div><div className="settings-group"><label className="field-label" htmlFor="orientation">ORIENTATION</label><select id="orientation" value={orientation} onChange={(event) => setOrientation(event.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div><div className="settings-group"><label className="field-label" htmlFor="copies">COPIES</label><div className="copies-control"><button type="button" onClick={() => setCopies((value) => Math.max(1, value - 1))} aria-label="Remove a copy">−</button><input id="copies" type="number" min="1" max="99" value={copies} onChange={(event) => setCopies(Math.min(99, Math.max(1, Number(event.target.value) || 1)))} /><button type="button" onClick={() => setCopies((value) => Math.min(99, value + 1))} aria-label="Add a copy">+</button></div></div><div className="settings-group"><label className="field-label" htmlFor="page-range">PAGE RANGE <span>OPTIONAL</span></label><input id="page-range" value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="e.g. 1-4, 7" /></div></div>
              <button type="button" className={`toggle-setting ${duplex ? "toggle-on" : ""}`} disabled={!duplexSupported} onClick={() => setDuplex((value) => !value)} aria-pressed={duplex}><span className="toggle-copy"><strong>Print on both sides</strong><small>{duplexSupported ? "Double-sided printing · shop price applies" : "Not offered by this shop for the selected paper and color"}</small></span><span className="switch"><i /></span></button>
              {shop?.priorityEnabled && <button type="button" className={`priority-setting ${priority ? "priority-on" : ""}`} onClick={() => setPriority((value) => !value)} aria-pressed={priority}><span className="priority-icon">✳</span><span className="toggle-copy"><strong>Priority printing <span className="optional-tag">{formatPHP(shop.priorityFee)} ADD-ON</span></strong><small>Move your order ahead of standard jobs in the queue.</small></span><span className="switch"><i /></span></button>}
              {error && <p className="inline-error" role="alert">{error}</p>}
              <div className="settings-note"><span>i</span> Price is calculated from the shop’s current per-page price and the page count of your selected documents.</div>
            </>}

            {step === 3 && !orderResult && <>
              <div className="card-heading"><div><span className="step-overline">STEP 04 · REVIEW</span><h2>Review your print order</h2><p>Check the shop, files, settings, and total before creating the job.</p></div><span className="card-heading-icon">▦</span></div>
              <div className="review-shop"><span className={`shop-avatar ${shop ? shopTone(shop.id) : "sage"}`}>{shop ? shopInitials(shop.name) : "QP"}</span><span><strong>{shop?.name}</strong><small>{shop?.address}</small></span><button type="button" onClick={() => setStep(0)}>Change</button></div>
              <div className="review-files">{files.map((item) => <div className="review-file" key={`${item.file.name}-${item.file.size}`}><span>{item.file.name}</span><strong>{countRange(pageRange, item.pageCount)} pages</strong></div>)}</div>
              <div className="order-summary"><div><span>Print settings</span><strong>{paper} · {color === "black_white" ? "Black & white" : "Color"} · {copies} {copies === 1 ? "copy" : "copies"}</strong></div><div><span>Finishing</span><strong>{orientation === "portrait" ? "Portrait" : "Landscape"}{duplex ? " · Double-sided" : " · Single-sided"}</strong></div>{priority && <div><span>Priority printing</span><strong>{formatPHP(shop?.priorityFee ?? 0)}</strong></div>}<div><span>Printing ({selectedPageCount * copies} pages)</span><strong>{estimatedPrintTotal === null ? "Unavailable" : formatPHP(estimatedPrintTotal)}</strong></div><div className="order-total"><span>Total due at shop</span><strong>{estimatedTotal === null ? "Unavailable" : formatPHP(estimatedTotal)}</strong></div></div>
              <p className="payment-reminder">Payment is made at the selected shop. Creating this order reserves a QR pickup reference and starts it as awaiting payment.</p>
            </>}

            {step === 3 && orderResult && <>
              <div className="card-heading"><div><span className="step-overline">ORDER CREATED · AWAITING PAYMENT</span><h2>Your pickup QR code</h2><p>Present this code at the selected shop and pay there.</p></div><span className="card-heading-icon">▦</span></div>
              <div className="qr-preview-card"><div className="qr-preview-top"><span className="status-pending"><i /> Awaiting payment</span><span className="demo-tag">{orderResult.jobCode}</span></div><div className="qr-code-frame"><QRCodeSVG id="pickup-qr" value={orderResult.qrToken} size={184} level="H" includeMargin fgColor="#1c4934" bgColor="#ffffff" /></div><strong className="qr-reference">{orderResult.jobCode}</strong><span className="qr-reference-hint">Keep this QR code available for the shop to scan.</span><div className="qr-shop-summary"><span className={`shop-avatar ${shop ? shopTone(shop.id) : "sage"}`}>{shop ? shopInitials(shop.name) : "QP"}</span><span><strong>{orderResult.shopName}</strong><small>{shop?.address}</small></span></div><button type="button" className="qr-download" onClick={downloadQRCode}>Download QR code</button></div>
              <div className="order-summary"><div><span>Printing</span><strong>{formatPHP(orderResult.price.printing)}</strong></div>{Number(orderResult.price.priority) > 0 && <div><span>Priority fee</span><strong>{formatPHP(orderResult.price.priority)}</strong></div>}<div className="order-total"><span>Total due at shop</span><strong>{formatPHP(orderResult.price.total)}</strong></div><div><span>Expires</span><strong>{new Date(orderResult.expiresAt).toLocaleDateString()}</strong></div></div>
              <p className="payment-reminder">Your order is saved as awaiting payment. The shop confirms payment before it enters the print queue.</p>
            </>}

            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="wizard-actions">{step > 0 && !orderResult && <button type="button" className="back-button" onClick={() => { setError(""); setStep((value) => value - 1); }}>← <span>Back</span></button>}{step === 0 && <span className="wizard-help">Browse shops without an account</span>}{step < 2 && <button type="button" disabled={loadingShops || isReading} className="continue-button" onClick={() => continueTo(step + 1)}>Continue <span>→</span></button>}{step === 2 && <button type="button" className="continue-button" onClick={() => continueTo(3)}>Review order <span>→</span></button>}{step === 3 && !orderResult && <button type="button" disabled={isSubmitting || !priceOption || selectedPageCount < 1} className="continue-button" onClick={createOrder}>{isSubmitting ? "Creating order…" : "Place order & generate QR"}<span>→</span></button>}{step === 3 && orderResult && <button type="button" className="continue-button" onClick={startOver}>Start another order <span>↻</span></button>}</div>
          </section>

          <aside className="order-sidebar"><div className="sidebar-shop-card"><span className="sidebar-overline">YOUR SELECTED SHOP</span>{shop ? <><div className={`sidebar-shop-mark ${shopTone(shop.id)}`}>{shopInitials(shop.name)}</div><strong>{shop.name}</strong><span className="sidebar-location">{shop.address}</span><div className="sidebar-shop-divider" /><div className="sidebar-detail"><span>Starting price</span><b>{formatPHP(Math.min(...shop.prices.map((price) => price.price)))} / page</b></div><div className="sidebar-detail"><span>Available paper</span><b>{paperOptions.join(", ")}</b></div><div className="sidebar-detail"><span>Priority printing</span><b>{shop.priorityEnabled ? formatPHP(shop.priorityFee) : "Unavailable"}</b></div>{step < 2 && <button className="change-shop" type="button" onClick={() => setStep(0)}>Change shop <span>↗</span></button>}</> : <div className="sidebar-empty"><span>⌖</span><strong>Choose your shop first</strong><small>Your shop details and options will appear here.</small></div>}</div><div className="sidebar-help"><span className="help-icon">?</span><div><strong>Need a hand?</strong><p>Pick your shop first. You can go back and change your choices anytime.</p></div></div><div className="demo-disclaimer">ORDER STATUS <span>Payment is made in person at the selected print shop.</span></div></aside>
        </div>
        <footer className="order-footer"><Link href="/">← Back to QPrint</Link><span>QPrint · A simpler way to print</span></footer>
      </section>
    </main>
  );
}
