"use client";

import { useCallback, useEffect, useState } from "react";
import { ThinkingPanel } from "@/components/ThinkingPanel";
import { IcpView } from "@/components/IcpView";
import { AccountGrid, SignalFeed } from "@/components/AccountGrid";
import { CompetitorPanel } from "@/components/CompetitorPanel";
import { HitlQueue } from "@/components/HitlQueue";
import { Analytics, GraphInsights, PipelineBoard } from "@/components/Pipeline";
import { DEMO_INTAKE } from "@/lib/fixtures/demo";
import type { ApprovalRecord, Company, Competitor, DispatchRecord, IcpDefinition, IcpExpansion, Lead, LeadStage, OutreachMessage, Person, Signal } from "@/lib/types";

interface StateResponse {
  mode: string;
  providers: Record<string, boolean>;
  counts: Record<string, number>;
  graph: { nodeCount: number; edgeCount: number };
  ledger: { balance: number; granted: number; consumed: number };
  llm: { calls: number; costUsd: number };
}

export default function Workspace() {
  const [description, setDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [productName, setProductName] = useState("");
  const [features, setFeatures] = useState("");
  const [acv, setAcv] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [icp, setIcp] = useState<IcpDefinition | null>(null);
  const [expansions, setExpansions] = useState<IcpExpansion[]>([]);
  const [state, setState] = useState<StateResponse | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryNote, setDiscoveryNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [graphResults, setGraphResults] = useState<any[]>([]);
  const [stage, setStage] = useState<string | null>(null);

  async function refreshPipeline() {
    const res = await fetch("/api/pipeline").catch(() => null);
    if (res?.ok) {
      const d = await res.json();
      setLeads(d.leads);
      setAnalytics(d);
      if (d.people?.length) setPeople(d.people);
    }
  }

  async function step(label: string, fn: () => Promise<void>) {
    setStage(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStage(null);
      refreshState();
      refreshPipeline();
    }
  }

  const findBuyers = () =>
    step("Finding and enriching buyers…", async () => {
      const res = await fetch("/api/buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrich: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setPeople(d.people);
      setLeads(d.leads);
    });

  const draftOutreach = () =>
    step("Drafting and reviewing sequences…", async () => {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant: "signal_led", review: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessages(d.messages);
    });

  const runGraph = () =>
    step("Running multi-hop graph queries…", async () => {
      const res = await fetch("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setGraphResults(d.results);
    });

  async function hitlDecide(
    messageId: string,
    action: "approve" | "edit_and_approve" | "reject",
    payload?: { editedBody?: string; rejectionReason?: string },
  ) {
    const res = await fetch("/api/hitl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, messageId, ...payload }),
    });
    const d = await res.json();
    if (!res.ok) return setError(d.error);
    setMessages(d.messages);
    setApprovals(d.approvals);
    refreshState();
  }

  async function hitlDispatch(messageId: string) {
    const res = await fetch("/api/hitl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dispatch", messageId }),
    });
    const d = await res.json();
    // A 403 here is the gate doing its job, so it is surfaced as such.
    if (!res.ok) return setError(d.gate ? `Gate refused: ${d.error}` : d.error);
    setMessages(d.messages);
    setDispatches(d.dispatches);
    setLeads(d.leads ?? leads);
    refreshState();
    refreshPipeline();
  }

  async function moveLead(personId: string, to: LeadStage) {
    const res = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId, to, actor: "sales_rep", actorName: "Kaushik (rep)" }),
    });
    if (res.ok) refreshPipeline();
  }

  async function topUp() {
    await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: 300 }),
    });
    refreshState();
  }

  const refreshState = useCallback(async () => {
    const res = await fetch("/api/state").catch(() => null);
    if (res?.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    refreshState();
    const t = setInterval(refreshState, 4000);
    return () => clearInterval(t);
  }, [refreshState]);

  useEffect(() => {
    // Rehydrate on load so a page refresh mid-demo does not lose the run.
    (async () => {
      const [d, o, p] = await Promise.all([
        fetch("/api/discovery").then((r) => r.json()).catch(() => null),
        fetch("/api/outreach").then((r) => r.json()).catch(() => null),
        fetch("/api/pipeline").then((r) => r.json()).catch(() => null),
      ]);
      if (d?.companies?.length) {
        setCompanies(d.companies);
        setSignals(d.signals ?? []);
        setCompetitors(d.competitors ?? []);
        setPeople(d.people ?? []);
      }
      if (o?.messages?.length) {
        setMessages(o.messages);
        setApprovals(o.approvals ?? []);
        setDispatches(o.dispatches ?? []);
      }
      if (p?.leads?.length) {
        setLeads(p.leads);
        setAnalytics(p);
        if (p.people?.length) setPeople(p.people);
      }
      const icpRes = await fetch("/api/icp").then((r) => r.json()).catch(() => null);
      if (icpRes?.icps?.length) {
        setIcp(icpRes.icps[icpRes.icps.length - 1]);
        setExpansions(icpRes.expansions ?? []);
      }
    })();
  }, []);

  function loadSeed() {
    setCompanyName(DEMO_INTAKE.companyName);
    setProductName(DEMO_INTAKE.productName);
    setDescription(DEMO_INTAKE.description);
    setFeatures(DEMO_INTAKE.features.join("\n"));
    setAcv(DEMO_INTAKE.averageContractValue ?? "");
  }

  async function runIntake() {
    setRunning(true);
    setError(null);
    setIcp(null);
    setExpansions([]);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          productName,
          description,
          features: features.split("\n").map((f) => f.trim()).filter(Boolean),
          referenceCustomers: [],
          averageContractValue: acv,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setIcp(json.icp);
      setExpansions(json.expansions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      refreshState();
    }
  }

  async function approve() {
    if (!icp) return;
    const res = await fetch("/api/icp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_icp", icpId: icp.id }),
    });
    if (res.ok) setIcp((await res.json()).icp);
  }

  async function runDiscovery() {
    if (!icp) return;
    setDiscovering(true);
    setError(null);
    setDiscoveryNote(null);
    try {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icpId: icp.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Discovery failed (${res.status})`);
      setCompanies(json.companies ?? []);
      setSignals(json.signals ?? []);
      setCompetitors(json.competitors ?? []);
      setDiscoveryNote(
        `${json.resultsSeen} sources searched · ${json.companies.length} accounts kept · ${json.droppedUncited} dropped for having no citation`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
      refreshState();
    }
  }

  async function decide(id: string, decision: "accepted" | "adjusted" | "dismissed") {
    const res = await fetch("/api/icp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decide_expansion", expansionId: id, decision }),
    });
    if (res.ok) {
      const { expansion } = await res.json();
      setExpansions((prev) => prev.map((e) => (e.id === expansion.id ? expansion : e)));
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white" style={{ borderColor: "var(--color-rule)" }}>
        <div className="max-w-[88rem] mx-auto px-5 py-3 flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h1 className="display" style={{ fontSize: "1.375rem" }}>
              Grapevine
            </h1>
            <span className="rule-label">Graph-native GTM engine</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap grid-surface" style={{ fontSize: "0.75rem" }}>
            {state && (
              <>
                <ProviderDots providers={state.providers} />
                <Stat label="graph" value={`${state.graph.nodeCount}n / ${state.graph.edgeCount}e`} />
                <Stat label="credits" value={`${state.ledger.balance}/${state.ledger.granted}`} />
                <Stat label="llm spend" value={`$${state.llm.costUsd.toFixed(4)}`} />
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[88rem] mx-auto px-5 py-6 grid gap-6" style={{ gridTemplateColumns: "minmax(0,1fr) 23rem" }}>
        <div className="flex flex-col gap-6 min-w-0">
          <section className="border rounded-lg bg-white" style={{ borderColor: "var(--color-rule)" }}>
            <header
              className="px-4 py-3 border-b flex items-center justify-between gap-4"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <div>
                <h2 className="display" style={{ fontSize: "1.25rem" }}>
                  Describe what you sell
                </h2>
                <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
                  Plain English. Everything downstream is inferred from this, and the
                  confidence scores will tell you how much of it was guesswork.
                </p>
              </div>
              <button
                onClick={loadSeed}
                className="mono px-2.5 py-1.5 rounded border shrink-0"
                style={{ borderColor: "var(--color-rule-strong)", color: "var(--color-ink-soft)" }}
              >
                load example
              </button>
            </header>

            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 10rem" }}>
                <Input label="Company" value={companyName} onChange={setCompanyName} placeholder="Acme Inc" />
                <Input label="Product" value={productName} onChange={setProductName} placeholder="Acme Platform" />
                <Input label="Avg contract value" value={acv} onChange={setAcv} placeholder="$18,000 ARR" />
              </div>

              <label className="flex flex-col gap-1">
                <span className="rule-label">What does it do, and who has bought it?</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="We sell a close-management tool to mid-market finance teams. Controllers use it to cut their month-end close from 9 days to 3. Our best customers are 80–300 person SaaS companies with a real accounting team..."
                  className="px-3 py-2 rounded border resize-y"
                  style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.875rem" }}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="rule-label">Key capabilities — one per line</span>
                <textarea
                  value={features}
                  onChange={(e) => setFeatures(e.target.value)}
                  rows={3}
                  className="px-3 py-2 rounded border resize-y mono"
                  style={{ borderColor: "var(--color-rule-strong)" }}
                />
              </label>

              {error && (
                <p
                  className="px-3 py-2 rounded"
                  style={{ background: "var(--color-alarm-soft)", color: "var(--color-alarm)", fontSize: "0.8125rem" }}
                >
                  {error}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={runIntake}
                  disabled={running || description.trim().length < 40}
                  className="px-4 py-2 rounded font-medium disabled:opacity-40"
                  style={{ background: "var(--color-vine)", color: "white", fontSize: "0.875rem" }}
                >
                  {running ? "Inferring profile…" : "Infer ICP"}
                </button>
                <span style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
                  {running
                    ? "Watch the thinking panel — every step is streamed as it happens."
                    : "Runs ICP inference, then proposes adjacent segments with live evidence."}
                </span>
              </div>
            </div>
          </section>

          {icp && (
            <IcpView
              icp={icp}
              expansions={expansions}
              onApprove={approve}
              onDecideExpansion={decide}
              busy={running}
            />
          )}

          {icp && (
            <section
              className="border rounded-lg bg-white px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <div>
                <h2 className="display" style={{ fontSize: "1.125rem" }}>
                  Discover accounts and buyers
                </h2>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
                  {icp.status === "approved"
                    ? discoveryNote ??
                      "Fans out across several search angles, extracts only accounts the sources actually name, and scores each against the approved profile."
                    : "Blocked: approve the profile above first. Discovery will not spend a provider call against an unapproved ICP."}
                </p>
              </div>
              <button
                onClick={runDiscovery}
                disabled={discovering || icp.status !== "approved"}
                className="px-4 py-2 rounded font-medium disabled:opacity-40 shrink-0"
                style={{ background: "var(--color-vine)", color: "white", fontSize: "0.875rem" }}
              >
                {discovering ? "Searching…" : "Run discovery"}
              </button>
            </section>
          )}

          {companies.length > 0 && (
            <AccountGrid
              companies={companies}
              signals={signals}
              selectedId={selected}
              onSelect={setSelected}
            />
          )}
          {signals.length > 0 && <SignalFeed signals={signals} companies={companies} />}
          {competitors.length > 0 && <CompetitorPanel competitors={competitors} />}

          {companies.length > 0 && (
            <section
              className="border rounded-lg bg-white px-4 py-3.5"
              style={{ borderColor: "var(--color-rule)" }}
            >
              <h2 className="display" style={{ fontSize: "1.125rem" }}>
                Run the rest of the pipeline
              </h2>
              <p className="mb-2.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
                {stage ??
                  "Each step is gated on the one before it. Enrichment is also gated on credits — watch the balance in the header."}
              </p>
              <div className="flex gap-2 flex-wrap items-center">
                {[
                  { label: "Find & enrich buyers", fn: findBuyers, on: true },
                  { label: "Draft outreach", fn: draftOutreach, on: people.length > 0 },
                  { label: "Run graph queries", fn: runGraph, on: people.length > 0 },
                ].map((b) => (
                  <button
                    key={b.label}
                    onClick={b.fn}
                    disabled={Boolean(stage) || !b.on}
                    className="px-3.5 py-2 rounded font-medium disabled:opacity-40"
                    style={{ background: "var(--color-vine)", color: "white", fontSize: "0.875rem" }}
                  >
                    {b.label}
                  </button>
                ))}
                <button
                  onClick={topUp}
                  className="px-3 py-2 rounded border ml-auto"
                  style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.8125rem" }}
                  title="Flexprice credit top-up — unblocks gated enrichment"
                >
                  + 300 credits
                </button>
              </div>
            </section>
          )}

          {messages.length > 0 && (
            <HitlQueue
              messages={messages}
              people={people}
              approvals={approvals}
              dispatches={dispatches}
              onDecide={hitlDecide}
              onDispatch={hitlDispatch}
              busy={Boolean(stage)}
            />
          )}

          {graphResults.length > 0 && <GraphInsights results={graphResults} />}

          {leads.length > 0 && (
            <PipelineBoard leads={leads} people={people} companies={companies} onMove={moveLead} />
          )}
          {analytics && leads.length > 0 && <Analytics data={analytics} />}
        </div>

        <div className="min-w-0">
          <ThinkingPanel running={running || discovering || Boolean(stage)} />
        </div>
      </main>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="rule-label">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 rounded border"
        style={{ borderColor: "var(--color-rule-strong)", fontSize: "0.875rem" }}
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="rule-label">{label}</span>
      <span className="mono">{value}</span>
    </span>
  );
}

/** Which integrations are actually live, so nothing is claimed that is not wired. */
function ProviderDots({ providers }: { providers: Record<string, boolean> }) {
  const order = ["anthropic", "tavily", "hunter", "resend", "neo4j", "flexprice", "band"];
  return (
    <span className="flex items-center gap-1.5">
      {order.map((k) => (
        <span
          key={k}
          title={`${k}: ${providers[k] ? "configured" : "not configured — falls back"}`}
          className="mono px-1.5 py-0.5 rounded"
          style={{
            background: providers[k] ? "var(--color-vine-soft)" : "var(--color-rule)",
            color: providers[k] ? "var(--color-vine)" : "var(--color-ink-faint)",
            fontSize: "0.625rem",
            letterSpacing: "0.04em",
          }}
        >
          {k.slice(0, 4)}
        </span>
      ))}
    </span>
  );
}
