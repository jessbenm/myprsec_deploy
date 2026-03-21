import { createContext, useContext, useState } from 'react';

type Environment = string;

const EnvironmentContext = createContext<{
  environment: Environment;
  setEnvironment: (env: Environment) => void;
}>({
  environment: 'staging',
  setEnvironment: () => {},
});

export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environment, setEnvironment] = useState<Environment>('staging');
  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  return useContext(EnvironmentContext);
}