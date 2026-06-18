import { useEffect } from "react";
import { priceFeed } from "../feed/binance-ws";
import { useSimStore } from "./sim-store";

// Boots the price feed + tick loop once on mount.
export function useSimEngine() {
  useEffect(() => {
    priceFeed.start();
    const id = window.setInterval(() => {
      useSimStore.getState().tick();
    }, 500);
    // also re-render the store on price changes
    const unsub = priceFeed.subscribe(() => {
      // no-op: tick interval will pick it up
    });
    return () => {
      window.clearInterval(id);
      unsub();
    };
  }, []);
}
