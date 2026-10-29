import './styles.css';
import { App } from './app';

const app = new App();
app.start();

// Expose the app for debugging/automated checks in dev builds only.
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
