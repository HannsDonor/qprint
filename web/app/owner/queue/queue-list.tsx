"use client";

import { useEffect, useState } from "react";

type QueueJob = {
  id: number; job_code: string; print_type: "priority" | "standard"; priorityFee: number;
  totalPrice: number; document_name: string | null; position: number | null; status: "printing" | "queued";
};

function money(amount: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

export default function QueueList({ initialQueue }: { initialQueue: QueueJob[] }) {
  const [queue, setQueue] = useState(initialQueue);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/owner/queue", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not refresh the queue.");
        setQueue(body.queue as QueueJob[]);
        setError("");
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : "Could not refresh the queue.");
      }
    };
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentJob = queue.find((job) => job.status === "printing");
  const waitingJobs = queue.filter((job) => job.status === "queued");
  return <section className="queue-panel"><div className="panel-heading"><div><span className="panel-overline">PAID ORDERS ONLY</span><h2>Active printing queue</h2></div><span className="recent-total">{waitingJobs.length} waiting</span></div>{error && <p className="inline-error" role="alert">{error}</p>}{currentJob && <div className="current-printing-card"><span className="current-printing-pulse" /><div><span className="panel-overline">CURRENTLY PRINTING</span><strong>{currentJob.job_code}</strong><small>{currentJob.document_name ?? "Document"} · {currentJob.print_type === "priority" ? "Priority" : "Standard"}</small></div><b>{money(currentJob.totalPrice)}</b></div>}{waitingJobs.length ? <div className="queue-list">{waitingJobs.map((job) => <article className={`queue-job ${job.print_type}`} key={job.id}><span className="queue-position">#{job.position}</span><div className="queue-job-main"><strong>{job.job_code}</strong><span>{job.document_name ?? "Document"}</span></div><span className={`queue-badge ${job.print_type}`}>{job.print_type === "priority" ? "Priority" : "Standard"}</span><div className="queue-job-amount">{job.print_type === "priority" && <small>+{money(job.priorityFee)} priority fee</small>}<strong>{money(job.totalPrice)}</strong></div></article>)}</div> : !currentJob && <div className="owner-empty-state"><span>≋</span><strong>No paid jobs waiting</strong><p>Awaiting-payment orders stay out of this active queue.</p></div>}{currentJob && !waitingJobs.length && <div className="queue-empty-followup">No other paid jobs are waiting.</div>}<p className="queue-refresh-note">Queue refreshes automatically. Priority only affects waiting jobs; a job already printing is never interrupted.</p></section>;
}
