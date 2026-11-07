import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { seedIfEmpty } from './app/services';
import { DocumentList } from './components/DocumentList';
import { EnvelopePage } from './components/EnvelopePage';
import { Header } from './components/Header';

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => void seedIfEmpty().then(() => setReady(true)), []);
  if (!ready) return null;
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<DocumentList />} />
        <Route path="/envelope/:id" element={<EnvelopePage />} />
      </Routes>
    </BrowserRouter>
  );
}
