import { RouterProvider } from 'react-router';
import { ThemeProvider } from './theme-context';
import { Toaster } from 'sonner';
import { router } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster 
        theme="dark" 
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1f2e',
            border: '1px solid #2d3748',
            color: '#f1f5f9',
          },
        }}
      />
    </ThemeProvider>
  );
}
