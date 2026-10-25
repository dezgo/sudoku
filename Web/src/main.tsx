import { render } from 'preact';
import { App } from './app/App';
import './styles.css';

render(<App />, document.getElementById('app')!);

// Offline support + installability. Only in production builds: a service
// worker caching dev-server modules makes local development miserable.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
