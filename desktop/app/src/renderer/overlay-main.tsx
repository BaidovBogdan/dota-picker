import '@fontsource-variable/outfit';
import { createRoot } from 'react-dom/client';

import { OverlayPage } from './pages/overlay';
import './styles.css';

document.documentElement.dataset.surface = 'overlay';

const root = document.getElementById('root');
if (!root) throw new Error('Overlay root element was not found');

createRoot(root).render(<OverlayPage />);
