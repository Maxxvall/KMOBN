
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const initialAuthenticated = (() => {
    try {
        return localStorage.getItem('kmobn:isAuthenticated') === 'true';
    } catch {
        return false;
    }
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
    <React.StrictMode>
        <App initialAuthenticated={initialAuthenticated} />
    </React.StrictMode>
);
