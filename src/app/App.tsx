import { RouterProvider } from 'react-router';
import { ThemeProvider } from './theme-context';
import { EnvironmentProvider } from '../environment-context';
import { UserProvider } from '../user-context';
import { Toaster } from 'sonner';
import { router } from './routes';

export default function App() {
  return (
    <ThemeProvider>
      <EnvironmentProvider>
        <UserProvider>
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
        </UserProvider>
      </EnvironmentProvider>
    </ThemeProvider>
  );
}

