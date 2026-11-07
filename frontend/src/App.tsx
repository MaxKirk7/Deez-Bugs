import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileUp,
  Lightbulb,
  Users,
} from "lucide-react";
import { Analysis, CategorySummary, uploadCsv } from "./api";

const colors = ["#f97316", "#14b8a6", "#6366f1", "#f59e0b", "#ec4899"];

function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(file?: File) {
    if (!file) return;
    setError("");
    setFileName(file.name);
    setLoading(true);
    try {
      setAnalysis(await uploadCsv(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  const modelUser = analysis?.model.users?.[0];
  const categories = useMemo(
    () => [...(analysis?.by_category ?? [])].sort((a, b) => b.total - a.total),
    [analysis],
  );
  const maxMonth = Math.max(...(analysis?.by_month.map((month) => month.total) ?? [1]));

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">D</span><span>deez<span className="brand-accent">.</span>bugs</span></div>
        <div className="topbar-status"><span className="status-dot" /> Spending intelligence <span className="avatar">MB</span></div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">PERSONAL FINANCE / OVERVIEW</p>
          <h1>Know where your money<br /><em>really</em> goes.</h1>
          <p className="hero-copy">Upload your transaction history. We’ll find your spending patterns, place you alongside similar customers, and surface better alternatives.</p>
        </div>
        <UploadCard loading={loading} fileName={fileName} onUpload={handleUpload} />
      </section>

      {error && <div className="error">{error}</div>}

      {!analysis ? (
        <EmptyState />
      ) : (
        <Dashboard
          analysis={analysis}
          modelUser={modelUser}
          categories={categories}
          maxMonth={maxMonth}
        />
      )}
    </main>
  );
}

function UploadCard({ loading, fileName, onUpload }: { loading: boolean; fileName: string; onUpload: (file?: File) => void }) {
  return (
    <label className="upload-card">
      <input type="file" accept=".csv,text/csv" onChange={(event) => onUpload(event.target.files?.[0])} />
      <div className="upload-icon"><FileUp size={21} /></div>
      <strong>{loading ? "Analysing your statement…" : fileName || "Drop your CSV here"}</strong>
      <span>{loading ? "Finding your spending patterns" : "or click to browse · CSV only"}</span>
      <div className="upload-button">{loading ? "Processing" : "Upload statement"} <ArrowUpRight size={16} /></div>
    </label>
  );
}

function EmptyState() {
  return (
    <section className="empty-state">
      <div className="empty-icon"><BarChart3 size={28} /></div>
      <h2>Your spending story starts here.</h2>
      <p>Upload a statement to unlock your category breakdown, customer segment, and personalised merchant recommendations.</p>
      <div className="feature-row">
        <span><CircleDollarSign size={17} /> Spending insights</span>
        <span><Users size={17} /> Similar customers</span>
        <span><Lightbulb size={17} /> Smart alternatives</span>
      </div>
    </section>
  );
}

function Dashboard({ analysis, modelUser, categories, maxMonth }: { analysis: Analysis; modelUser?: NonNullable<Analysis["model"]["users"]>[number]; categories: CategorySummary[]; maxMonth: number }) {
  return (
    <section className="dashboard">
      <div className="section-heading"><div><p className="eyebrow">YOUR SNAPSHOT</p><h2>A clearer view of your habits.</h2></div><span className="period-pill">{analysis.transaction_count} transactions analysed</span></div>
      <div className="metric-grid">
        <Metric label="Total spend" value={money(analysis.total_spend)} detail="Across your statement" accent="orange" />
        <Metric label="Average transaction" value={money(analysis.average_transaction)} detail="Per transaction" accent="teal" />
        <Metric label="Customer segment" value={modelUser ? `Segment ${modelUser.segment + 1}` : "Pending"} detail={modelUser ? `${modelUser.segment_size} similar profiles` : "Train the model first"} accent="purple" />
        <Metric label="Recommendations" value={String(modelUser?.recommendations.length ?? 0)} detail="Matched alternatives" accent="pink" />
      </div>
      <div className="content-grid">
        <section className="panel category-panel">
          <PanelHeading icon={<CircleDollarSign size={18} />} title="Where it goes" subtitle="Spending by category" />
          <div className="category-list">{categories.slice(0, 6).map((category, index) => {
            const name = category.app_category ?? category.category ?? "Other";
            return <div className="category-row" key={name}><div className="category-label"><span className="category-dot" style={{ background: colors[index % colors.length] }} />{name.replaceAll("_", " ")}<small>{category.transaction_count} txns</small></div><strong>{money(category.total)}</strong><div className="bar"><span style={{ width: `${analysis.total_spend ? (category.total / analysis.total_spend) * 100 : 0}%`, background: colors[index % colors.length] }} /></div></div>;
          })}</div>
        </section>
        <section className="panel trend-panel">
          <PanelHeading icon={<BarChart3 size={18} />} title="Spending rhythm" subtitle="Monthly total" />
          <div className="chart">{analysis.by_month.map((month) => <div className="chart-column" key={month.month}><div className="chart-value">{money(month.total)}</div><div className="chart-bar" style={{ height: `${Math.max(14, (month.total / maxMonth) * 150)}px` }} /><span>{month.month.slice(5)}</span></div>)}</div>
        </section>
      </div>
      <div className="content-grid lower">
        <section className="panel segment-panel">
          <PanelHeading icon={<Users size={18} />} title="Your spending circle" subtitle="Customers with similar habits" />
          {modelUser ? <><div className="segment-callout"><div className="segment-number">{modelUser.segment + 1}</div><div><strong>Segment {modelUser.segment + 1}</strong><p>You share patterns with {modelUser.segment_size} customers in the reference set.</p></div></div><div className="similar-list">{modelUser.similar_users.slice(0, 4).map((user) => <div className="similar-row" key={String(user.user_id)}><span className="mini-avatar">{String(user.user_id).slice(-2)}</span><span>Customer {String(user.user_id).slice(-4)}</span><strong>{Math.round(user.similarity * 100)}% match</strong><ChevronRight size={15} /></div>)}</div></> : <p className="muted">Train the reference model to see similar customers.</p>}
        </section>
        <section className="panel recommendation-panel">
          <PanelHeading icon={<Lightbulb size={18} />} title="Worth discovering" subtitle="Used by people like you" />
          {modelUser?.recommendations.length ? <div className="recommendation-list">{modelUser.recommendations.slice(0, 5).map((recommendation) => <div className="recommendation-row" key={recommendation.merchant}><div className="merchant-icon">{recommendation.merchant.slice(0, 1).toUpperCase()}</div><div><strong>{recommendation.merchant.replace("fraud_", "")}</strong><p>{recommendation.category?.replaceAll("_", " ") ?? "Popular choice"} · {recommendation.similar_users} similar customers</p></div><span className="recommendation-score">{Math.round(recommendation.score * 100)}%</span></div>)}</div> : <p className="muted">No recommendations yet. Upload more transaction history or retrain the model.</p>}
        </section>
      </div>
      <div className="insight-note"><CheckCircle2 size={18} /><span><strong>Next step:</strong> Your dashboard is ready. Recommendations are based on spending patterns, not financial judgement.</span></div>
    </section>
  );
}

function Metric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return <div className={`metric metric-${accent}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function PanelHeading({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return <div className="panel-heading"><div className="panel-icon">{icon}</div><div><h3>{title}</h3><p>{subtitle}</p></div></div>;
}

export default App;
