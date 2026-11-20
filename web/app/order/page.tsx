"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PDFDocument } from "pdf-lib";
import * as mammoth from "mammoth";
import JSZip from "jszip";

type PriceOption = {
  serviceId: number;
  serviceName: string;
  priceId: number;
  colorMode: "black_white" | "colored";
  price: number;
};
type ShopService = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  pricingType: string;
  options: Array<{ optionName: string | null; colorMode: "black_white" | "colored"; price: number }>;
};
type Shop = {
  id: number;
  name: string;
  description: string | null;
  address: string;
  contactNumber: string | null;
  priorityEnabled: boolean;
  priorityFee: number;
  paperSizes: string[];
  prices: PriceOption[];
  services: ShopService[];
};
type PageRange = { start: number; end: number };
type DocumentItem = { file: File; pageCount: number; pageRanges: PageRange[]; previewUrl: string; previewHtml?: string };
type OrderResult = {
  jobCode: string;
  qrToken: string;
  shopName: string;
  status: string;
  expiresAt: string;
  price: { printing: string; priority: string; total: string; currency: string };
  documents: { name: string; pages: number }[];
  settings: { paperSize: string; colorMode: string; copies: number; orientation: string; priority: boolean };
};

const steps = ["Choose a shop", "Upload files", "Print settings", "Pickup QR"];
const colorModes = [
  { value: "black_white", label: "Black & white" },
  { value: "colored", label: "Color" },
] as const;
const acceptedFileTypes = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webm";

function extensionOf(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}

function selectedPages(ranges: PageRange[]) {
  return ranges.reduce((total, range) => total + range.end - range.start + 1, 0);
}

function rangesAreValid(document: DocumentItem) {
  return document.pageRanges.length > 0
    && document.pageRanges.every((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 1 && range.end >= range.start && range.end <= document.pageCount)
    && document.pageRanges.every((range, index) => index === 0 || range.start > document.pageRanges[index - 1].end);
}

async function detectDocxPageCount(bytes: ArrayBuffer) {
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) return 1;
  return Math.max(1, (documentXml.match(/lastRenderedPageBreak|w:type="page"/g) ?? []).length + 1);
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
  const [detailsShop, setDetailsShop] = useState<Shop | null>(null);
  const [files, setFiles] = useState<DocumentItem[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [paper, setPaper] = useState("A4");
  const [color, setColor] = useState<"black_white" | "colored">("black_white");
  const [copies, setCopies] = useState(1);
  const [orientation, setOrientation] = useState("portrait");
  const [priority, setPriority] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const shop = shops.find((item) => item.id === selectedShop);
  const visibleShops = useMemo(() => shops.filter((item) => `${item.name} ${item.address}`.toLowerCase().includes(query.toLowerCase())), [shops, query]);
  const paperOptions = shop?.paperSizes ?? ["A4", "A3", "A5", "A2", "A1", "A0", "Short", "Long", "Letter", "Legal"];
  const priceOption = shop?.prices.find((price) => price.colorMode === color);
  const selectedPageCount = files.reduce((sum, document) => sum + selectedPages(document.pageRanges), 0);
  const estimatedPrintTotal = priceOption ? selectedPageCount * copies * priceOption.price : null;
  const estimatedTotal = estimatedPrintTotal === null ? null : estimatedPrintTotal + (priority && shop ? shop.priorityFee : 0);

  useEffect(() => {
    if (!orderResult) {
      return;
    }
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(orderResult.expiresAt).getTime() - Date.now()) / 1000)));
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [orderResult]);

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

  useEffect(() => {
    if (!detailsShop) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsShop(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailsShop]);

  async function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setError("");
    setIsReading(true);
    const accepted: DocumentItem[] = [];
    let addedBytes = 0;
    for (const file of Array.from(incoming)) {
      const extension = extensionOf(file.name);
      if (![".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webm"].includes(extension)) {
        setError(`${file.name} is not supported. Choose PDF, Word, JPG, PNG, or WEBM files.`);
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
        const bytes = await file.arrayBuffer();
        const parsed = extension === ".pdf" ? await PDFDocument.load(bytes) : null;
        const pageCount = parsed?.getPageCount() ?? (extension === ".docx" ? await detectDocxPageCount(bytes) : 1);
        if (!pageCount) throw new Error("This PDF has no pages.");
        const previewUrl = URL.createObjectURL(file);
        const previewHtml = extension === ".docx"
          ? (await mammoth.convertToHtml({ arrayBuffer: bytes })).value
          : undefined;
        accepted.push({ file, pageCount, pageRanges: [{ start: 1, end: 1 }], previewUrl, previewHtml });
        addedBytes += file.size;
      } catch {
        setError(`${file.name} could not be opened. It may be damaged or password-protected.`);
      }
    }
    setFiles((current) => {
      const merged = [...current, ...accepted].filter((item, index, all) => all.findIndex((other) => other.file.name === item.file.name && other.file.size === item.file.size) === index);
      if (merged.length > 5) setError("You can upload up to 5 files per order.");
      return merged.slice(0, 5);
    });
    if (fileInput.current) fileInput.current.value = "";
    setIsReading(false);
  }

  function continueTo(next: number) {
    setError("");
    if (step === 0 && !selectedShop) return setError("Choose a print shop to continue.");
    if (step === 1 && files.length === 0) return setError("Upload at least one file to continue.");
    if (step === 1 && files.some((document) => !rangesAreValid(document))) return setError("Check each page range. Ranges must be ordered, non-overlapping, and within the file's page count.");
    if (step === 2 && (!priceOption || priceOption.price <= 0)) return setError("This shop has not configured a price for that printing mode.");
    if (step === 2 && (!Number.isInteger(copies) || copies < 1 || copies > 999)) return setError("Copies must be a whole number between 1 and 999.");
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
      form.set("priority", String(priority));
      form.set("quotedTotalCents", String(Math.round((estimatedTotal ?? 0) * 100)));
      form.set("pageRanges", JSON.stringify(files.map((document) => document.pageRanges)));
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
    setPreviewIndex(0);
    setPreviewPage(1);
    setPaper("A4");
    setColor("black_white");
    setCopies(1);
    setOrientation("portrait");
    setPriority(false);
    setOrderResult(null);
    setError("");
  }

  function updatePageRange(documentIndex: number, rangeIndex: number, field: "start" | "end", value: number) {
    setFiles((current) => current.map((document, index) => {
      if (index !== documentIndex) return document;
      const pageRanges = document.pageRanges.map((range, currentRangeIndex) => currentRangeIndex === rangeIndex ? { ...range, [field]: value } : range);
      return { ...document, pageRanges };
    }));
  }

  function addPageRange(documentIndex: number) {
    setFiles((current) => current.map((document, index) => index === documentIndex
      ? { ...document, pageRanges: [...document.pageRanges, { start: Math.min(document.pageCount, (document.pageRanges[document.pageRanges.length - 1]?.end ?? 1) + 1), end: document.pageCount }] }
      : document));
  }

  function removePageRange(documentIndex: number, rangeIndex: number) {
    setFiles((current) => current.map((document, index) => index === documentIndex
      ? { ...document, pageRanges: document.pageRanges.filter((_, currentRangeIndex) => currentRangeIndex !== rangeIndex) }
      : document));
  }

  function previewFile(index: number, page = 1) {
    setPreviewIndex(index);
    setPreviewPage(Math.max(1, Math.min(page, files[index]?.pageCount ?? 1)));
    window.requestAnimationFrame(() => previewRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  function removeFile(target: DocumentItem) {
    URL.revokeObjectURL(target.previewUrl);
    const next = files.filter((item) => item !== target);
    setFiles(next);
    setPreviewIndex((index) => Math.min(index, Math.max(0, next.length - 1)));
    setPreviewPage(1);
  }

  function clampPageRange(documentIndex: number, rangeIndex: number, field: "start" | "end") {
    setFiles((current) => current.map((document, index) => {
      if (index !== documentIndex) return document;
      const pageRanges = document.pageRanges.map((range, currentRangeIndex) => {
        if (currentRangeIndex !== rangeIndex) return range;
        const value = Math.min(document.pageCount, Math.max(1, Math.trunc(Number(range[field])) || 1));
        return field === "start" ? { start: Math.min(value, range.end), end: range.end } : { start: range.start, end: Math.max(value, range.start) };
      });
      return { ...document, pageRanges };
    }));
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
                return <button key={item.id} type="button" className={`shop-option ${selectedShop === item.id ? "selected" : ""}`} onClick={() => setDetailsShop(item)} aria-haspopup="dialog" aria-label={`Open ${item.name} services and details`}>
                  <span className={`shop-avatar ${shopTone(item.id)}`}>{shopInitials(item.name)}</span><span className="shop-info"><span className="shop-name-row"><strong>{item.name}</strong>{item.priorityEnabled && <span className="shop-priority-label">Priority available</span>}</span><span className="shop-address">{item.address}</span><span className="shop-meta">From {formatPHP(startingPrice)} / page · {item.services.length} {item.services.length === 1 ? "service" : "services"}</span><span className="shop-view-link">Click to see services and pricing</span></span><span className="shop-choice"><span /></span>
                </button>;
              })}</div>
              {detailsShop && <div className="shop-detail-backdrop" onClick={() => setDetailsShop(null)}>
                <section className="shop-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-detail-title" onClick={(event) => event.stopPropagation()}>
                  <button type="button" className="shop-detail-close" onClick={() => setDetailsShop(null)} aria-label="Close shop details">×</button>
                  <div className="shop-detail-identity"><span className={`shop-avatar ${shopTone(detailsShop.id)}`}>{shopInitials(detailsShop.name)}</span><div><span className="step-overline">SHOP DETAILS</span><h2 id="shop-detail-title">{detailsShop.name}</h2></div></div>
                  <p className="shop-detail-address">{detailsShop.address}</p>
                  {detailsShop.contactNumber && <p className="shop-detail-contact">{detailsShop.contactNumber}</p>}
                  {detailsShop.description && <p className="shop-detail-description">{detailsShop.description}</p>}
                  <div className="shop-detail-services-heading"><h3>Services offered</h3><span>{detailsShop.services.length}</span></div>
                  <div className="shop-detail-services">{detailsShop.services.map((service) => <article className="shop-detail-service" key={service.id}>
                    <div className="shop-detail-service-title"><strong>{service.name}</strong><span>{service.category.replaceAll("_", " ")} · {service.pricingType.replaceAll("_", " ")}</span></div>
                    {service.description && <p>{service.description}</p>}
                    <div className="shop-detail-price-list">{service.options.map((option, index) => <div className="shop-detail-price" key={`${service.id}-${index}`}><span>{option.colorMode === "black_white" ? "Black & white" : "Colored"}</span><strong>{formatPHP(option.price)} / page</strong></div>)}</div>
                  </article>)}</div>
                  <button type="button" className="shop-detail-select" onClick={() => { setSelectedShop(detailsShop.id); if (!detailsShop.prices.some((price) => price.colorMode === color)) setColor("black_white"); if (!detailsShop.priorityEnabled) setPriority(false); setError(""); setDetailsShop(null); }}>Choose this shop <span>→</span></button>
                </section>
              </div>}
              {error && <p className="inline-error" role="alert">{error}</p>}
              <div className="selected-shop-note"><span>✓</span> {shop ? <>Selected: <strong>{shop.name}</strong></> : "Choose a shop to see its supported options"}</div>
            </>}

            {step === 1 && <>
              <div className="card-heading"><div><span className="step-overline">STEP 02 · YOUR DOCUMENTS</span><h2>Upload your files</h2><p>Add the documents you want {shop?.name ?? "this shop"} to print.</p></div><span className="card-heading-icon">↥</span></div>
              <div className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}>
                <input ref={fileInput} type="file" accept={acceptedFileTypes} multiple onChange={(event) => void addFiles(event.target.files)} aria-label="Choose print files" />
                <span className="upload-icon">↥</span><strong>{isReading ? "Checking your files…" : "Drop your files here"}</strong><span>or <button type="button" disabled={isReading} onClick={() => fileInput.current?.click()}>browse files</button> from your device</span><small>PDF, Word, JPG, PNG, or WEBM · Up to 20 MB each · 5 files per order</small>
              </div>
              {files.length > 0 && <div className="uploaded-files">
                <div className="file-list-heading"><strong>Your documents <span>{files.length}</span></strong><small>Page selections checked before ordering</small></div>
                {files.map((item, index) => <div className="uploaded-file" key={`${item.file.name}-${item.file.size}`}>
                  <span className="pdf-tile">{extensionOf(item.file.name).replace(".", "").toUpperCase()}</span>
                  <div className="uploaded-file-main">
                    <div className="uploaded-file-top">
                      <div className="uploaded-file-info"><strong title={item.file.name}>{item.file.name}</strong><small>{(item.file.size / (1024 * 1024)).toFixed(2)} MB · {item.pageCount} {item.pageCount === 1 ? "page" : "pages"} · {selectedPages(item.pageRanges)} selected</small></div>
                      <div className="uploaded-file-actions">
                        <button type="button" className={`preview-file-button ${previewIndex === index ? "active" : ""}`} onClick={() => previewFile(index)}>Preview</button>
                        <button type="button" className="remove-file-button" aria-label={`Remove ${item.file.name}`} onClick={() => removeFile(item)}>×</button>
                      </div>
                    </div>
                    <div className="page-range-editor">
                      <span className="page-range-label">Print pages</span>
                      {item.pageRanges.map((range, rangeIndex) => <span className="page-range-row" key={`${index}-${rangeIndex}`}>
                        <input type="number" min="1" max={item.pageCount} inputMode="numeric" value={range.start} aria-label={`Start page for range ${rangeIndex + 1} of ${item.file.name}`} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updatePageRange(index, rangeIndex, "start", Number(event.target.value))} onBlur={() => clampPageRange(index, rangeIndex, "start")} />
                        <span className="range-sep">–</span>
                        <input type="number" min="1" max={item.pageCount} inputMode="numeric" value={range.end} aria-label={`End page for range ${rangeIndex + 1} of ${item.file.name}`} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updatePageRange(index, rangeIndex, "end", Number(event.target.value))} onBlur={() => clampPageRange(index, rangeIndex, "end")} />
                        {item.pageRanges.length > 1 && <button type="button" onClick={() => removePageRange(index, rangeIndex)} aria-label={`Remove page range ${rangeIndex + 1}`}>×</button>}
                      </span>)}
                      <button type="button" className="add-page-range" onClick={() => addPageRange(index)}>+ Add range</button>
                    </div>
                  </div>
                </div>)}
              </div>}
              {files.length > 0 && files[previewIndex] && (() => {
                const previewDocument = files[previewIndex];
                const previewExtension = extensionOf(previewDocument.file.name);
                const isPaged = previewExtension === ".pdf";
                return <div className="file-preview" ref={previewRef}>
                  <div className="file-list-heading">
                    <div className="preview-heading-info"><strong title={previewDocument.file.name}>{previewDocument.file.name}</strong><small>{isPaged ? `Page ${previewPage} of ${previewDocument.pageCount}` : previewExtension === ".webm" ? "Video preview" : `${previewDocument.pageCount} ${previewDocument.pageCount === 1 ? "page" : "pages"}`}</small></div>
                    {isPaged && <div className="preview-page-nav">
                      <button type="button" disabled={previewPage <= 1} onClick={() => setPreviewPage((page) => Math.max(1, page - 1))} aria-label="Previous page">‹</button>
                      <span className="preview-page-count">Page {previewPage} / {previewDocument.pageCount}</span>
                      <button type="button" disabled={previewPage >= previewDocument.pageCount} onClick={() => setPreviewPage((page) => Math.min(previewDocument.pageCount, page + 1))} aria-label="Next page">›</button>
                    </div>}
                  </div>
                  <div className="preview-frame">
                    {previewExtension === ".pdf" && <iframe key={`${previewDocument.file.name}-${previewPage}`} title={`Preview of ${previewDocument.file.name}`} src={`${previewDocument.previewUrl}#page=${previewPage}&view=FitH`} />}
                    {[".jpg", ".jpeg", ".png"].includes(previewExtension) && <img src={previewDocument.previewUrl} alt={`Preview of ${previewDocument.file.name}`} />}
                    {previewExtension === ".webm" && <video controls src={previewDocument.previewUrl} />}
                    {previewExtension === ".docx" && <iframe className="word-preview" title={`Preview of ${previewDocument.file.name}`} sandbox="" srcDoc={previewDocument.previewHtml ?? "<p>Word preview is unavailable in this browser.</p>"} />}
                    {previewExtension === ".doc" && <p>Preview is unavailable for legacy .doc files. The file can still be submitted for printing.</p>}
                  </div>
                </div>;
              })()}
              <div className="upload-privacy"><span>♧</span><p>Files are checked again on the server and saved outside the public website folder. For PDF and Word files, select one or more page ranges to print.</p></div>
            </>}

            {step === 2 && <>
              <div className="card-heading"><div><span className="step-overline">STEP 03 · PRINT PREFERENCES</span><h2>Set up your print</h2><p>Only settings with prices at {shop?.name} are selectable.</p></div><span className="card-heading-icon">☷</span></div>
              <div className="settings-group"><label className="field-label" htmlFor="paper-size">PAPER SIZE</label><select id="paper-size" value={paper} onChange={(event) => setPaper(event.target.value)}>{paperOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
              <div className="settings-grid"><div className="settings-group"><label className="field-label">COLOR MODE</label><div className="choice-row">{colorModes.map((mode) => <button type="button" key={mode.value} className={`choice-chip ${color === mode.value ? "chosen" : ""}`} onClick={() => setColor(mode.value)}>{mode.label} · {formatPHP(shop?.prices.find((price) => price.colorMode === mode.value)?.price ?? 0)}/page</button>)}</div></div><div className="settings-group"><label className="field-label" htmlFor="orientation">ORIENTATION</label><select id="orientation" value={orientation} onChange={(event) => setOrientation(event.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></div><div className="settings-group"><label className="field-label" htmlFor="copies">COPIES</label><input id="copies" type="number" min="1" max="999" step="1" value={copies} onChange={(event) => setCopies(Number(event.target.value))} /></div></div>
              <div className="processing-choice-group"><span className="field-label">PROCESSING</span><button type="button" className={`processing-choice ${!priority ? "chosen" : ""}`} onClick={() => setPriority(false)}><span><strong>Standard Processing</strong><small>Free · first come, first served</small></span><b>Free</b></button>{shop?.priorityEnabled && <button type="button" className={`processing-choice ${priority ? "chosen" : ""}`} onClick={() => setPriority(true)}><span><strong>Priority Processing</strong><small>Processed ahead of standard waiting orders; no exact completion time is guaranteed.</small></span><b>+{formatPHP(shop.priorityFee)}</b></button>}</div>
              {error && <p className="inline-error" role="alert">{error}</p>}
              <div className="settings-note"><span>i</span> All {selectedPageCount} pages · price uses the selected color mode and copies. Paper size and orientation do not add charges.</div>
            </>}

            {step === 3 && !orderResult && <>
              <div className="card-heading"><div><span className="step-overline">STEP 04 · REVIEW</span><h2>Review your print order</h2><p>Check the shop, files, settings, and total before creating the job.</p></div><span className="card-heading-icon">▦</span></div>
              <div className="review-shop"><span className={`shop-avatar ${shop ? shopTone(shop.id) : "sage"}`}>{shop ? shopInitials(shop.name) : "QP"}</span><span><strong>{shop?.name}</strong><small>{shop?.address}</small></span><button type="button" onClick={() => setStep(0)}>Change</button></div>
              <div className="review-files">{files.map((item) => <div className="review-file" key={`${item.file.name}-${item.file.size}`}><span>{item.file.name}</span><strong>All {item.pageCount} pages</strong></div>)}</div>
              <div className="order-summary"><div><span>Print settings</span><strong>{paper} · {color === "black_white" ? "Black & white" : "Color"} · {orientation} · {copies} {copies === 1 ? "copy" : "copies"}</strong></div>{priority && <div><span>Priority printing</span><strong>{formatPHP(shop?.priorityFee ?? 0)}</strong></div>}<div><span>Printing ({selectedPageCount * copies} pages)</span><strong>{estimatedPrintTotal === null ? "Unavailable" : formatPHP(estimatedPrintTotal)}</strong></div><div className="order-total"><span>Total due at shop</span><strong>{estimatedTotal === null ? "Unavailable" : formatPHP(estimatedTotal)}</strong></div></div>
              <p className="payment-reminder">Payment is made at the selected shop. Creating this order reserves a QR pickup reference and starts it as awaiting payment.</p>
            </>}

            {step === 3 && orderResult && <>
              <div className="card-heading"><div><span className="step-overline">ORDER CREATED · AWAITING PAYMENT</span><h2>Your pickup QR code</h2><p>Present this code at the selected shop and pay there.</p></div><span className="card-heading-icon">▦</span></div>
              <div className="qr-preview-card"><div className="qr-preview-top"><span className="status-pending"><i /> Awaiting payment</span><span className="demo-tag">{orderResult.jobCode}</span></div><div className="qr-code-frame"><QRCodeSVG id="pickup-qr" value={JSON.stringify({ jobCode: orderResult.jobCode, qrToken: orderResult.qrToken })} size={184} level="H" includeMargin fgColor="#1c4934" bgColor="#ffffff" /></div><strong className="qr-reference">{orderResult.jobCode}</strong><span className="qr-reference-hint">Keep this QR code available for the shop to scan.</span><div className={`document-countdown ${secondsLeft < 300 ? "urgent" : ""}`}><span>Files and QR expire in</span><strong>{Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:{(secondsLeft % 60).toString().padStart(2, "0")}</strong></div><div className="qr-shop-summary"><span className={`shop-avatar ${shop ? shopTone(shop.id) : "sage"}`}>{shop ? shopInitials(shop.name) : "QP"}</span><span><strong>{orderResult.shopName}</strong><small>{shop?.address}</small></span></div><button type="button" className="qr-download" onClick={downloadQRCode}>Download QR code</button></div>
              <div className="order-summary"><div><span>Processing</span><strong>{orderResult.settings.priority ? "Priority Processing" : "Standard Processing"}</strong></div><div><span>Printing</span><strong>{formatPHP(orderResult.price.printing)}</strong></div>{Number(orderResult.price.priority) > 0 && <div><span>Priority fee</span><strong>{formatPHP(orderResult.price.priority)}</strong></div>}<div className="order-total"><span>Total due at shop</span><strong>{formatPHP(orderResult.price.total)}</strong></div><div><span>Expires</span><strong>{new Date(orderResult.expiresAt).toLocaleDateString()}</strong></div></div>
              <p className="payment-reminder">Your order is saved as awaiting payment. The shop confirms payment before it enters the print queue.</p>
            </>}

            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="wizard-actions">{step > 0 && !orderResult && <button type="button" className="back-button" onClick={() => { setError(""); setStep((value) => value - 1); }}>← <span>Back</span></button>}{step === 0 && <span className="wizard-help">Browse shops without an account</span>}{step < 2 && <button type="button" disabled={loadingShops || isReading} className="continue-button" onClick={() => continueTo(step + 1)}>Continue <span>→</span></button>}{step === 2 && <button type="button" className="continue-button" onClick={() => continueTo(3)}>Review order <span>→</span></button>}                        {step === 3 && !orderResult && <button type="button" disabled={isSubmitting || !priceOption || priceOption.price <= 0 || estimatedTotal === null || selectedPageCount < 1 || !Number.isInteger(copies) || copies < 1} className="continue-button" onClick={createOrder}>{isSubmitting ? "Creating order…" : "Place order & generate QR"}<span>→</span></button>}{step === 3 && orderResult && <button type="button" className="continue-button" onClick={startOver}>Start another order <span>↻</span></button>}</div>
          </section>

          <aside className="order-sidebar"><div className="sidebar-shop-card"><span className="sidebar-overline">YOUR SELECTED SHOP</span>{shop ? <><div className={`sidebar-shop-mark ${shopTone(shop.id)}`}>{shopInitials(shop.name)}</div><strong>{shop.name}</strong><span className="sidebar-location">{shop.address}</span><div className="sidebar-shop-divider" /><div className="sidebar-detail"><span>Starting price</span><b>{formatPHP(Math.min(...shop.prices.map((price) => price.price)))} / page</b></div><div className="sidebar-detail"><span>Available paper</span><b>{paperOptions.join(", ")}</b></div><div className="sidebar-detail"><span>Priority printing</span><b>{shop.priorityEnabled ? formatPHP(shop.priorityFee) : "Unavailable"}</b></div>{step < 2 && <button className="change-shop" type="button" onClick={() => setStep(0)}>Change shop <span>↗</span></button>}</> : <div className="sidebar-empty"><span>⌖</span><strong>Choose your shop first</strong><small>Your shop details and options will appear here.</small></div>}</div><div className="sidebar-help"><span className="help-icon">?</span><div><strong>Need a hand?</strong><p>Pick your shop first. You can go back and change your choices anytime.</p></div></div><div className="demo-disclaimer">ORDER STATUS <span>Payment is made in person at the selected print shop.</span></div></aside>
        </div>
        <footer className="order-footer"><Link href="/">← Back to QPrint</Link><span>QPrint · A simpler way to print</span></footer>
      </section>
    </main>
  );
}
