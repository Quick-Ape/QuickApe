import { createRoot } from 'react-dom/client';
import { App } from '@/popup/App';
import '@/ui/ui.css';
import '@/popup/popup.css';

createRoot(document.getElementById('root')!).render(<App />);
