import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import './index.css';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Only wrap in ClerkProvider once a publishable key exists — it throws if
// given an empty key, and local dev mode (see useCommerceUser.js) doesn't
// need it at all.
const root = (
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey}>
        <App />
      </ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>
);

createRoot(document.getElementById('root')).render(root);
