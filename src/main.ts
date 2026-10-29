import '@fontsource/cairo/400.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/900.css';
import './styles.css';
import { App } from './app';

const app = new App();
app.start();

// Expose the app for debugging/automated checks in dev builds only.
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
