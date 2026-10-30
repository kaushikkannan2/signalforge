"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CommandPalette,
  EmptyState,
  Rail,
  TopBar,
  Toasts,
  type Command,
  type NavItem,
  type Toast,
  type ViewKey,
} from "@/components/Shell";
import { ThinkingPanel } from "@/components/ThinkingPanel";
import { IcpView } from "@/components/IcpView";
import { AccountGrid, SignalFeed } from "@/components/AccountGrid";
import { CompetitorPanel } from "@/components/CompetitorPanel";
import { HitlQueue } from "@/components/HitlQueue";
import { Analytics, GraphInsights, PipelineBoard } from "@/components/Pipeline";
import { RecordDrawer } from "@/components/RecordDrawer";
import { Constellation } from "@/components/Constellation";
import { Learning, type LearningData } from "@/components/Learning";
import { Launch } from "@/components/Launch";
import { Citations, Confidence, TierBadge } from "@/components/Confidence";
import { DEMO_INTAKE } from "@/lib/fixtures/demo";
import type {
  ApprovalRecord,
  Company,
  Competitor,
  DispatchRecord,
  IcpDefinition,
  IcpExpansion,
  Lead,
  LeadStage,
  OutreachMessage,
  Person,
  Signal,
} from "@/lib/types";

export default function Workspace() {
  const [view, setView] = useState<ViewKey>("intake");
  // "launch" is the single-field entry screen; "workspace" is the operating
  // surface. We only leave launch once there is something to operate on.
  const [screen, setScreen] = useState<"launch" | "workspace">("launch");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [icp, setIcp] = useState<IcpDefinition | null>(null);
  const [expansions, setExpansions] = useState<IcpExpansion[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [graphResults, setGraphResults] = useState<any[]>([]);
  const [band, setBand] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [drawer, setDrawer] = useState<{ personId?: string; companyId?: string } | null>(null);
  const [snapshotGraph, setSnapshotGraph] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [graphFocus, setGraphFocus] = useState<string | undefined>();
  const [learning, setLearning] = useState<LearningData | null>(null);
  const [summary, setSummary] = useState<string | undefined>();
  const [expansionPending, setExpansionPending] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);

  // intake form
  const [companyName, setCompanyName] = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState("");
  const [acv, setAcv] = useState("");

  const toast = useCallback((kind: Toast["kind"], title: string, detail?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, title, detail }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  }, []);

  // Fetches only the neighbourhood the constellation will draw, not the whole
  // graph — at production scale the full snapshot is multiple megabytes.
  const loadGraph = useCallback(async (focus?: string) => {
    const qs = focus ? `?focus=${encodeURIComponent(focus)}&hops=2&cap=70` : "?hops=2&cap=70";
    const r = await fetch(`/api/graph${qs}`).then((x) => x.json()).catch(() => null);
    if (r?.nodes) setSnapshotGraph({ nodes: r.nodes, edges: r.edges });
  }, []);

  const loadLearning = useCallback(async () => {
    const r = await fetch("/api/learning").then((x) => x.json()).catch(() => null);
    if (r?.policy) setLearning(r);
  }, []);

  const refreshState = useCallback(async () => {
    const r = await fetch("/api/state").then((x) => x.json()).catch(() => null);
    if (r) setState(r);
  }, []);

  const hydrate = useCallback(async () => {
    const [d, o, p, i, b, bl] = await Promise.all([
      fetch("/api/discovery").then((r) => r.json()).catch(() => null),
      fetch("/api/outreach").then((r) => r.json()).catch(() => null),
      fetch("/api/pipeline").then((r) => r.json()).catch(() => null),
      fetch("/api/icp").then((r) => r.json()).catch(() => null),
      fetch("/api/band").then((r) => r.json()).catch(() => null),
      fetch("/api/billing").then((r) => r.json()).catch(() => null),
    ]);
    if (d) {
      setCompanies(d.companies ?? []);
      setSignals(d.signals ?? []);
      setCompetitors(d.competitors ?? []);
      if (d.people?.length) setPeople(d.people);
    }
    if (o?.messages) {
      setMessages(o.messages);
      setApprovals(o.approvals ?? []);
      setDispatches(o.dispatches ?? []);
    }
    if (p) {
      setLeads(p.leads ?? []);
      setAnalytics(p);
      if (p.people?.length) setPeople(p.people);
    }
    if (i?.icps?.length) {
      const latest = i.icps[i.icps.length - 1];
      setIcp(latest);
      setSummary(i.summaries?.[latest.id]);
      setExpansions(i.expansions ?? []);
      if ((i.expansions ?? []).length) setExpansionPending(false);
      // There is already state to operate on, so skip the entry screen.
      setScreen("workspace");
    }
    if (b) setBand(b);
    if (bl) setBilling(bl);
  }, []);

  useEffect(() => {
    refreshState();
    hydrate();
    loadGraph();
    loadLearning();
    const t = setInterval(refreshState, 5000);
    return () => clearInterval(t);
  }, [refreshState, hydrate, loadGraph, loadLearning]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  async function step(label: string, fn: () => Promise<{ title: string; detail?: string }>) {
    setBusy(label);
    setError(null);
    try {
      const r = await fn();
      toast("ok", r.title, r.detail);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      toast("error", "Step failed", m);
    } finally {
      setBusy(null);
      refreshState();
      hydrate();
      loadLearning();
    }
  }

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `${url} failed (${res.status})`);
    return json;
  };

  const runIntake = () =>
    step("Inferring ICP", async () => {
      const d = await post("/api/intake", {
        companyName,
        productName,
        description,
        features: features.split("\n").map((f) => f.trim()).filter(Boolean),
        referenceCustomers: [],
        averageContractValue: acv,
      });
      setIcp(d.icp);
      setSummary(d.summary);
      setExpansionPending(Boolean(d.expansionPending));
      setExpansions(d.expansions ?? []);
      return {
        title: "ICP inferred",
        detail: `${Math.round(d.icp.overallConfidence * 100)}% overall confidence`,
      };
    });

  /** Launch screen path: one field in, workspace out. */
  const launchFromDescription = (text: string) =>
    step("Inferring ICP", async () => {
      const d = await post("/api/intake", { description: text });
      setIcp(d.icp);
      setSummary(d.summary);
      setExpansionPending(Boolean(d.expansionPending));
      setExpansions(d.expansions ?? []);
      setDescription(text);
      setCompanyName(d.intake.companyName);
      setProductName(d.intake.productName);
      setFeatures((d.intake.features ?? []).join("\n"));
      setAcv(d.intake.averageContractValue ?? "");
      setScreen("workspace");
      setView("intake");
      return {
        title: `${d.intake.productName} — profile inferred`,
        detail: `${Math.round(d.icp.overallConfidence * 100)}% confidence. Adjacent segments still searching.`,
      };
    });

  const launchFromDataset = () =>
    step("Loading prepared dataset", async () => {
      const d = await post("/api/scenario", { scale: 300, credits: 45 });
      await hydrate();
      await loadGraph();
      setIcp(d.icp);
      setScreen("workspace");
      setView("accounts");
      return {
        title: `${d.counts.companies} accounts loaded`,
        detail: `${d.counts.people} buyers · ${d.counts.graphNodes} graph nodes · ${d.loadMs}ms`,
      };
    });

  const seedIntake = () =>
    step("Running seeded intake", async () => {
      const d = await post("/api/intake", { useDemoSeed: true });
      setIcp(d.icp);
      setExpansions(d.expansions ?? []);
      return { title: "ICP inferred from the example product" };
    });

  const clarify = () =>
    step("Finding what would raise confidence", async () => {
      const d = await post("/api/icp", { action: "clarify", icpId: icp!.id });
      setQuestions(d.questions ?? []);
      return {
        title: `${d.questions.length} questions would raise confidence`,
        detail: "Answer what you know — the rest can stay blank.",
      };
    });

  const reinfer = (answers: { question: string; answer: string }[]) =>
    step("Re-inferring with your answers", async () => {
      const d = await post("/api/icp", { action: "reinfer", icpId: icp!.id, answers });
      setIcp(d.icp);
      setQuestions([]);
      await hydrate();
      const delta = Math.round((d.after - d.before) * 100);
      return {
        title: `Confidence ${Math.round(d.before * 100)}% → ${Math.round(d.after * 100)}%`,
        detail: delta > 0 ? `+${delta} points from ${answers.filter((a) => a.answer.trim()).length} answers` : "Those answers did not reduce uncertainty.",
      };
    });

  const approve = () =>
    step("Approving profile", async () => {
      const d = await post("/api/icp", { action: "approve_icp", icpId: icp!.id });
      setIcp(d.icp);
      setView("accounts");
      return { title: "Profile approved", detail: "Discovery unlocked." };
    });

  const runDiscovery = () =>
    step("Searching for accounts", async () => {
      const d = await post("/api/discovery", { icpId: icp!.id });
      setCompanies(d.companies ?? []);
      setSignals(d.signals ?? []);
      setCompetitors(d.competitors ?? []);
      return {
        title: `${d.companies.length} accounts discovered`,
        detail: `${d.resultsSeen} sources · ${d.droppedUncited} dropped for having no citation`,
      };
    });

  const findBuyers = () =>
    step("Finding and enriching buyers", async () => {
      const d = await post("/api/buyers", { enrich: true });
      setPeople(d.people ?? []);
      setLeads(d.leads ?? []);
      setView("buyers");
      return { title: `${d.enrichedCount} contacts enriched`, detail: `Credits left: ${d.ledger?.balance}` };
    });

  const draftOutreach = () =>
    step("Drafting and reviewing sequences", async () => {
      const d = await post("/api/outreach", { variant: "signal_led", review: true });
      setMessages(d.messages ?? []);
      setView("outreach");
      return { title: `${d.messages.length} touches drafted`, detail: "Awaiting your approval." };
    });

  const runGraph = () =>
    step("Running graph queries", async () => {
      const d = await post("/api/graph", {});
      setGraphResults(d.results ?? []);
      setView("graph");
      const n = d.results.reduce((s: number, r: any) => s + r.findings.length, 0);
      return { title: `${n} graph findings`, detail: d.results.map((r: any) => r.queryName).join(", ") };
    });

  const runBand = () =>
    step("Running multi-agent collaboration", async () => {
      const d = await post("/api/band", { brief: "Pre-dispatch review of the current GTM run." });
      setBand((b: any) => ({ ...(b ?? {}), telemetry: d.telemetry }));
      setView("agents");
      const delivered = d.telemetry.transcript.filter((m: any) => m.delivered).length;
      return {
        title: `Band: ${delivered}/${d.telemetry.transcript.length} delivered`,
        detail: `Room ${d.telemetry.room ?? "(not set)"}`,
      };
    });

  const focusGraph = (id: string) => {
    setGraphFocus(id);
    setView("graph");
    loadGraph(id);
  };

  const loadScenario = (scale: number) =>
    step(scale ? `Loading ${scale}-account dataset` : "Loading scenario", async () => {
      const d = await post("/api/scenario", { scale, credits: 45 });
      await hydrate();
      await loadGraph();
      setIcp(d.icp);
      setView("accounts");
      return {
        title: `${d.counts.companies} accounts loaded`,
        detail: `${d.counts.people} buyers · ${d.counts.graphNodes} graph nodes · ${d.loadMs}ms · credits set to ${d.credits} so the gate fires`,
      };
    });

  const resetAll = () =>
    step("Resetting workspace", async () => {
      await post("/api/reset", {});
      setIcp(null);
      setExpansions([]);
      setCompanies([]);
      setSignals([]);
      setCompetitors([]);
      setPeople([]);
      setMessages([]);
      setApprovals([]);
      setDispatches([]);
      setLeads([]);
      setAnalytics(null);
      setGraphResults([]);
      setSnapshotGraph(null);
      setGraphFocus(undefined);
      setLearning(null);
      setDrawer(null);
      setView("intake");
      setScreen("launch");
      return { title: "Workspace empty", detail: "Every stage is unticked. Start the run." };
    });

  const snapshot = () =>
    step("Saving snapshot", async () => {
      const d = await post("/api/snapshot", { action: "save" });
      return { title: "Dataset frozen to disk", detail: JSON.stringify(d.counts) };
    });

  async function hitlDecide(
    messageId: string,
    action: "approve" | "edit_and_approve" | "reject",
    payload?: { editedBody?: string; rejectionReason?: string },
  ) {
    try {
      const d = await post("/api/hitl", { action, messageId, ...payload });
      setMessages(d.messages);
      setApprovals(d.approvals);
      toast(action === "reject" ? "warn" : "ok", `Message ${action.replace(/_/g, " ")}`);
      refreshState();
      // Each gate decision is a reward observation, so the policy moves.
      loadLearning();
    } catch (e) {
      toast("error", "Decision failed", e instanceof Error ? e.message : String(e));
    }
  }

  async function hitlDispatch(messageId: string) {
    try {
      const d = await post("/api/hitl", { action: "dispatch", messageId });
      setMessages(d.messages);
      setDispatches(d.dispatches);
      setLeads(d.leads ?? leads);
      toast("ok", `Dispatched · ${d.dispatch.status}`, `${d.dispatch.provider} → ${d.dispatch.to}`);
      refreshState();
      hydrate();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      // A refusal here is the gate working, and is surfaced as such.
      toast("warn", "Gate refused dispatch", m);
    }
  }

  async function moveLead(personId: string, to: LeadStage) {
    await post("/api/pipeline", { personId, to, actor: "sales_rep", actorName: "Kaushik (rep)" }).catch(() => null);
    hydrate();
    loadLearning();
  }

  const approvedIcp = icp?.status === "approved";
  const nav: NavItem[] = [
    { key: "intake", label: "Product & ICP", glyph: "◇", stage: true, done: Boolean(icp) },
    {
      key: "accounts",
      label: "Accounts",
      glyph: "▤",
      count: companies.length,
      stage: true,
      done: companies.length > 0,
      lockedReason: approvedIcp ? undefined : "Approve the ICP first",
    },
    {
      key: "buyers",
      label: "Buyers",
      glyph: "◉",
      count: people.length,
      stage: true,
      done: people.length > 0,
      lockedReason: companies.length ? undefined : "Discover accounts first",
    },
    {
      key: "graph",
      label: "Graph",
      glyph: "⬡",
      count: graphResults.length,
      lockedReason: people.length ? undefined : "Find buyers first",
    },
    {
      key: "outreach",
      label: "Approval queue",
      glyph: "✉",
      count: messages.filter((m) => m.status === "pending_approval").length,
      stage: true,
      done: messages.length > 0,
      lockedReason: people.length ? undefined : "Find buyers first",
    },
    {
      key: "pipeline",
      label: "Pipeline",
      glyph: "▦",
      count: leads.length,
      stage: true,
      done: dispatches.length > 0,
      lockedReason: leads.length ? undefined : "No leads yet",
    },
    {
      key: "learning",
      label: "Learning",
      glyph: "∿",
      count: learning?.policy.totalPulls ?? 0,
    },
    { key: "agents", label: "Agent room", glyph: "◈" },
    { key: "billing", label: "Usage & billing", glyph: "◧" },
  ];

  // The stepper doubles as navigation: a viewer should be able to see where a
  // run is AND click straight to it, rather than reading a progress bar and
  // then hunting for the matching rail item.
  const stages = [
    { label: "Intake", done: Boolean(icp), onClick: () => setView("intake") },
    { label: "Approved", done: approvedIcp, onClick: () => setView("intake") },
    {
      label: "Accounts",
      done: companies.length > 0,
      active: busy === "Searching for accounts",
      onClick: companies.length ? () => setView("accounts") : undefined,
    },
    {
      label: "Buyers",
      done: people.length > 0,
      active: busy === "Finding and enriching buyers",
      onClick: people.length ? () => setView("buyers") : undefined,
    },
    {
      label: "Outreach",
      done: messages.length > 0,
      active: busy === "Drafting and reviewing sequences",
      onClick: messages.length ? () => setView("outreach") : undefined,
    },
    {
      label: "Approved & sent",
      done: dispatches.length > 0,
      onClick: leads.length ? () => setView("pipeline") : undefined,
    },
  ];

  const commands: Command[] = [
    { id: "c1", label: "Run seeded intake", hint: "ICP", run: seedIntake },
    { id: "c2", label: "Approve profile", hint: "gate", disabled: !icp || approvedIcp, run: approve },
    { id: "c3", label: "Run discovery", hint: "accounts", disabled: !approvedIcp, run: runDiscovery },
    { id: "c4", label: "Find & enrich buyers", hint: "contacts", disabled: !companies.length, run: findBuyers },
    { id: "c5", label: "Draft outreach", hint: "copy", disabled: !people.length, run: draftOutreach },
    { id: "c6", label: "Run graph queries", hint: "cypher", disabled: !people.length, run: runGraph },
    { id: "c7", label: "Run agent collaboration", hint: "band", run: runBand },
    { id: "c7b", label: "Show the learning layer", hint: "policy", run: () => { setView("learning"); loadLearning(); } },
    { id: "c8", label: "Freeze dataset to disk", hint: "snapshot", run: snapshot },
    { id: "d0", label: "Reset workspace — start from empty", hint: "demo", run: resetAll },
    { id: "d1", label: "Load demo scenario (7 narration accounts)", hint: "dataset", run: () => loadScenario(0) },
    { id: "d2", label: "Load scale dataset (300 accounts)", hint: "dataset", run: () => loadScenario(300) },
    { id: "d3", label: "Load stress dataset (1,000 accounts)", hint: "dataset", run: () => loadScenario(1000) },
    { id: "c9", label: "Top up 300 credits", hint: "billing", run: () => step("Topping up", async () => { await post("/api/billing", { credits: 300 }); return { title: "+300 credits" }; }) },
    ...nav.map((n, i) => ({ id: `v${i}`, label: `Go to ${n.label}`, hint: "view", disabled: Boolean(n.lockedReason), run: () => setView(n.key) })),
  ];

  const drawerPerson = people.find((p) => p.id === drawer?.personId);
  const drawerCompany = companies.find(
    (c) => c.id === (drawer?.companyId ?? drawerPerson?.companyId),
  );

  if (screen === "launch") {
    return (
      <>
        <Launch
          onSubmit={launchFromDescription}
          running={busy === "Inferring ICP"}
          error={error}
          onSkipToDemo={launchFromDataset}
        />
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Rail items={nav} active={view} onSelect={setView} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          stages={stages}
          providers={state?.providers ?? {}}
          credits={state?.ledger ?? { balance: 0, granted: 0 }}
          cost={state?.llm?.costUsd ?? 0}
          graph={state?.graph ?? { nodeCount: 0, edgeCount: 0 }}
          mode={state?.mode ?? "demo"}
          busyLabel={busy}
          onReset={resetAll}
        />

        <div className="flex-1 flex min-w-0 overflow-hidden">
          <main className="flex-1 overflow-y-auto px-5 py-4 min-w-0">
            {error && (
              <p
                className="mb-3 px-3 py-2 rounded"
                style={{ background: "var(--color-alarm-soft)", color: "var(--color-alarm)", fontSize: "0.8125rem" }}
              >
                {error}
              </p>
            )}

            {view === "intake" && (
              <div className="flex flex-col gap-5" style={{ maxWidth: "60rem" }}>
                <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
                  <header
                    className="px-4 py-3 border-b flex items-center justify-between gap-3"
                    style={{ borderColor: "var(--color-rule)" }}
                  >
                    <div>
                      <h1 className="display" style={{ fontSize: "1.3125rem" }}>
                        Describe what you sell
                      </h1>
                      <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
                        Plain English. Everything downstream is inferred from this, and the
                        confidence scores will tell you how much was guesswork.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setCompanyName(DEMO_INTAKE.companyName);
                        setProductName(DEMO_INTAKE.productName);
                        setDescription(DEMO_INTAKE.description);
                        setFeatures(DEMO_INTAKE.features.join("\n"));
                        setAcv(DEMO_INTAKE.averageContractValue ?? "");
                      }}
                      className="mono px-2.5 py-1.5 rounded border shrink-0"
                      style={{ borderColor: "var(--color-rule-strong)", color: "var(--color-ink-soft)" }}
                    >
                      load example
                    </button>
                  </header>
                  <div className="px-4 py-4 flex flex-col gap-3">
                    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 10rem" }}>
                      <Field label="Company" value={companyName} onChange={setCompanyName} placeholder="Acme Inc" />
                      <Field label="Product" value={productName} onChange={setProductName} placeholder="Acme Platform" />
                      <Field label="Avg contract value" value={acv} onChange={setAcv} placeholder="$18,000 ARR" />
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="rule-label">What does it do, and who has bought it?</span>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={5}
                        placeholder="We sell a close-management tool to mid-market finance teams. Controllers use it to cut month-end close from 9 days to 3…"
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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={runIntake}
                        disabled={Boolean(busy) || description.trim().length < 40}
                        className="btn-primary px-4 py-2 rounded-md disabled:opacity-40"
                        style={{ fontSize: "0.875rem" }}
                      >
                        {busy === "Inferring ICP" ? "Inferring…" : "Infer ICP"}
                      </button>
                      <span style={{ fontSize: "0.75rem", color: "var(--color-ink-faint)" }}>
                        Watch the thinking panel — every step streams as it happens.
                      </span>
                    </div>
                  </div>
                </section>

                {icp && (
                  <IcpView
                    icp={icp}
                    summary={summary}
                    expansionPending={expansionPending}
                    onClarify={clarify}
                    expansions={expansions}
                    onApprove={approve}
                    onDecideExpansion={async (id, decision) => {
                      const d = await post("/api/icp", { action: "decide_expansion", expansionId: id, decision });
                      setExpansions((prev) => prev.map((e) => (e.id === d.expansion.id ? d.expansion : e)));
                      toast("ok", `Segment ${decision}`);
                    }}
                    busy={Boolean(busy)}
                  />
                )}
              </div>
            )}

            {view === "accounts" && (
              <div className="flex flex-col gap-5">
                <ActionBar
                  title="Accounts"
                  body={
                    companies.length
                      ? `${companies.filter((c) => !c.disqualified).length} qualified · ${companies.filter((c) => c.disqualified).length} disqualified. Click a row for full provenance.`
                      : "Fans out across search angles and keeps only accounts the sources actually name."
                  }
                  actions={[
                    { label: companies.length ? "Re-run discovery" : "Run discovery", onClick: runDiscovery, disabled: !approvedIcp || Boolean(busy) },
                    { label: "Find & enrich buyers", onClick: findBuyers, disabled: !companies.length || Boolean(busy), secondary: true },
                  ]}
                />
                {companies.length ? (
                  <>
                    <AccountGrid
                      companies={companies}
                      signals={signals}
                      onSelect={(id) => setDrawer({ companyId: id })}
                      onFocusGraph={focusGraph}
                    />
                    <SignalFeed signals={signals} companies={companies} />
                    <CompetitorPanel competitors={competitors} />
                  </>
                ) : (
                  <EmptyState
                    title="No accounts yet"
                    body="Discovery is gated on an approved profile. Nothing is searched for against an ICP no human has signed off on."
                    action={{ label: "Run discovery", onClick: runDiscovery, disabled: !approvedIcp }}
                  />
                )}
              </div>
            )}

            {view === "buyers" && (
              <div className="flex flex-col gap-5">
                <ActionBar
                  title="Buyers"
                  body={`${people.filter((p) => p.enrichment.email).length} of ${people.length} contacts resolved. The method column says what each address actually proves.`}
                  actions={[
                    { label: "Find & enrich buyers", onClick: findBuyers, disabled: Boolean(busy) },
                    { label: "Draft outreach", onClick: draftOutreach, disabled: !people.length || Boolean(busy), secondary: true },
                  ]}
                />
                {people.length ? (
                  <BuyerGrid people={people} companies={companies} onSelect={(id) => setDrawer({ personId: id })} />
                ) : (
                  <EmptyState
                    title="No buyers yet"
                    body="Searches each qualified account for people matching your ICP personas, then resolves contact details."
                    action={{ label: "Find & enrich buyers", onClick: findBuyers, disabled: !companies.length }}
                  />
                )}
              </div>
            )}

            {view === "graph" && (
              <div className="flex flex-col gap-5">
                <ActionBar
                  title="Graph reasoning"
                  body="Multi-hop questions a spreadsheet cannot express. Each query is written twice — real Cypher and an in-process traversal — kept adjacent so they cannot drift."
                  actions={[
                    { label: "Run graph queries", onClick: runGraph, disabled: Boolean(busy) },
                    { label: "Refresh graph", onClick: () => loadGraph(graphFocus), secondary: true },
                  ]}
                />
                {snapshotGraph && (
                  <Constellation
                    nodes={snapshotGraph.nodes}
                    edges={snapshotGraph.edges}
                    focusId={graphFocus}
                    onFocus={(id) => {
                      setGraphFocus(id);
                      // Walking the graph refetches the next neighbourhood
                      // rather than paging in the whole thing up front.
                      loadGraph(id);
                    }}
                  />
                )}
                {graphResults.length ? (
                  <GraphInsights results={graphResults} />
                ) : (
                  <EmptyState
                    title="No queries run yet"
                    body="Warm-introduction paths, job-requisition-to-buying-cycle links, and competitor displacement windows."
                    action={{ label: "Run graph queries", onClick: runGraph, disabled: !people.length }}
                  />
                )}
              </div>
            )}

            {view === "outreach" && (
              <div className="flex flex-col gap-5">
                <ActionBar
                  title="Approval queue"
                  body="Nothing leaves without an approval record. Try Send on an unapproved message — the server refuses independently of the button."
                  actions={[{ label: "Draft more sequences", onClick: draftOutreach, disabled: !people.length || Boolean(busy) }]}
                />
                {messages.length ? (
                  <HitlQueue
                    messages={messages}
                    people={people}
                    approvals={approvals}
                    dispatches={dispatches}
                    onDecide={hitlDecide}
                    onDispatch={hitlDispatch}
                    busy={Boolean(busy)}
                  />
                ) : (
                  <EmptyState
                    title="Nothing drafted yet"
                    body="Three touches per buyer across email and LinkedIn, each quoting the specific signal that makes that account in-market."
                    action={{ label: "Draft outreach", onClick: draftOutreach, disabled: !people.length }}
                  />
                )}
              </div>
            )}

            {view === "pipeline" && (
              <div className="flex flex-col gap-5">
                <ActionBar
                  title="Pipeline"
                  body="Drag a card to move it. Your moves are attributed to you; the agent's are attributed to it."
                  actions={[]}
                />
                {leads.length ? (
                  <>
                    <PipelineBoard leads={leads} people={people} companies={companies} onMove={moveLead} />
                    {analytics && <Analytics data={analytics} />}
                  </>
                ) : (
                  <EmptyState title="No leads yet" body="Leads are created when buyers are matched to the approved profile." />
                )}
              </div>
            )}

            {view === "learning" && <Learning data={learning} onRefresh={loadLearning} />}

            {view === "agents" && (
              <AgentRoom band={band} onRun={runBand} busy={Boolean(busy)} />
            )}

            {view === "billing" && <BillingView billing={billing} state={state} onTopUp={() => step("Topping up", async () => { await post("/api/billing", { credits: 300 }); return { title: "+300 credits" }; })} />}
          </main>

          <div className="shrink-0 p-4 pl-0" style={{ width: "22rem" }}>
            <ThinkingPanel running={Boolean(busy)} />
          </div>
        </div>
      </div>

      {drawer && (
        <RecordDrawer
          person={drawerPerson}
          company={drawerCompany}
          signals={signals.filter((s) => s.companyId === drawerCompany?.id)}
          messages={messages.filter((m) => m.personId === drawerPerson?.id)}
          lead={leads.find((l) => l.personId === drawerPerson?.id)}
          onClose={() => setDrawer(null)}
        />
      )}
      <CommandPalette commands={commands} />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </div>
  );
}

/* --- small view pieces ----------------------------------------------------- */

function Field({
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

function ActionBar({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions: { label: string; onClick: () => void; disabled?: boolean; secondary?: boolean }[];
}) {
  return (
    <section
      className="surface px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
      style={{ borderColor: "var(--color-rule)" }}
    >
      <div style={{ maxWidth: "46rem" }}>
        <h1 className="display" style={{ fontSize: "1.3125rem" }}>
          {title}
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>{body}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            disabled={a.disabled}
            className={`${a.secondary ? "btn-ghost" : "btn-primary"} px-3.5 py-2 rounded-md disabled:opacity-40`}
            style={{ fontSize: "0.875rem" }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function BuyerGrid({
  people,
  companies,
  onSelect,
}: {
  people: Person[];
  companies: Company[];
  onSelect: (id: string) => void;
}) {
  const companyOf = (id: string) => companies.find((c) => c.id === id);
  return (
    <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
      <div className="scroll-x">
        <table className="w-full grid-surface" style={{ fontSize: "0.8125rem", minWidth: "58rem" }}>
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-faint)" }}>
              <th className="text-left font-semibold px-3 py-2">Buyer</th>
              <th className="text-left font-semibold px-2 py-2 w-40">Account</th>
              <th className="text-left font-semibold px-2 py-2">Email</th>
              <th className="text-left font-semibold px-2 py-2 w-44">Method</th>
              <th className="text-center font-semibold px-2 py-2 w-16">MX</th>
              <th className="text-left font-semibold px-3 py-2 w-32">Sources</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const c = companyOf(p.companyId);
              const e = p.enrichment;
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.id)}
                  className="border-b cursor-pointer row-hover"
                  style={{ borderColor: "var(--color-rule)" }}
                >
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{p.fullName}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>{p.title}</div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      {c && <TierBadge tier={c.fit.tier} />}
                      <span style={{ fontSize: "0.75rem" }}>{c?.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top mono truncate" style={{ maxWidth: "15rem", color: e.email ? undefined : "var(--color-ink-faint)" }}>
                    {e.email ?? "unresolved"}
                  </td>
                  <td className="px-2 py-2 align-top">
                    {e.emailMethod ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="rule-label px-1.5 py-0.5 rounded"
                          style={{
                            background:
                              e.emailMethod === "hunter_verified" ? "var(--color-vine-soft)" : "var(--color-signal-soft)",
                            color: e.emailMethod === "hunter_verified" ? "var(--color-vine)" : "var(--color-signal)",
                          }}
                        >
                          {e.emailMethod.replace(/_/g, " ")}
                        </span>
                        <Confidence value={e.emailConfidence} compact />
                      </div>
                    ) : (
                      <span className="mono" style={{ color: "var(--color-ink-faint)" }}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top mono text-center" title={e.mxRecords?.join(", ")}>
                    {e.mxValid ? (
                      <span style={{ color: "var(--color-tier-a)" }}>✓</span>
                    ) : (
                      <span style={{ color: "var(--color-alarm)" }}>✕</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Citations evidence={p.evidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AgentRoom({ band, onRun, busy }: { band: any; onRun: () => void; busy: boolean }) {
  const t = band?.telemetry;
  const delivered = (t?.transcript ?? []).filter((m: any) => m.delivered).length;
  return (
    <div className="flex flex-col gap-5">
      <ActionBar
        title="Agent room"
        body={
          band?.room
            ? `Four specialist agents collaborating in the live Band room. ${delivered}/${t?.transcript?.length ?? 0} posts accepted by Band.`
            : "No BAND_ROOM_ID configured — handoffs are recorded locally rather than posted to Band."
        }
        actions={[{ label: "Run collaboration", onClick: onRun, disabled: busy }]}
      />

      <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
        <header className="px-4 py-3 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--color-rule)" }}>
          {(band?.agents ?? []).map((a: any) => (
            <span key={a.role} className="flex items-center gap-1.5" style={{ fontSize: "0.8125rem" }}>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: a.ok ? "var(--color-vine)" : "var(--color-alarm)" }}
              />
              {a.name ?? a.handle}
              <span className="mono" style={{ color: "var(--color-ink-faint)", fontSize: "0.625rem" }}>
                {a.status}
              </span>
            </span>
          ))}
          {t?.llm && (
            <span className="mono ml-auto" style={{ fontSize: "0.6875rem", color: "var(--color-ink-faint)" }}>
              {t.llm.calls} calls · {t.llm.inputTokens + t.llm.outputTokens} tokens · ${t.llm.costUsd}
            </span>
          )}
        </header>
        <ul className="divide-y" style={{ borderColor: "var(--color-rule)" }}>
          {(t?.transcript ?? []).map((m: any) => (
            <li key={m.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rule-label">{m.role}</span>
                <span className="mono" style={{ fontSize: "0.625rem", color: "var(--color-ink-faint)" }}>
                  {m.mentions?.join(" ") || "→ human"}
                </span>
                <span
                  className="rule-label px-1.5 rounded ml-auto"
                  style={{
                    background: m.delivered ? "var(--color-vine-soft)" : "var(--color-rule)",
                    color: m.delivered ? "var(--color-vine)" : "var(--color-ink-faint)",
                  }}
                  title={m.delivered ? "Band accepted this post (HTTP 2xx)" : "Recorded locally only — Band did not accept it"}
                >
                  {m.delivered ? "delivered" : "local only"}
                </span>
              </div>
              <p className="mt-0.5" style={{ fontSize: "0.8125rem", color: "var(--color-ink-soft)" }}>
                {m.body}
              </p>
            </li>
          ))}
          {!t?.transcript?.length && (
            <li className="px-4 py-8 text-center" style={{ color: "var(--color-ink-faint)", fontSize: "0.8125rem" }}>
              No collaboration run yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function BillingView({ billing, state, onTopUp }: { billing: any; state: any; onTopUp: () => void }) {
  const l = state?.ledger ?? billing?.ledger;
  return (
    <div className="flex flex-col gap-5">
      <ActionBar
        title="Usage & billing"
        body={
          billing?.flexprice?.configured
            ? `Metered locally and mirrored to Flexprice. ${billing.flexprice.mirrored} events accepted, ${billing.flexprice.failed} not mirrored.`
            : "Flexprice not configured — events are metered locally only."
        }
        actions={[{ label: "+300 credits", onClick: onTopUp }]}
      />
      <section className="surface px-4 py-3" style={{ borderColor: "var(--color-rule)" }}>
        <div className="flex gap-6 flex-wrap grid-surface">
          {l && (
            <>
              <Stat label="balance" value={`${l.balance}`} />
              <Stat label="granted" value={`${l.granted}`} />
              <Stat label="consumed" value={`${l.consumed}`} />
            </>
          )}
          {l?.unitCosts &&
            Object.entries(l.unitCosts).map(([k, v]) => (
              <Stat key={k} label={k.replace(/_/g, " ")} value={`${v} cr`} />
            ))}
        </div>
      </section>
      <section className="surface" style={{ borderColor: "var(--color-rule)" }}>
        <header className="px-4 py-2.5 border-b" style={{ borderColor: "var(--color-rule)" }}>
          <span className="rule-label">Metered events</span>
        </header>
        <div className="scroll-x">
          <table className="w-full grid-surface" style={{ fontSize: "0.8125rem", minWidth: "40rem" }}>
            <tbody>
              {(billing?.events ?? []).map((e: any) => (
                <tr key={e.id} className="border-b" style={{ borderColor: "var(--color-rule)" }}>
                  <td className="px-3 py-1.5 mono">{e.eventName}</td>
                  <td className="px-2 py-1.5 mono text-right grid-surface">−{e.credits}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className="rule-label px-1.5 rounded"
                      style={{
                        background: e.mirroredToFlexprice ? "var(--color-vine-soft)" : "var(--color-alarm-soft)",
                        color: e.mirroredToFlexprice ? "var(--color-vine)" : "var(--color-alarm)",
                      }}
                      title={e.flexpriceError}
                    >
                      {e.mirroredToFlexprice ? "mirrored" : "not mirrored"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 mono" style={{ color: "var(--color-ink-faint)", fontSize: "0.6875rem" }}>
                    {new Date(e.at).toLocaleTimeString("en-GB", { hour12: false })}
                  </td>
                </tr>
              ))}
              {!billing?.events?.length && (
                <tr>
                  <td className="px-4 py-6 text-center" style={{ color: "var(--color-ink-faint)" }}>
                    No metered events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="rule-label">{label}</span>
      <span className="mono" style={{ fontSize: "1.125rem" }}>
        {value}
      </span>
    </span>
  );
}
