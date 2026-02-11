"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export type NetworkMode = "testnet" | "mainnet";

interface NetworkContextValue {
  network: NetworkMode;
  setNetwork: (mode: NetworkMode) => void;
  toggle: () => void;
}

const NetworkContext = createContext<NetworkContextValue>({
  network: "mainnet",
  setNetwork: () => { },
  toggle: () => { },
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<NetworkMode>("mainnet");

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("network-mode") as NetworkMode;
    if (saved === "testnet" || saved === "mainnet") {
      setNetworkState(saved);
    }
  }, []);

  const setNetwork = useCallback((mode: NetworkMode) => {
    setNetworkState(mode);
    localStorage.setItem("network-mode", mode);
  }, []);

  const toggle = useCallback(() => {
    setNetworkState((prev) => {
      const next = prev === "testnet" ? "mainnet" : "testnet";
      localStorage.setItem("network-mode", next);
      return next;
    });
  }, []);

  return (
    <NetworkContext.Provider value={{ network, setNetwork, toggle }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}
