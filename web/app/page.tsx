const steps = [
  { number: "01", title: "Choose a shop", text: "Find a local print shop that fits your location, timing, and budget." },
  { number: "02", title: "Set up your print", text: "Upload a PDF, choose your paper and print settings, then review the price." },
  { number: "03", title: "Pick up with QR", text: "Bring your QR code to the shop. Pay there, then collect your finished prints." },
];

const features = [
  { icon: "↥", title: "Upload in a few clicks", text: "Send your PDF securely before you leave home. No USB drive needed." },
  { icon: "◫", title: "Print it your way", text: "Choose paper size, color, copies, orientation, and double-sided printing." },
  { icon: "₱", title: "Know the price upfront", text: "See shop-specific pricing and any priority fee before placing your order." },
  { icon: "⌖", title: "Shops close to you", text: "Compare local print shops, their services, and the options they support." },
  { icon: "▦", title: "One QR for pickup", text: "Keep your job reference handy and let the shop retrieve your order." },
  { icon: "◷", title: "Follow your order", text: "Check your job’s progress from payment through ready for pickup." },
];

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="arrow-icon"><path d="M4 10h11M10 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>;
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="QPrint home"><BrandMark /><span>qprint<span className="brand-period">.</span></span></a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#why-qprint">Why QPrint</a>
          <a href="#shop-owners">For print shops</a>
        </nav>
        <div className="header-actions">
          <a className="text-link sign-in-link" href="/login">Sign in</a>
          <a className="button button-small button-dark" href="/order">Get started <ArrowIcon /></a>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Mobile navigation"><a href="#home">Home</a><a href="#how-it-works">How it works</a><a href="#why-qprint">Why QPrint</a><a href="#shop-owners">For print shops</a></nav>

      <section className="hero section-wrap" id="home">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> LOCAL PRINTING, MADE SIMPLE</div>
          <h1>Your documents,<br />printed <span>without<br className="mobile-break" /> the hassle.</span></h1>
          <p className="hero-description">Send your files ahead, choose a nearby print shop, and pick everything up with one simple QR code.</p>
          <div className="hero-actions" id="customer-start">
            <a className="button button-green" href="/order">Find a print shop <ArrowIcon /></a>
            <a className="button button-outline" href="#how-it-works"><span className="play-icon">↗</span> See how it works</a>
          </div>
          <div className="social-proof"><div className="avatar-stack" aria-hidden="true"><span>M</span><span>A</span><span>J</span></div><p><strong>A better way to print.</strong><br />Made for busy days and nearby shops.</p></div>
        </div>

        <div className="hero-visual" aria-label="Illustration of placing a print order and collecting it with a QR code">
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="visual-caption"><span className="caption-dot" /> YOUR PRINTING, IN MOTION</div>
          <div className="paper-sheet sheet-back" />
          <div className="paper-sheet sheet-front">
            <div className="doc-top"><span className="doc-icon">PDF</span><span className="doc-more">···</span></div>
            <div className="doc-title">Project<br />proposal</div>
            <div className="doc-line line-long" /><div className="doc-line line-medium" />
            <div className="doc-chart"><span /><span /><span /><span /><span /><span /><span /></div>
            <div className="doc-line line-long lower-line" /><div className="doc-line line-short" />
            <div className="doc-page">01 <span>/ 08</span></div>
          </div>
          <div className="print-badge"><span className="badge-check">✓</span><span><strong>Ready when you are</strong><small>Your file is good to go</small></span></div>
          <div className="qr-card"><div className="qr-pattern" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div><strong>Pickup made easy</strong><small>One scan at the shop</small></div><ArrowIcon /></div>
          <div className="hero-spark spark-a">✳</div><div className="hero-spark spark-b">✳</div>
          <div className="visual-bottom-note"><span>01</span><span className="note-line" /><span>UPLOAD&nbsp; · &nbsp;PRINT&nbsp; · &nbsp;PICK UP</span></div>
        </div>
        <a className="scroll-hint" href="#how-it-works"><span className="scroll-mouse" /> Scroll to explore</a>
      </section>

      <section className="trust-strip" aria-label="QPrint benefits"><div className="trust-inner"><p>THE PRINTING RUNAROUND, REPLACED</p><span><b>↗</b> No last-minute rush</span><span><b>⌕</b> No shop-to-shop guessing</span><span><b>▣</b> No files lost on a USB</span></div></section>

      <section className="how-section section-wrap" id="how-it-works">
        <div className="section-heading"><div><div className="eyebrow eyebrow-green">A FEW SIMPLE STEPS</div><h2>From file to finished.<br /><span>That’s the whole process.</span></h2></div><p>Get your printing sorted before you arrive. Then collect it on your schedule, at the shop you chose.</p></div>
        <div className="steps-grid">{steps.map((step, index) => <article className="step-card" key={step.number}><div className="step-top"><span className="step-number">{step.number}</span><span className="step-symbol">{["⌖", "☷", "▦"][index]}</span></div><h3>{step.title}</h3><p>{step.text}</p>{index < 2 && <span className="step-connector" aria-hidden="true">⟶</span>}</article>)}</div>
      </section>

      <section className="features-section" id="why-qprint"><div className="section-wrap features-inner"><div className="section-heading feature-heading"><div><div className="eyebrow eyebrow-green">A LITTLE MORE PEACE OF MIND</div><h2>Printing that fits<br />into <span>your day.</span></h2></div><p>All the useful details, in one place. So you can get on with everything else.</p></div><div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.title}><div className="feature-icon">{feature.icon}</div><h3>{feature.title}</h3><p>{feature.text}</p><span className="feature-accent" /></article>)}</div></div></section>

      <section className="owner-section section-wrap" id="shop-owners"><div className="owner-panel"><div className="owner-decoration owner-decoration-one" /><div className="owner-decoration owner-decoration-two" /><div className="owner-copy"><div className="eyebrow owner-eyebrow"><span className="eyebrow-dot" /> FOR LOCAL PRINT SHOPS</div><h2>More time for the<br />work <span>that matters.</span></h2><p>Bring your shop online. Manage services and pricing, keep your print queue organized, and make pickup simple for every customer.</p><a className="button button-light" href="/register/shop">Register your shop <ArrowIcon /></a></div><div className="owner-dashboard" id="shop-owner-details"><div className="dashboard-top"><span className="dashboard-mark"><BrandMark /></span><span className="dashboard-label">TODAY AT YOUR SHOP</span><span className="live-pill"><i /> LIVE</span></div><div className="dashboard-total"><div><small>Orders in queue</small><strong>Made simple</strong></div><span className="queue-icon">≋</span></div><div className="mini-queue"><div className="queue-row"><span className="queue-dot priority-dot" /><span className="queue-title">Priority print</span><span className="queue-state">Next up</span></div><div className="queue-row"><span className="queue-dot" /><span className="queue-title">Document print</span><span className="queue-state">In queue</span></div><div className="queue-row"><span className="queue-dot" /><span className="queue-title">A3 color copies</span><span className="queue-state">In queue</span></div></div><div className="dashboard-footer"><span>Services &amp; pricing</span><span>Shop settings <b>↗</b></span></div></div></div></section>

      <section className="closing-cta section-wrap"><div><div className="eyebrow eyebrow-green">READY WHEN YOU ARE</div><h2>Make your next print run<br /><span>a little easier.</span></h2></div><a className="button button-green" href="/order">Find your print shop <ArrowIcon /></a></section>

      <footer className="site-footer"><div className="footer-main"><a className="brand footer-brand" href="#home"><BrandMark /><span>qprint<span className="brand-period">.</span></span></a><p>Less running around.<br />More getting things done.</p><nav className="footer-links" aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#why-qprint">About QPrint</a><a href="#shop-owners">For print shops</a></nav><a className="footer-top" href="#home">Back to top ↑</a></div><div className="footer-bottom"><span>© 2026 QPrint. Printing, made a little simpler.</span><span>Built for your neighborhood.</span></div></footer>
    </main>
  );
}
