import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useStore } from '../state/store';
import { Layout } from './Layout';
import { Notice, PageHead } from './components/common';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';

const Suppliers = lazy(() => import('./pages/Suppliers'));
const SupplierProfile = lazy(() => import('./pages/SupplierProfile'));
const Families = lazy(() => import('./pages/Families').then((m) => ({ default: m.Families })));
const FamilyDetail = lazy(() => import('./pages/Families').then((m) => ({ default: m.FamilyDetail })));
const EvidenceRegister = lazy(() => import('./pages/EvidenceRegister'));
const Memos = lazy(() => import('./pages/Memos'));
const MemoDetail = lazy(() => import('./pages/MemoDetail'));
const Intake = lazy(() => import('./pages/Intake'));
const Reviews = lazy(() => import('./pages/Reviews'));
const Data = lazy(() => import('./pages/Data'));
const Reports = lazy(() => import('./pages/Reports'));
const Runs = lazy(() => import('./pages/Runs'));
const Rules = lazy(() => import('./pages/Rules'));
const Audit = lazy(() => import('./pages/Audit'));

function NotFound() {
  return (<><PageHead title="Page not found" /><p>That address does not exist. <Link to="/">Go to the overview</Link>.</p></>);
}

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const error = useStore((s) => s.error);
  useEffect(() => { void init(); }, [init]);
  return (
    <BrowserRouter>
      <Layout>
        {error && <Notice kind="err">{error}</Notice>}
        {!ready ? <p aria-busy="true">Loading local data…</p> : (
          <Suspense fallback={<p aria-busy="true">Loading…</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/suppliers/:id" element={<SupplierProfile />} />
              <Route path="/families" element={<Families />} />
              <Route path="/families/:name" element={<FamilyDetail />} />
              <Route path="/evidence" element={<EvidenceRegister />} />
              <Route path="/memos" element={<Memos />} />
              <Route path="/memos/intake" element={<Intake />} />
              <Route path="/memos/:id" element={<MemoDetail />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route path="/data" element={<Data />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/runs" element={<Runs />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        )}
      </Layout>
    </BrowserRouter>
  );
}
